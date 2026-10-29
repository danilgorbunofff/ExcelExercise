/**
 * The dashboard's read model. The cases that matter are the ones a learner sees as a wrong sentence:
 * a stale drill called "complete", a count that includes a lesson that no longer exists, an up-next
 * that offers nothing while six drills are untouched.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BADGES,
  BADGE_LABELS,
  PRACTICE_AFTER_TRIES,
  RECENT_LIMIT,
  STALE_AFTER_DAYS,
  ago,
  badgeFor,
  badgeLabel,
  summarise,
} from "../packages/progress/index.js";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-03-20T12:00:00.000Z");
const at = (daysAgo) => new Date(NOW - daysAgo * DAY).toISOString();

function progressOf({ done = {}, tries = {} } = {}) {
  return { v: 1, done, tries };
}

const PLAN = [
  { id: "01-a", number: 1, title: "First", path: "/excel/a", group: "intro" },
  { id: "02-b", number: 2, title: "Second", path: "/excel/b", group: "intro" },
  { id: "03-c", number: 3, title: "Third", path: "/excel/c", group: "sum" },
];

describe("badges", () => {
  it("gives every badge a label", () => {
    for (const badge of BADGES) assert.equal(typeof BADGE_LABELS[badge], "string", `${badge} has no label`);
    assert.equal(badgeLabel("nonsense"), BADGE_LABELS.not_started);
  });

  it("starts a lesson nobody touched at not_started", () => {
    assert.equal(badgeFor(progressOf(), "01-a", NOW), "not_started");
    assert.equal(badgeFor(null, "01-a", NOW), "not_started");
  });

  it("calls a failed check in_progress, and tries for another lesson do not leak across", () => {
    const progress = progressOf({ tries: { "01-a": 1 } });
    assert.equal(badgeFor(progress, "01-a", NOW), "in_progress");
    assert.equal(badgeFor(progress, "02-b", NOW), "not_started");
  });

  it("calls a clean solve complete", () => {
    const progress = progressOf({ done: { "01-a": { at: at(1), tries: 1, helped: false } } });
    assert.equal(badgeFor(progress, "01-a", NOW), "complete");
  });

  it("calls a solve that used a hint needs_practice", () => {
    const progress = progressOf({ done: { "01-a": { at: at(1), tries: 1, helped: true } } });
    assert.equal(badgeFor(progress, "01-a", NOW), "needs_practice");
  });

  it("calls a solve that took several attempts needs_practice", () => {
    const progress = progressOf({
      done: { "01-a": { at: at(1), tries: PRACTICE_AFTER_TRIES, helped: false } },
    });
    assert.equal(badgeFor(progress, "01-a", NOW), "needs_practice");
  });

  it("ages a stale solve out of complete, and stays stale over needs_practice", () => {
    const fresh = progressOf({ done: { "01-a": { at: at(STALE_AFTER_DAYS - 1), tries: 1, helped: false } } });
    assert.equal(badgeFor(fresh, "01-a", NOW), "complete");

    const old = progressOf({ done: { "01-a": { at: at(STALE_AFTER_DAYS), tries: 1, helped: false } } });
    assert.equal(badgeFor(old, "01-a", NOW), "stale");

    const oldHelped = progressOf({ done: { "01-a": { at: at(60), tries: 4, helped: true } } });
    assert.equal(badgeFor(oldHelped, "01-a", NOW), "stale", "stale outranks needs_practice");
  });

  it("treats a completion timestamp the browser cannot read as not stale", () => {
    const progress = progressOf({ done: { "01-a": { at: "not-a-date", tries: 1, helped: false } } });
    assert.equal(badgeFor(progress, "01-a", NOW), "complete");
  });
});

describe("ago", () => {
  it("reads like a sentence for the recent list", () => {
    assert.equal(ago(new Date(NOW - 20 * 1000).toISOString(), NOW), "just now");
    assert.equal(ago(new Date(NOW - 60 * 1000).toISOString(), NOW), "1 minute ago");
    assert.equal(ago(new Date(NOW - 8 * 60 * 1000).toISOString(), NOW), "8 minutes ago");
    assert.equal(ago(new Date(NOW - 3 * 60 * 60 * 1000).toISOString(), NOW), "3 hours ago");
    assert.equal(ago(at(1), NOW), "1 day ago");
    assert.equal(ago(at(6), NOW), "6 days ago");
    assert.equal(ago(at(8), NOW), "1 week ago");
    assert.equal(ago(at(30), NOW), "4 weeks ago");
  });

  it("keeps a clock that jumped backwards readable", () => {
    assert.equal(ago(new Date(NOW + 5 * 60 * 1000).toISOString(), NOW), "just now");
  });

  it("says nothing rather than NaN for a timestamp it cannot read", () => {
    assert.equal(ago(undefined, NOW), "");
    assert.equal(ago("soon", NOW), "");
  });
});

describe("summarise", () => {
  it("counts nothing done on a fresh browser", () => {
    const summary = summarise({ plan: PLAN, progress: progressOf(), now: NOW });
    assert.equal(summary.completed, 0);
    assert.equal(summary.total, 3);
    assert.equal(summary.remaining, 3);
    assert.deepEqual(summary.recent, []);
    assert.equal(summary.next.id, "01-a");
    assert.equal(summary.nextReason, "start");
  });

  it("recommends the first unfinished lesson, not the first lesson", () => {
    const progress = progressOf({ done: { "01-a": { at: at(1), tries: 1, helped: false } } });
    const summary = summarise({ plan: PLAN, progress, now: NOW });
    assert.equal(summary.completed, 1);
    assert.equal(summary.next.id, "02-b");
    assert.equal(summary.nextReason, "start");
  });

  it("offers to resume a lesson the learner already failed once", () => {
    const progress = progressOf({
      done: { "01-a": { at: at(1), tries: 1, helped: false } },
      tries: { "02-b": 2 },
    });
    const summary = summarise({ plan: PLAN, progress, now: NOW });
    assert.equal(summary.next.id, "02-b");
    assert.equal(summary.nextReason, "resume");
  });

  it("ignores progress for a lesson that is not in the plan", () => {
    const progress = progressOf({ done: { "99-gone": { at: at(1), tries: 1, helped: false } } });
    const summary = summarise({ plan: PLAN, progress, now: NOW });
    assert.equal(summary.completed, 0);
    assert.equal(summary.total, 3);
    assert.equal(summary.next.id, "01-a");
  });

  it("totals each group", () => {
    const progress = progressOf({
      done: { "01-a": { at: at(1), tries: 1, helped: false } },
      tries: { "03-c": 1 },
    });
    const summary = summarise({ plan: PLAN, progress, now: NOW });
    assert.deepEqual(summary.groups, [
      { id: "intro", completed: 1, total: 2 },
      { id: "sum", completed: 0, total: 1 },
    ]);
  });

  it("lists the most recent completions, newest first, and never more than the limit", () => {
    const plan = Array.from({ length: RECENT_LIMIT + 3 }, (_, index) => ({
      id: `0${index}-x`,
      number: index + 1,
      title: `Lesson ${index}`,
      path: `/excel/x${index}`,
      group: "intro",
    }));
    const done = {};
    plan.forEach((entry, index) => {
      done[entry.id] = { at: at(index + 1), tries: 1, helped: false };
    });
    const summary = summarise({ plan, progress: progressOf({ done }), now: NOW });
    assert.equal(summary.recent.length, RECENT_LIMIT);
    assert.deepEqual(
      summary.recent.map((row) => row.id),
      plan.slice(0, RECENT_LIMIT).map((row) => row.id),
      "the newest completion is the one completed a day ago",
    );
    assert.equal(summary.recent[0].at, at(1));
  });

  it("points a finished track at something worth revising", () => {
    const progress = progressOf({
      done: {
        "01-a": { at: at(2), tries: 1, helped: false },
        "02-b": { at: at(3), tries: 1, helped: true },
        "03-c": { at: at(4), tries: 1, helped: false },
      },
    });
    const summary = summarise({ plan: PLAN, progress, now: NOW });
    assert.equal(summary.completed, 3);
    assert.equal(summary.next.id, "02-b");
    assert.equal(summary.nextReason, "review");
  });

  it("recommends nothing only when the track is complete and healthy", () => {
    const progress = progressOf({
      done: {
        "01-a": { at: at(2), tries: 1, helped: false },
        "02-b": { at: at(3), tries: 1, helped: false },
        "03-c": { at: at(4), tries: 1, helped: false },
      },
    });
    const summary = summarise({ plan: PLAN, progress, now: NOW });
    assert.equal(summary.next, null);
    assert.equal(summary.nextReason, "done");
    assert.equal(summary.remaining, 0);
  });

  it("counts stale and needs_practice for the summary line", () => {
    const progress = progressOf({
      done: {
        "01-a": { at: at(30), tries: 1, helped: false },
        "02-b": { at: at(1), tries: 3, helped: false },
        "03-c": { at: at(1), tries: 1, helped: false },
      },
    });
    const summary = summarise({ plan: PLAN, progress, now: NOW });
    assert.equal(summary.stale, 1);
    assert.equal(summary.needsPractice, 1);
  });

  it("gives every planned lesson a badge, in plan order", () => {
    const summary = summarise({ plan: PLAN, progress: progressOf({ tries: { "02-b": 1 } }), now: NOW });
    assert.deepEqual(
      summary.rows.map((row) => [row.id, row.badge]),
      [
        ["01-a", "not_started"],
        ["02-b", "in_progress"],
        ["03-c", "not_started"],
      ],
    );
  });

  it("survives an empty plan", () => {
    const summary = summarise({ plan: [], progress: progressOf(), now: NOW });
    assert.equal(summary.total, 0);
    assert.equal(summary.next, null);
    assert.deepEqual(summary.groups, []);
  });
});
