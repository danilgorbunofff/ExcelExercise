/**
 * The daily challenge, without a database.
 *
 * What is proven here is everything that must be *deterministic*: the draw is the same for a day in
 * every process (no cron, no stored seed), the ten screens spread across lessons rather than piling up
 * on the lesson with the most screens, the payload the browser receives carries no answer, and the
 * verdict comes from the same grader the drills use.
 *
 * `tests/db/challenge.spec.js` proves the other half — one challenge per day, one attempt per learner,
 * the first verdict standing — against a real Postgres.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ACTIVITY_WINDOW_DAYS,
  CHALLENGE_CAP_MS,
  CHALLENGE_CAP_SECONDS,
  CHALLENGE_SIZE,
  CHALLENGE_TOPICS,
  challengeSpec,
  decodeScreens,
  eligibleScreen,
  gradeScreen,
  groupWeights,
  hashSeed,
  msLeft,
  parseScreenKey,
  pickScreens,
  sampleTopics,
  screenKey,
  screenPayload,
  seededRandom,
  shapeAttempt,
} from "../lib/retention/challenge.js";

import { loadSite } from "../lib/site.js";

const { index } = loadSite();

// Two authored screens used as the grading fixtures: one formula, one picture. Read from content
// rather than written here, because a test that restates a lesson is a test of its own copy.
const FORMULA_LESSON = index.find((entry) => entry.exercise.id === "27-what-a-formula-actually-does").exercise;
const FORMULA_SCREEN = FORMULA_LESSON.screens.find((screen) => screen.type === "formula");
const PICTURE_LESSON = index.find(
  (entry) => entry.exercise.id === "11-vlookup-approximate-match-needs-a-sorted-column",
).exercise;
const PICTURE_SCREEN = PICTURE_LESSON.screens.find((screen) => screen.type === "picture");

const DAY = "2026-11-05";

/** 120 consecutive days, so a distribution assertion is over fixed seeds rather than one lucky day. */
const DAYS = Array.from({ length: 120 }, (_, i) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10));

describe("the shape of a challenge", () => {
  it("is ten screens drawn from five topics inside fifteen minutes", () => {
    assert.equal(CHALLENGE_SIZE, 10);
    assert.equal(CHALLENGE_TOPICS, 5);
    assert.equal(CHALLENGE_CAP_SECONDS, 900);
    assert.equal(CHALLENGE_CAP_MS, 900_000);
    assert.equal(ACTIVITY_WINDOW_DAYS, 7);
  });

  it("asks only for screens one typed answer can settle", () => {
    assert.equal(eligibleScreen({ type: "formula" }), true);
    assert.equal(eligibleScreen({ type: "picture" }), true);
    for (const type of ["chord", "sequence", "workbook"]) assert.equal(eligibleScreen({ type }), false);
    assert.equal(eligibleScreen(null), false);
  });
});

describe("the screen key", () => {
  it("round-trips a lesson and screen id", () => {
    const key = screenKey("27-what-a-formula-actually-does", "formula-1");
    assert.equal(key, "27-what-a-formula-actually-does#formula-1");
    assert.deepEqual(parseScreenKey(key), {
      lessonId: "27-what-a-formula-actually-does",
      screenId: "formula-1",
    });
  });

  it("refuses a key that names no lesson or no screen", () => {
    for (const key of ["", "#formula-1", "27-lesson#", "27-lesson", null, undefined, 42]) {
      assert.equal(parseScreenKey(key), null);
    }
  });
});

describe("the day seed", () => {
  it("gives the same number for the same day, and a different one for a different day", () => {
    assert.equal(hashSeed(DAY), hashSeed(DAY));
    assert.notEqual(hashSeed("2026-11-05"), hashSeed("2026-11-06"));
    assert.ok(Number.isInteger(hashSeed(DAY)) && hashSeed(DAY) >= 0 && hashSeed(DAY) < 2 ** 32);
  });

  it("produces a generator that stays in [0, 1) and repeats for a seed", () => {
    const first = seededRandom(hashSeed(DAY));
    const second = seededRandom(hashSeed(DAY));
    for (let i = 0; i < 50; i += 1) {
      const value = first();
      assert.ok(value >= 0 && value < 1, `value out of range: ${value}`);
      assert.equal(value, second());
    }
    assert.notEqual(seededRandom(hashSeed(DAY))(), seededRandom(hashSeed("2026-11-06"))());
  });
});

describe("the topic draw", () => {
  it("weights every group by its activity plus one", () => {
    const activity = index
      .filter((entry) => entry.group === "sum")
      .map((entry) => ({ lesson_id: entry.exercise.id, screens: 3 }));
    const weights = groupWeights(index, activity);
    const sumLessons = index.filter((entry) => entry.group === "sum").length;

    assert.equal(weights.get("sum"), 1 + sumLessons * 3);
    for (const [group, weight] of weights) {
      if (group !== "sum") assert.equal(weight, 1, `${group} should be at its floor of one`);
    }
    // No activity at all is not "no topics": every group still weighs something.
    for (const weight of groupWeights(index, []).values()) assert.equal(weight, 1);
    for (const weight of groupWeights(index, null).values()) assert.equal(weight, 1);
  });

  it("draws five distinct live groups for a day, and the same five every time", () => {
    const drawn = sampleTopics({ index, activity: [], day: DAY });
    assert.equal(drawn.length, CHALLENGE_TOPICS);
    assert.equal(new Set(drawn).size, CHALLENGE_TOPICS);
    const groups = new Set(index.map((entry) => entry.group));
    for (const id of drawn) assert.ok(groups.has(id), `${id} is not a group in the index`);
    assert.deepEqual(sampleTopics({ index, activity: [], day: DAY }), drawn);
  });

  it("draws a different five on another day", () => {
    const perDay = new Set(DAYS.map((day) => sampleTopics({ index, activity: [], day }).join(",")));
    assert.ok(perDay.size > 1, "the draw should move with the day");
  });

  it("follows the activity it is given", () => {
    const hot = index
      .filter((entry) => entry.group === "sum")
      .map((entry) => ({ lesson_id: entry.exercise.id, screens: 4000 }));
    let coldHits = 0;
    let hotHits = 0;
    for (const day of DAYS) {
      if (sampleTopics({ index, activity: [], day }).includes("sum")) coldHits += 1;
      if (sampleTopics({ index, activity: hot, day }).includes("sum")) hotHits += 1;
    }
    assert.ok(hotHits > coldHits * 2, `a busy group should dominate the draw: cold ${coldHits}, hot ${hotHits}`);
  });

  it("stops at the number of groups there are", () => {
    const drawn = sampleTopics({ index, activity: [], day: DAY, count: 999 });
    assert.equal(drawn.length, new Set(index.map((entry) => entry.group)).size);
    assert.equal(new Set(drawn).size, drawn.length);
  });
});

describe("the screen draw", () => {
  it("takes one screen from every lesson before a second from any", () => {
    const topics = sampleTopics({ index, activity: [], day: DAY });
    const keys = pickScreens({ index, topics, day: DAY });
    assert.equal(keys.length, CHALLENGE_SIZE);
    assert.equal(new Set(keys).size, CHALLENGE_SIZE, "no screen is asked twice");

    const perLesson = new Map();
    for (const key of keys) {
      const { lessonId } = parseScreenKey(key);
      perLesson.set(lessonId, (perLesson.get(lessonId) ?? 0) + 1);
    }
    const eligibleLessons = index.filter(
      (entry) => topics.includes(entry.group) && entry.exercise.screens.some(eligibleScreen),
    );
    assert.ok(eligibleLessons.length >= CHALLENGE_SIZE, "the fixtures should allow one lesson per screen");
    for (const [lessonId, count] of perLesson) assert.equal(count, 1, `${lessonId} was asked ${count} times`);
  });

  it("is the same ten screens for the same day, and moves with the day", () => {
    const draw = (day) => pickScreens({ index, topics: sampleTopics({ index, activity: [], day }), day });
    assert.deepEqual(draw(DAY), draw(DAY));
    assert.notDeepEqual(draw("2026-11-05"), draw("2026-11-06"));
  });

  it("returns nothing rather than looping when the topics hold no eligible screens", () => {
    assert.deepEqual(pickScreens({ index, topics: ["no-such-group"], day: DAY }), []);
  });

  it("returns a short challenge rather than looping when the catalog is smaller than the request", () => {
    const topics = sampleTopics({ index, activity: [], day: DAY });
    const keys = pickScreens({ index, topics, day: DAY, count: 10_000 });
    const eligible = index
      .filter((entry) => topics.includes(entry.group))
      .reduce((sum, entry) => sum + entry.exercise.screens.filter(eligibleScreen).length, 0);
    assert.equal(keys.length, eligible);
  });
});

describe("the whole day's spec", () => {
  it("names the topics it actually took screens from", () => {
    const spec = challengeSpec({ index, activity: [], day: DAY });
    assert.equal(spec.screens.length, CHALLENGE_SIZE);
    const asked = new Set(spec.screens.map((key) => parseScreenKey(key).lessonId));
    const groupsAsked = new Set(index.filter((entry) => asked.has(entry.exercise.id)).map((entry) => entry.group));
    for (const group of groupsAsked) assert.ok(spec.topics.includes(group), `${group} was asked without being a topic`);
    assert.ok(groupsAsked.size >= 4, "ten screens across five topics should reach most of them");
  });

  it("is reproducible, which is what lets a race at midnight settle by insert", () => {
    assert.deepEqual(challengeSpec({ index, activity: [], day: DAY }), challengeSpec({ index, activity: [], day: DAY }));
  });
});

describe("what the browser is allowed to see", () => {
  it("carries no answer, no reference and no hint", () => {
    const payload = screenPayload({ lessonId: FORMULA_LESSON.id, lesson: FORMULA_LESSON, screen: FORMULA_SCREEN });
    for (const forbidden of ["expect", "answers", "reference", "hints", "fixtures", "require", "requireRef"]) {
      assert.equal(forbidden in payload, false, `${forbidden} must not reach the browser`);
    }
    assert.equal(payload.key, screenKey(FORMULA_LESSON.id, FORMULA_SCREEN.id));
    assert.equal(payload.prompt, FORMULA_SCREEN.prompt);
    assert.deepEqual(payload.grid, FORMULA_SCREEN.grid);
    assert.equal(payload.answerCell, "B5");
    assert.equal(payload.type, "formula");
    assert.equal(payload.lessonTitle, FORMULA_LESSON.title);
  });

  it("serves the picture screen's image from the app's asset path", () => {
    const payload = screenPayload({ lessonId: PICTURE_LESSON.id, lesson: PICTURE_LESSON, screen: PICTURE_SCREEN });
    assert.equal(payload.image, `/assets/img/${PICTURE_SCREEN.image.split("/").pop()}`);
    assert.ok(payload.image.startsWith("/assets/img/"));
    assert.equal("answers" in payload, false);
  });
});

describe("resolving stored keys back to content", () => {
  it("finds the lesson and screen a key names", () => {
    const key = screenKey(FORMULA_LESSON.id, FORMULA_SCREEN.id);
    const [found] = decodeScreens(index, [key]);
    assert.equal(found.lesson.id, FORMULA_LESSON.id);
    assert.equal(found.screen.id, FORMULA_SCREEN.id);
    assert.equal(found.lessonId, FORMULA_LESSON.id);
  });

  it("drops keys that content no longer holds, rather than failing the run", () => {
    const good = screenKey(FORMULA_LESSON.id, FORMULA_SCREEN.id);
    const decoded = decodeScreens(index, [
      good,
      "no-such-lesson#formula-1",
      screenKey(FORMULA_LESSON.id, "no-such-screen"),
      "not-a-key",
    ]);
    assert.equal(decoded.length, 1);
    assert.equal(decoded[0].screen.id, FORMULA_SCREEN.id);
    assert.deepEqual(decodeScreens(index, null), []);
  });
});

describe("the server's verdict", () => {
  it("accepts the reference formula and rejects a correct-but-wrong-method one", () => {
    const right = gradeScreen(FORMULA_LESSON, FORMULA_SCREEN, "=SUM(B2:B4)");
    assert.equal(right.ok, true);
    assert.equal(right.rule, "correct");
    assert.equal(right.expected, "=SUM(B2:B4)");

    const wrong = gradeScreen(FORMULA_LESSON, FORMULA_SCREEN, "=B2+B3+B4");
    assert.equal(wrong.ok, false);
    assert.equal(wrong.rule, "func-sum");
    assert.match(wrong.message, /SUM/);
    assert.equal(wrong.expected, "=SUM(B2:B4)", "the reveal comes back with the verdict");
  });

  it("grades a picture screen with the list grader", () => {
    assert.equal(gradeScreen(PICTURE_LESSON, PICTURE_SCREEN, "B4").ok, true);
    const wrong = gradeScreen(PICTURE_LESSON, PICTURE_SCREEN, "B5");
    assert.equal(wrong.ok, false);
    assert.equal(wrong.expected, "B4");
  });

  it("calls an empty answer empty instead of asking the grader about it", () => {
    for (const value of ["", "   ", null, undefined, 42]) {
      const verdict = gradeScreen(FORMULA_LESSON, FORMULA_SCREEN, value);
      assert.equal(verdict.ok, false);
      assert.equal(verdict.rule, "empty");
    }
  });
});

describe("the run clock", () => {
  const startedAt = "2026-11-05T10:00:00.000Z";
  const at = (ms) => new Date(Date.parse(startedAt) + ms).toISOString();

  it("counts down from fifteen minutes and never goes negative", () => {
    assert.equal(msLeft(startedAt, { now: Date.parse(at(0)) }), CHALLENGE_CAP_MS);
    assert.equal(msLeft(startedAt, { now: Date.parse(at(60_000)) }), CHALLENGE_CAP_MS - 60_000);
    assert.equal(msLeft(startedAt, { now: Date.parse(at(CHALLENGE_CAP_MS)) }), 0);
    assert.equal(msLeft(startedAt, { now: Date.parse(at(CHALLENGE_CAP_MS * 5)) }), 0);
  });

  it("treats an unknown start as a full run", () => {
    for (const value of [null, undefined, "", "not a date"]) assert.equal(msLeft(value), CHALLENGE_CAP_MS);
  });
});

describe("an attempt in page shape", () => {
  it("renames the stored columns and defaults what a fresh run has not got", () => {
    const shaped = shapeAttempt({
      id: "0f7b",
      started_at: "2026-11-05T10:00:00.000Z",
      finished_at: null,
      answered: 3,
      correct: 2,
      accuracy: null,
      ms: null,
      created: true,
    });
    assert.deepEqual(shaped, {
      id: "0f7b",
      startedAt: "2026-11-05T10:00:00.000Z",
      finishedAt: null,
      answered: 3,
      correct: 2,
      accuracy: null,
      ms: null,
      created: true,
    });
  });

  it("survives a row that is not there", () => {
    assert.deepEqual(shapeAttempt(null), {
      id: null,
      startedAt: null,
      finishedAt: null,
      answered: 0,
      correct: 0,
      accuracy: null,
      ms: null,
      created: false,
    });
  });
});
