/**
 * Two stores, one shape: the record `GET /api/progress` answers from `lesson_progress`, and the union
 * of that record with what the browser kept.
 *
 * The cases that matter are the ones a learner meets as a wrong dashboard: a drill finished before
 * sign-up vanishing on the second device (D10), a completion without a timestamp arriving as a done
 * row the dashboard cannot draw, and a merge that reports "changed" on every load so the page repaints
 * forever.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { mergeProgress } from "../packages/progress/index.js";
import { recordFrom } from "../lib/progress/record.js";
import { parseProgress, serializeProgress } from "../legacy/src/client/state.js";

const AT = "2026-03-20T12:00:00.000Z";

describe("recordFrom", () => {
  it("answers the empty record when there is nothing to read", () => {
    for (const rows of [[], null, undefined, "nope"]) {
      assert.deepEqual(recordFrom(rows), { v: 1, done: {}, tries: {}, unlocked: false });
    }
  });

  it("turns a completed row into a done entry with its attempt count and help", () => {
    const record = recordFrom([
      { lesson_id: "formulas-1", status: "complete", attempts: 3, helped: true, completed_at: AT },
    ]);
    assert.deepEqual(record.done["formulas-1"], { at: AT, tries: 3, helped: true });
    assert.equal(record.tries["formulas-1"], undefined);
  });

  it("keeps an unfinished row as a check count, never as a completion", () => {
    const record = recordFrom([{ lesson_id: "formulas-2", status: "in_progress", attempts: 2, completed_at: null }]);
    assert.deepEqual(record.done, {});
    assert.equal(record.tries["formulas-2"], 2);
  });

  it("refuses to call a completion done when it cannot be dated, and drops a row with no id", () => {
    const record = recordFrom([
      { lesson_id: "undated", status: "complete", attempts: 1, completed_at: "not a date" },
      { lesson_id: "   ", status: "complete", attempts: 1, completed_at: AT },
      { status: "complete", attempts: 1, completed_at: AT },
    ]);
    // Undated is not dropped — the learner did the work — but the roll-up has no way to date it, so it
    // can only be a check count, which is what the dashboard draws as "needs practice".
    assert.deepEqual(record.done, {});
    assert.deepEqual(record.tries, { undated: 1 });
  });

  it("survives parseProgress, so the server's copy reaches the same island the browser writes for", () => {
    const record = recordFrom([
      { lesson_id: "formulas-1", status: "complete", attempts: 2, helped: false, completed_at: AT },
      { lesson_id: "formulas-2", status: "in_progress", attempts: 1, completed_at: null },
    ]);
    const parsed = parseProgress(serializeProgress(record));
    assert.deepEqual(parsed.done["formulas-1"], { at: AT, tries: 2, helped: false });
    assert.equal(parsed.tries["formulas-2"], 1);
  });
});

describe("mergeProgress", () => {
  const local = () => ({
    v: 1,
    done: { mine: { at: AT, tries: 1, helped: false } },
    tries: { started: 2 },
    unlocked: false,
  });

  it("keeps a drill finished only in this browser (D10: sign-up must not erase it)", () => {
    const { progress, changed } = mergeProgress(local(), { done: {}, tries: {} });
    assert.deepEqual(progress.done.mine, { at: AT, tries: 1, helped: false });
    assert.equal(progress.tries.started, 2);
    assert.equal(changed, false);
  });

  it("adopts what the server holds, so a second browser is not told nothing was done", () => {
    const { progress, changed } = mergeProgress(local(), {
      done: { theirs: { at: AT, tries: 4, helped: true } },
      tries: { other: 3 },
    });
    assert.deepEqual(progress.done.theirs, { at: AT, tries: 4, helped: true });
    assert.equal(progress.tries.other, 3);
    assert.equal(changed, true);
  });

  it("lets the server win a conflict, because it saw every device", () => {
    const { progress } = mergeProgress(local(), { done: { mine: { at: "2026-04-01T00:00:00.000Z", tries: 5, helped: true } } });
    assert.deepEqual(progress.done.mine, { at: "2026-04-01T00:00:00.000Z", tries: 5, helped: true });
  });

  it("drops a check count once the same lesson is complete, and never counts down", () => {
    const { progress } = mergeProgress({ v: 1, done: {}, tries: { started: 5 }, unlocked: false }, { tries: { started: 2 } });
    assert.equal(progress.tries.started, 5);

    const { progress: after } = mergeProgress(
      { v: 1, done: {}, tries: { started: 2 }, unlocked: false },
      { done: { started: { at: AT, tries: 1, helped: false } } },
    );
    assert.equal(after.tries.started, undefined);
    assert.deepEqual(after.done.started, { at: AT, tries: 1, helped: false });
  });

  it("says nothing changed when the two stores already agree, so the page does not repaint for nothing", () => {
    const remote = { done: { mine: { at: AT, tries: 1, helped: false } }, tries: { started: 2 } };
    const { changed } = mergeProgress(local(), remote);
    assert.equal(changed, false);
  });

  it("does not mutate the local record it was handed", () => {
    const before = local();
    mergeProgress(before, { done: { theirs: { at: AT, tries: 1, helped: false } } });
    assert.deepEqual(before, local());
  });
});
