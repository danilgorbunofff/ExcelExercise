import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { normalizeTrack } from "../packages/content/index.js";

import { lessonFiles } from "./lessons.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TRACK = JSON.parse(readFileSync(join(ROOT, "legacy/content/track.json"), "utf8"));

/**
 * The real catalog with one entry or group swapped, so each test breaks exactly one thing. Swapping the
 * lessons means the shipped `freeLessons` and `promptLesson` no longer name anything in it, so those
 * follow the swap unless a test names them: otherwise every fixture would fail on a dangling id before
 * reaching the rule it is actually about.
 */
function track({ lessons = TRACK.lessons, groups = TRACK.groups, freeLessons, promptLesson, ...overrides } = {}) {
  const swapped = lessons !== TRACK.lessons;
  const authored = lessons.filter((lesson) => lesson && typeof lesson === "object" && lesson.id).map((lesson) => lesson.id);
  return {
    ...TRACK,
    lessons,
    groups,
    freeLessons: freeLessons ?? (swapped ? authored.slice(0, 1) : TRACK.freeLessons),
    promptLesson: promptLesson ?? (swapped ? null : TRACK.promptLesson),
    ...overrides,
  };
}

const fails = (raw, pattern, file = "track.json") => assert.throws(() => normalizeTrack(raw, file), pattern);

describe("track schema", () => {
  it("reads the real catalog", () => {
    const parsed = normalizeTrack(TRACK, "track.json");
    assert.equal(parsed.groups.length, 16);
    assert.equal(parsed.lessons.length, 86);
    assert.equal(
      parsed.lessons.filter((lesson) => !lesson.planned).length,
      lessonFiles.length,
      "the catalog marks a different number of lessons authored than there are files on disk",
    );
    assert.equal(parsed.freeLessons.length, 10);
    assert.equal(parsed.freeLessonCount, parsed.freeLessons.length, "the count is derived from the list");
  });

  it("marks a lesson as planned purely by the absence of an id", () => {
    const parsed = normalizeTrack(
      track({
        lessons: [{ id: "01-sum-basics", group: "sum" }, { title: "A planned exercise", level: 2, group: "sum" }],
        groups: [{ id: "sum", title: "Adding things up" }],
        freeLessons: ["01-sum-basics"],
      }),
      "track.json",
    );
    assert.deepEqual(parsed.lessons, [
      { id: "01-sum-basics", group: "sum", planned: false },
      { title: "A planned exercise", level: 2, group: "sum", planned: true },
    ]);
  });

  it("refuses an entry that is neither shape", () => {
    fails(track({ lessons: ["01-sum-basics"] }), /lessons\[0\] must be an object — \{ id \}/);
    fails(track({ lessons: [null] }), /lessons\[0\] must be an object/);
  });

  it("refuses an authored entry that also carries a title, because the file is the record", () => {
    fails(track({ lessons: [{ id: "01-sum-basics", title: "Sum basics", group: "sum" }] }), /both an id and a title/);
  });

  it("refuses a level on an authored entry", () => {
    fails(track({ lessons: [{ id: "01-sum-basics", level: 1, group: "sum" }] }), /level is read from the lesson file/);
  });

  it("refuses a planned entry with no usable level", () => {
    fails(track({ lessons: [{ title: "An exercise", group: "sum" }] }), /lessons\[0\]\.level must be 1, 2 or 3/);
    fails(track({ lessons: [{ title: "An exercise", level: 4, group: "sum" }] }), /level must be 1, 2 or 3/);
  });

  it("refuses an entry filed under a group the track does not have", () => {
    fails(track({ lessons: [{ id: "01-sum-basics", group: "pivot" }] }), /"pivot" is not one of this track's groups/);
  });

  it("refuses a duplicate group id", () => {
    fails(
      track({ groups: [...TRACK.groups, { id: "sum", title: "Adding, again" }], lessons: [{ id: "01-sum-basics", group: "sum" }] }),
      /groups\[16\]\.id "sum" is a duplicate/,
    );
  });

  it("refuses a group that holds nothing", () => {
    fails(
      track({ groups: [...TRACK.groups, { id: "pivot", title: "Pivot tables" }] }),
      /group "pivot" has no lessons/,
    );
  });

  it("refuses a catalog with nothing published", () => {
    fails(track({ lessons: [{ title: "An exercise", level: 1, group: "sum" }], groups: [{ id: "sum", title: "Adding things up" }] }), /at least one authored entry/);
  });

  it("refuses a free lesson the catalog does not have", () => {
    fails(track({ freeLessons: ["01-sum-basics", "11-missing"] }), /freeLessons\[1\] "11-missing" is not an authored lesson/);
  });

  it("refuses the same lesson listed free twice", () => {
    fails(track({ freeLessons: ["01-sum-basics", "01-sum-basics"] }), /freeLessons\[1\] "01-sum-basics" is listed twice/);
  });

  it("refuses a paywall of zero", () => {
    fails(track({ freeLessons: [] }), /freeLessons must list at least one lesson id/);
  });

  it("refuses a free list longer than the catalog", () => {
    const ids = TRACK.lessons.filter((lesson) => lesson.id).map((lesson) => lesson.id);
    fails(
      track({
        lessons: [{ id: "01-sum-basics", group: "sum" }],
        groups: [{ id: "sum", title: "Adding things up" }],
        freeLessons: ["01-sum-basics", "02-average-scores"],
      }),
      /freeLessons\[1\] "02-average-scores" is not an authored lesson/,
    );
    assert.ok(ids.length > 10, "the real catalog is longer than the free list it ships");
  });

  it("refuses the old positional paywall", () => {
    fails(track({ freeLessonCount: 3 }), /freeLessonCount is gone/);
  });

  it("refuses a prompt lesson that is already free", () => {
    fails(track({ promptLesson: TRACK.freeLessons[0] }), /promptLesson .* is already free/);
  });

  it("refuses a prompt lesson that is not in the catalog", () => {
    fails(track({ promptLesson: "11-missing" }), /promptLesson "11-missing" is not an authored lesson/);
  });

  it("reads how many misses open the answer, and defaults it to three", () => {
    assert.equal(normalizeTrack(TRACK, "track.json").showAnswerAfter, 3);
    assert.equal(normalizeTrack(track({ showAnswerAfter: 5 }), "track.json").showAnswerAfter, 5);
    // A track file written before the player could read the field still loads, at the number the
    // page's copy was written around.
    const { showAnswerAfter, ...legacy } = TRACK;
    assert.equal(normalizeTrack(legacy, "track.json").showAnswerAfter, 3);
  });

  it("refuses a reveal threshold the player could not honour", () => {
    // Zero would open the answer before the first attempt, and the page counts down in prose.
    fails(track({ showAnswerAfter: 0 }), /showAnswerAfter must be an integer from 1 to 10/);
    fails(track({ showAnswerAfter: 2.5 }), /showAnswerAfter must be an integer from 1 to 10/);
    fails(track({ showAnswerAfter: "3" }), /showAnswerAfter must be an integer from 1 to 10/);
    fails(track({ showAnswerAfter: 11 }), /showAnswerAfter must be an integer from 1 to 10/);
  });

  it("takes an intro as paragraphs and rejects a wall of text", () => {
    const intro = "Adding things up. ".repeat(120);
    fails(
      track({ groups: TRACK.groups.map((group) => (group.id === "sum" ? { ...group, intro } : group)) }),
      /groups\[1\]\.intro is \d+ characters, limit is 1800/,
    );
  });
});
