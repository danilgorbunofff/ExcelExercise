import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { normalizeTrack } from "../packages/content/index.js";

import { lessonFiles } from "./lessons.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TRACK = JSON.parse(readFileSync(join(ROOT, "legacy/content/track.json"), "utf8"));

/** The real catalog with one entry or group swapped, so each test breaks exactly one thing. */
function track({ lessons = TRACK.lessons, groups = TRACK.groups, ...overrides } = {}) {
  return { ...TRACK, lessons, groups, ...overrides };
}

const fails = (raw, pattern, file = "track.json") => assert.throws(() => normalizeTrack(raw, file), pattern);

describe("track schema", () => {
  it("reads the real catalog", () => {
    const parsed = normalizeTrack(TRACK, "track.json");
    assert.equal(parsed.groups.length, 16);
    assert.equal(parsed.lessons.length, 88);
    assert.equal(
      parsed.lessons.filter((lesson) => !lesson.planned).length,
      lessonFiles.length,
      "the catalog marks a different number of lessons authored than there are files on disk",
    );
    assert.equal(parsed.freeLessonCount, 5);
  });

  it("marks a lesson as planned purely by the absence of an id", () => {
    const parsed = normalizeTrack(
      track({
        lessons: [{ id: "01-sum-basics", group: "sum" }, { title: "A planned drill", level: 2, group: "sum" }],
        groups: [{ id: "sum", title: "Adding things up" }],
        freeLessonCount: 1,
      }),
      "track.json",
    );
    assert.deepEqual(parsed.lessons, [
      { id: "01-sum-basics", group: "sum", planned: false },
      { title: "A planned drill", level: 2, group: "sum", planned: true },
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
    fails(track({ lessons: [{ title: "A drill", group: "sum" }] }), /lessons\[0\]\.level must be 1, 2 or 3/);
    fails(track({ lessons: [{ title: "A drill", level: 4, group: "sum" }] }), /level must be 1, 2 or 3/);
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
    fails(track({ lessons: [{ title: "A drill", level: 1, group: "sum" }], groups: [{ id: "sum", title: "Adding things up" }] }), /at least one authored entry/);
  });

  it("refuses a paywall that opens more lessons than exist", () => {
    fails(
      track({ lessons: [{ id: "01-sum-basics", group: "sum" }], groups: [{ id: "sum", title: "Adding things up" }], freeLessonCount: 2 }),
      /freeLessonCount 2 exceeds the 1 authored lessons/,
    );
  });

  it("refuses a paywall of zero", () => {
    fails(track({ freeLessonCount: 0 }), /freeLessonCount must be at least 1/);
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
