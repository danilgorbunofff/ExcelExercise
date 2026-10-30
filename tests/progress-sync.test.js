/**
 * The server's reading of the client's event buffer.
 *
 * These are the cases where a plausible-looking implementation writes a wrong row rather than throwing:
 * a screen the learner only looked at counted as an attempt, a look at the hint leaving accuracy perfect,
 * a lesson replayed into a second copy. `tests/db/progress.spec.js` proves the database half against a
 * real Postgres; this file proves the derivation without one.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MAX_BATCH_EVENTS, deriveUpdates, parseBatch } from "../lib/progress/derive.js";

const T0 = "2026-10-31T10:00:00.000Z";
const at = (seconds) => new Date(Date.parse(T0) + seconds * 1000).toISOString();

/** One screen, solved first try, in the order the drill really emits them. */
function solvedFirstTry(lesson = "01-sum-basics") {
  return [
    { type: "drill_start", id: lesson, elapsed: 0, ts: at(0) },
    { type: "screen_view", id: lesson, screen: 1, of: 1, elapsed: 1, ts: at(1) },
    { type: "check_correct", id: lesson, score: 100, attempts: 1, elapsed: 9, screen_elapsed: 8, ts: at(9) },
    { type: "screen_complete", id: lesson, screen: 1, score: 100, elapsed: 9, ts: at(9) },
    { type: "lesson_complete", id: lesson, score: 100, correct: 1, wrong: 0, elapsed: 9, ts: at(9) },
  ];
}

describe("deriveUpdates", () => {
  it("turns a first-try solve into one attempt with perfect accuracy", () => {
    const result = deriveUpdates(solvedFirstTry());
    assert.equal(result.ok, true);
    assert.equal(result.lessonId, "01-sum-basics");
    assert.deepEqual(result.attempts, [
      {
        screen_id: "screen-1",
        started_at: at(1),
        ended_at: at(9),
        correct_first_try: true,
        wrong_count: 0,
        help_used: false,
        answer: null,
      },
    ]);
    assert.deepEqual(result.summary, { score: 100, wrong: 0, helped: false, ms: 9000, completed: true });
  });

  it("counts misses on one screen and keeps them off the next", () => {
    const result = deriveUpdates([
      { type: "screen_view", id: "01-sum-basics", screen: 1, ts: at(1) },
      { type: "check_wrong", id: "01-sum-basics", score: 0, attempts: 1, ts: at(3) },
      { type: "check_wrong", id: "01-sum-basics", score: 0, attempts: 2, ts: at(5) },
      { type: "check_correct", id: "01-sum-basics", score: 20, attempts: 3, ts: at(7) },
      { type: "screen_complete", id: "01-sum-basics", screen: 1, score: 20, ts: at(7) },
      { type: "screen_view", id: "01-sum-basics", screen: 2, ts: at(8) },
      { type: "check_correct", id: "01-sum-basics", score: 40, attempts: 1, ts: at(10) },
      { type: "screen_complete", id: "01-sum-basics", screen: 2, score: 40, ts: at(10) },
    ]);
    assert.equal(result.attempts.length, 2);
    assert.deepEqual(
      result.attempts.map((a) => [a.screen_id, a.wrong_count, a.correct_first_try]),
      [
        ["screen-1", 2, false],
        ["screen-2", 0, true],
      ],
    );
    assert.equal(result.summary.wrong, 2);
    assert.equal(result.summary.completed, false);
    assert.equal(result.summary.ms, null);
  });

  it("does not call a hint-assisted solve a first-try success", () => {
    const result = deriveUpdates([
      { type: "screen_view", id: "01-sum-basics", screen: 1, ts: at(1) },
      { type: "hint_open", id: "01-sum-basics", ts: at(2) },
      { type: "check_correct", id: "01-sum-basics", score: 20, ts: at(4) },
    ]);
    assert.equal(result.attempts[0].help_used, true);
    assert.equal(result.attempts[0].correct_first_try, false);
    assert.equal(result.summary.helped, true);
  });

  it("ignores a screen the learner only looked at", () => {
    const result = deriveUpdates([
      { type: "screen_view", id: "01-sum-basics", screen: 1, ts: at(1) },
      { type: "screen_view", id: "01-sum-basics", screen: 2, ts: at(4) },
      { type: "check_correct", id: "01-sum-basics", score: 20, ts: at(6) },
    ]);
    assert.deepEqual(
      result.attempts.map((a) => a.screen_id),
      ["screen-2"],
    );
  });

  it("closes an abandoned screen at the view that replaced it", () => {
    const result = deriveUpdates([
      { type: "screen_view", id: "01-sum-basics", screen: 1, ts: at(1) },
      { type: "check_wrong", id: "01-sum-basics", ts: at(2) },
      { type: "screen_view", id: "01-sum-basics", screen: 2, ts: at(6) },
    ]);
    assert.equal(result.attempts[0].ended_at, at(6));
    assert.equal(result.attempts[0].correct_first_try, false);
  });

  it("keeps the best score and the first completion across repeats", () => {
    const result = deriveUpdates([
      ...solvedFirstTry(),
      { type: "drill_start", id: "01-sum-basics", elapsed: 0, ts: at(20) },
      { type: "screen_view", id: "01-sum-basics", screen: 1, ts: at(21) },
      { type: "check_correct", id: "01-sum-basics", score: 60, ts: at(22) },
      { type: "lesson_complete", id: "01-sum-basics", score: 60, elapsed: 30, ts: at(30) },
    ]);
    assert.equal(result.summary.score, 100);
    assert.equal(result.summary.completed, true);
    assert.equal(result.summary.ms, 30000);
    assert.equal(result.attempts.length, 2);
  });

  it("refuses a batch that mixes two lessons, an unknown type, or a bad timestamp", () => {
    assert.match(
      deriveUpdates([
        { type: "screen_view", id: "01-sum-basics", screen: 1, ts: at(1) },
        { type: "screen_view", id: "02-average-scores", screen: 1, ts: at(2) },
      ]).error,
      /one lesson/,
    );
    assert.match(deriveUpdates([{ type: "nope", id: "01-sum-basics", ts: at(1) }]).error, /unknown event type/);
    assert.match(deriveUpdates([{ type: "screen_view", id: "01-sum-basics", ts: "yesterday" }]).error, /timestamp/);
    assert.match(deriveUpdates("events").error, /array/);
    assert.match(deriveUpdates(new Array(MAX_BATCH_EVENTS + 1).fill({ type: "drill_start", ts: at(1) })).error,
      /at most/);
    assert.match(deriveUpdates([{ type: "drill_start", elapsed: 0, ts: at(1) }]).error, /no event named a lesson/);
  });

  it("survives junk props without throwing", () => {
    const result = deriveUpdates([
      { type: "screen_view", id: "01-sum-basics", screen: 1, ts: at(1), score: "high", elapsed: "soon" },
      { type: "check_wrong", id: "01-sum-basics", ts: at(2), score: null },
      { type: "lesson_complete", id: "01-sum-basics", elapsed: Number.NaN, ts: at(3) },
    ]);
    assert.equal(result.ok, true);
    assert.equal(result.summary.score, 0);
    assert.equal(result.summary.ms, null);
  });
});

describe("parseBatch", () => {
  it("accepts a uuid and the events it derived", () => {
    const parsed = parseBatch({ batch_id: "8f0d1a2e-4b3c-4d5e-8f90-1a2b3c4d5e6f", events: solvedFirstTry() });
    assert.equal(parsed.ok, true);
    assert.equal(parsed.batchId, "8f0d1a2e-4b3c-4d5e-8f90-1a2b3c4d5e6f");
    assert.equal(parsed.lessonId, "01-sum-basics");
  });

  it("requires an idempotency key, because the server cannot invent one", () => {
    assert.match(parseBatch({ events: solvedFirstTry() }).error, /uuid/);
    assert.match(parseBatch({ batch_id: "not-a-uuid", events: solvedFirstTry() }).error, /uuid/);
    assert.match(parseBatch({ batch_id: "../../etc/passwd", events: solvedFirstTry() }).error, /uuid/);
    assert.match(parseBatch(null).error, /object/);
  });
});

