/**
 * The migration path's reading of a signed-out learner's record.
 *
 * The failures worth pinning are the ones that write a plausible wrong row: a completion whose date is
 * unreadable becoming "completed today", a `tries` count silently becoming screen visits, an unknown
 * shape migrating as an empty success, or a lesson listed twice so the merge counts it twice.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MAX_LESSONS, localLessons, parseMigration } from "../lib/progress/migrate.js";

const AT = "2026-01-01T00:00:00.000Z";
const BATCH = "8f0d1a2e-4b3c-4d5e-8f90-1a2b3c4d5e6f";

describe("localLessons", () => {
  it("reads a completion with its date, its help flag, and no invented counts", () => {
    const { ok, lessons } = localLessons({
      v: 1,
      done: { "01-sum-basics": { at: AT, tries: 3, helped: true } },
      tries: {},
      unlocked: false,
    });
    assert.equal(ok, true);
    assert.deepEqual(lessons, [{ lesson_id: "01-sum-basics", completed_at: AT, helped: true, score: 0 }]);
  });

  it("sends a lesson that was only started as in progress, without a count", () => {
    const { lessons } = localLessons({ v: 1, done: {}, tries: { "02-average-scores": 2 } });
    assert.deepEqual(lessons, [{ lesson_id: "02-average-scores", completed_at: null, helped: false, score: 0 }]);
  });

  it("lists a lesson once, even when it is both finished and tried", () => {
    const { lessons } = localLessons({
      done: { "01-sum-basics": { at: AT, tries: 1, helped: false } },
      tries: { "01-sum-basics": 4 },
    });
    assert.equal(lessons.length, 1);
    assert.equal(lessons[0].completed_at, AT);
  });

  it("does not turn an unreadable completion date into today", () => {
    const { lessons } = localLessons({ done: { "01-sum-basics": { at: "not a date", helped: false } }, tries: {} });
    assert.equal(lessons[0].completed_at, null);
  });

  it("ignores zero and non-numeric tries, and entries with no id", () => {
    const { lessons } = localLessons({ done: {}, tries: { "01-sum-basics": 0, "02-average-scores": -1, "": 3, x: NaN } });
    assert.deepEqual(lessons, []);
  });

  it("refuses a shape that is not a progress record", () => {
    for (const bad of [null, [], "es.progress", 42]) {
      assert.equal(localLessons(bad).ok, false);
    }
    assert.deepEqual(localLessons({}).lessons, []);
    assert.deepEqual(localLessons({ done: [], tries: "nope" }).lessons, []);
  });

  it("bounds the list", () => {
    const done = {};
    for (let i = 0; i < MAX_LESSONS + 1; i += 1) done[`lesson-${i}`] = { at: AT };
    assert.match(localLessons({ done }).error, /at most/);
  });
});

describe("parseMigration", () => {
  const lesson = { lesson_id: "01-sum-basics", completed_at: AT, helped: true, score: 40 };

  it("accepts the payload the browser builds", () => {
    const parsed = parseMigration({ batch_id: BATCH, lessons: [lesson] });
    assert.equal(parsed.ok, true);
    assert.equal(parsed.batchId, BATCH);
    assert.deepEqual(parsed.lessons, [lesson]);
  });

  it("round-trips what localLessons produced", () => {
    const local = localLessons({ done: { "01-sum-basics": { at: AT, helped: false } }, tries: { "02-average-scores": 1 } });
    const parsed = parseMigration({ batch_id: BATCH, lessons: local.lessons });
    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.lessons, local.lessons);
  });

  it("requires the same idempotency key the event path requires", () => {
    assert.match(parseMigration({ lessons: [lesson] }).error, /uuid/);
    assert.match(parseMigration({ batch_id: "nope", lessons: [lesson] }).error, /uuid/);
  });

  it("refuses an empty list, a non-list, and a list that is too long", () => {
    assert.match(parseMigration({ batch_id: BATCH, lessons: [] }).error, /empty/);
    assert.match(parseMigration({ batch_id: BATCH, lessons: "all" }).error, /array/);
    const many = Array.from({ length: MAX_LESSONS + 1 }, () => lesson);
    assert.match(parseMigration({ batch_id: BATCH, lessons: many }).error, /at most/);
  });

  it("refuses a lesson with no id or an unreadable date", () => {
    assert.match(parseMigration({ batch_id: BATCH, lessons: [{ completed_at: AT }] }).error, /id/);
    assert.match(parseMigration({ batch_id: BATCH, lessons: [null] }).error, /object/);
    assert.match(
      parseMigration({ batch_id: BATCH, lessons: [{ lesson_id: "01-sum-basics", completed_at: "yesterday" }] }).error,
      /unreadable/,
    );
  });

  it("clamps a score the column would reject, and treats a missing one as zero", () => {
    const parsed = parseMigration({
      batch_id: BATCH,
      lessons: [
        { lesson_id: "a", score: 900 },
        { lesson_id: "b", score: -3 },
        { lesson_id: "c" },
        { lesson_id: "d", score: 41.6 },
      ],
    });
    assert.deepEqual(
      parsed.lessons.map((item) => item.score),
      [100, 0, 0, 42],
    );
  });
});
