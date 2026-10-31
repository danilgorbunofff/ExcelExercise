/**
 * Flashcards, without a browser.
 *
 * Two claims are worth proving and both are pure functions: a deck contains only the lessons it was
 * asked for (which is how "never a lesson that is not complete" is enforced — the browser asks for the
 * lessons it has finished and the server answers about those and nothing else), and the schedule is a
 * deterministic transition from `(state, grade, now)` to a new state, so a card's next appearance is a
 * number the test can check rather than a date the test has to wait for.
 *
 * `e2e/flashcards.spec.js` covers the part that is only true in a browser: space flips, an arrow grades,
 * and a reload remembers what was graded.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseProgress } from "../legacy/src/client/state.js";
import { CARD_CAP, buildDeck, cardFor, firstSentence } from "../lib/retention/cards.js";
import {
  DECK_KEY,
  DECK_VERSION,
  GRADES,
  SESSION_CAP,
  completedLessons,
  deckStatus,
  gradeCard,
  isDue,
  newState,
  parseDeck,
  previewDays,
  queue,
  serializeDeck,
} from "../lib/retention/flashcards.js";

import { loadSite } from "../lib/site.js";

const { index } = loadSite();

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 5, 9, 0, 0);

/** A hand-built index: the real one is 85 lessons and this only needs the shapes. */
function fakeIndex() {
  return [
    {
      number: 1,
      exercise: {
        id: "L1",
        title: "First",
        docs: { syntax: "=A1", reference: "=1", explain: "The first lesson explains itself in one sentence. Then it keeps going." },
        screens: [
          { id: "s1", type: "formula", prompt: "Do the thing", grid: { rows: [["A", "B"]] }, expect: { value: "=1" } },
          { id: "s2", type: "chord", prompt: "Play it", expect: { value: "C-E-G" } },
          { id: "s3", type: "sequence", prompt: "Order it", expect: { value: "1,2,3" } },
        ],
      },
    },
    {
      number: 2,
      exercise: {
        id: "L2",
        title: "Second",
        docs: { explain: "" },
        screens: [
          { id: "p1", type: "picture", prompt: "Which cell?", image: "/assets/img/diagram.png", alt: "A sheet", expect: { value: "B4" } },
        ],
      },
    },
    {
      number: 3,
      exercise: {
        id: "L3",
        title: "Third",
        docs: { explain: "Only one line." },
        screens: [{ id: "w1", type: "workbook", prompt: "Build it", expect: { value: "B4" } }],
      },
    },
  ];
}

describe("firstSentence", () => {
  it("takes the first sentence and drops the rest", () => {
    assert.equal(firstSentence("A sentence. A second one."), "A sentence.");
  });

  it("shortens a long sentence at a word boundary", () => {
    const long = `${"word ".repeat(60)}end.`;
    const one = firstSentence(long, { max: 40 });
    assert.ok(one.endsWith("…"));
    assert.ok(one.length <= 41);
    assert.ok(!one.includes("  "));
  });

  it("is empty for anything that is not a string", () => {
    assert.equal(firstSentence(null), "");
    assert.equal(firstSentence(undefined), "");
    assert.equal(firstSentence(42), "");
  });
});

describe("cardFor", () => {
  it("puts the prompt and the sheet in front, the formula and one line behind", () => {
    const [entry] = fakeIndex();
    const card = cardFor({ lessonId: "L1", lesson: entry.exercise, screen: entry.exercise.screens[0], number: 1 });
    assert.equal(card.key, "L1#s1");
    assert.equal(card.prompt, "Do the thing");
    assert.deepEqual(card.grid, { rows: [["A", "B"]] });
    assert.equal(card.answer, "=1");
    assert.equal(card.explain, "The first lesson explains itself in one sentence.");
    assert.equal(card.lessonNumber, 1);
  });

  it("rewrites an image to the served path", () => {
    const card = cardFor({
      lessonId: "L2",
      lesson: fakeIndex()[1].exercise,
      screen: { id: "p1", type: "picture", prompt: "Which cell?", image: "/assets/img/diagram.png", expect: { value: "B4" } },
    });
    assert.equal(card.image, "/assets/img/diagram.png");
  });

  it("is null without a screen", () => {
    assert.equal(cardFor({ lessonId: "L1", lesson: fakeIndex()[0].exercise, screen: null }), null);
  });
});

describe("buildDeck", () => {
  it("renders only the lessons it is asked for", () => {
    const deck = buildDeck(fakeIndex(), ["L2"]);
    assert.deepEqual(deck.map((card) => card.key), ["L2#p1"]);
  });

  it("drops an id that is no longer in the content", () => {
    assert.deepEqual(buildDeck(fakeIndex(), ["gone"]), []);
    assert.deepEqual(buildDeck(fakeIndex(), ["gone", "L1"]).map((card) => card.key), ["L1#s1"]);
  });

  it("skips screen types a card cannot carry", () => {
    const keys = buildDeck(fakeIndex(), ["L1", "L3"]).map((card) => card.key);
    assert.deepEqual(keys, ["L1#s1"]);
  });

  it("does not repeat a lesson asked for twice", () => {
    assert.deepEqual(buildDeck(fakeIndex(), ["L1", "L1"]).map((card) => card.key), ["L1#s1"]);
  });

  it("stops at the cap", () => {
    assert.equal(buildDeck(fakeIndex(), ["L1", "L2", "L1"], { cap: 1 }).length, 1);
    assert.equal(CARD_CAP, 60);
  });

  it("builds real cards for a real lesson, each with an answer", () => {
    const lesson = index.find((entry) => entry.exercise.id === "27-what-a-formula-actually-does");
    const deck = buildDeck(index, [lesson.exercise.id]);
    assert.equal(deck.length, 1);
    assert.equal(deck[0].lessonNumber, lesson.number);
    assert.ok(deck[0].answer.length > 0);
    assert.ok(deck[0].explain.length > 0);
  });

  it("is empty for no lessons, which is a learner with nothing finished", () => {
    assert.deepEqual(buildDeck(index, []), []);
    assert.deepEqual(buildDeck(index, null), []);
  });
});

describe("completedLessons", () => {
  it("reads the lessons a browser marked done, newest first", () => {
    const text = JSON.stringify({
      v: 1,
      done: {
        "27-what-a-formula-actually-does": { at: "2026-11-01T10:00:00.000Z", tries: 2 },
        "28-cell-references-relative-and-absolute": { at: "2026-11-04T10:00:00.000Z", tries: 1 },
      },
      tries: {},
      unlocked: true,
    });
    assert.deepEqual(completedLessons(parseProgress(text)), [
      "28-cell-references-relative-and-absolute",
      "27-what-a-formula-actually-does",
    ]);
  });

  it("treats storage it cannot read as nothing finished", () => {
    assert.deepEqual(completedLessons(parseProgress("not json")), []);
    assert.deepEqual(completedLessons(parseProgress("")), []);
    assert.deepEqual(completedLessons(null), []);
    assert.deepEqual(completedLessons({}), []);
  });

  it("ignores a completion with no date, because a date is what makes it one", () => {
    const text = JSON.stringify({ v: 1, done: { ok: { at: "2026-11-01T10:00:00.000Z" }, bad: { tries: 1 } } });
    assert.deepEqual(completedLessons(parseProgress(text)), ["ok"]);
  });

  it("feeds a deck with only finished lessons", () => {
    const text = JSON.stringify({ v: 1, done: { "27-what-a-formula-actually-does": { at: "2026-11-01T10:00:00.000Z" } } });
    const deck = buildDeck(index, completedLessons(parseProgress(text)));
    assert.equal(deck.length, 1);
    assert.equal(deck[0].lessonId, "27-what-a-formula-actually-does");
    assert.ok(!deck.some((card) => card.lessonId === "28-cell-references-relative-and-absolute"));
  });
});

describe("gradeCard", () => {
  it("starts a new card due now", () => {
    const state = newState();
    assert.equal(state.reps, 0);
    assert.ok(isDue(state, NOW));
  });

  it("brings an `again` card back immediately and drops the ease", () => {
    const state = gradeCard({ ...newState(), ease: 2.5 }, "again", NOW);
    assert.equal(state.interval, 0);
    assert.equal(state.due, NOW);
    assert.equal(state.reps, 0);
    assert.equal(state.lapses, 1);
    assert.equal(Math.round(state.ease * 100) / 100, 2.3);
  });

  it("walks 1 day, 3 days, then interval × ease for `good`", () => {
    const first = gradeCard(newState(), "good", NOW);
    assert.equal(first.interval, 1);
    assert.equal(first.due, NOW + DAY);
    const second = gradeCard(first, "good", NOW + DAY);
    assert.equal(second.interval, 3);
    const third = gradeCard(second, "good", NOW + 4 * DAY);
    assert.equal(third.interval, Math.round(3 * second.ease));
    assert.ok(third.interval > 3);
  });

  it("takes a bigger first step for `easy` and a smaller one for `hard`", () => {
    assert.equal(gradeCard(newState(), "easy", NOW).interval, 2);
    assert.equal(gradeCard(newState(), "hard", NOW).interval, 1);
  });

  it("does not move the ease outside its bounds", () => {
    let low = newState();
    for (let i = 0; i < 20; i += 1) low = gradeCard(low, "again", NOW);
    assert.equal(low.ease, 1.3);
    let high = newState();
    for (let i = 0; i < 20; i += 1) high = gradeCard(high, "easy", NOW);
    assert.equal(high.ease, 3.5);
  });

  it("never schedules beyond a year", () => {
    let state = newState();
    for (let i = 0; i < 12; i += 1) state = gradeCard(state, "easy", NOW + i * DAY);
    assert.equal(state.interval, 365);
  });

  it("treats an unknown grade as `good` rather than losing the card", () => {
    assert.deepEqual(gradeCard(newState(), "nonsense", NOW), gradeCard(newState(), "good", NOW));
  });

  it("does not mutate the state it was given", () => {
    const before = newState();
    const copy = { ...before };
    gradeCard(before, "easy", NOW);
    assert.deepEqual(before, copy);
  });

  it("survives a corrupt state", () => {
    const state = gradeCard({ ease: "x", reps: null }, "good", NOW);
    assert.equal(state.interval, 1);
    assert.ok(Number.isFinite(state.due));
  });

  it("previews the same interval the grade would schedule", () => {
    const state = newState();
    for (const what of GRADES) {
      assert.equal(previewDays(state, what), gradeCard(state, what, 0).interval);
    }
  });
});

describe("queue", () => {
  const cards = [{ key: "a" }, { key: "b" }, { key: "c" }];

  it("puts due cards before unseen ones, oldest first", () => {
    const schedules = {
      a: { due: NOW - DAY },
      b: { due: NOW - 3 * DAY },
      c: undefined,
    };
    const drawn = queue(cards, schedules, NOW);
    assert.deepEqual(drawn.map((card) => card.key), ["b", "a", "c"]);
  });

  it("leaves a card that is not due yet out of the session", () => {
    const drawn = queue(cards, { a: { due: NOW + DAY }, b: { due: NOW + DAY }, c: { due: NOW + DAY } }, NOW);
    assert.deepEqual(drawn, []);
  });

  it("brings an `again` card back in the next session, not this one", () => {
    const graded = gradeCard(newState(), "again", NOW);
    const drawn = queue([{ key: "a" }], { a: graded }, NOW);
    assert.equal(drawn.length, 1);
    // and it is not the same card twice inside one session: the queue is drawn once.
    assert.equal(drawn.filter((card) => card.key === "a").length, 1);
  });

  it("stops at the session cap", () => {
    assert.equal(queue(cards, {}, NOW, { limit: 2 }).length, 2);
    assert.equal(SESSION_CAP, 20);
  });

  it("is empty for an empty deck", () => {
    assert.deepEqual(queue([], {}, NOW), []);
    assert.deepEqual(queue(null, null, NOW), []);
  });
});

describe("deckStatus", () => {
  const cards = [{ key: "a" }, { key: "b" }, { key: "c" }];

  it("counts due, unseen and total, and names the next date", () => {
    const status = deckStatus(cards, { a: { due: NOW - DAY }, b: { due: NOW + 2 * DAY } }, NOW);
    assert.deepEqual(status, { due: 1, fresh: 1, total: 3, nextDue: NOW + 2 * DAY });
  });

  it("has no next date when nothing is scheduled", () => {
    assert.deepEqual(deckStatus(cards, {}, NOW), { due: 0, fresh: 3, total: 3, nextDue: null });
  });
});

describe("the saved deck", () => {
  it("round-trips", () => {
    const state = gradeCard(newState(), "good", NOW);
    const text = serializeDeck({ cards: { "L1#s1": state } });
    assert.deepEqual(parseDeck(text).cards["L1#s1"], state);
  });

  it("keeps the key and version it was written with", () => {
    assert.equal(DECK_KEY, "es.flashcards");
    assert.equal(DECK_VERSION, 1);
    assert.equal(parseDeck("").v, 1);
  });

  it("reads garbage as an empty deck", () => {
    assert.deepEqual(parseDeck("not json").cards, {});
    assert.deepEqual(parseDeck("[]").cards, {});
    assert.deepEqual(parseDeck(null).cards, {});
    assert.deepEqual(parseDeck(JSON.stringify({ cards: [] })).cards, {});
  });

  it("drops an entry that is not a card key or has no due date", () => {
    const text = JSON.stringify({
      cards: {
        "L1#s1": { ease: 2.5, reps: 1, interval: 3, due: NOW },
        "no-separator": { due: NOW },
        "L1#s2": { ease: 2.5 },
        "L1#s3": "nonsense",
      },
    });
    assert.deepEqual(Object.keys(parseDeck(text).cards), ["L1#s1"]);
  });

  it("clamps a hand-edited state instead of trusting it", () => {
    const text = JSON.stringify({ cards: { "L1#s1": { ease: 99, reps: -4, interval: 9999, due: NOW, lapses: -2 } } });
    const state = parseDeck(text).cards["L1#s1"];
    assert.equal(state.ease, 3.5);
    assert.equal(state.reps, 0);
    assert.equal(state.lapses, 0);
    assert.equal(state.interval, 365);
  });
});
