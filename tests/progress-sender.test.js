/**
 * The browser's half of the progress path: which events go in which batch, when a batch is worth
 * sending, and what happens to a batch the server refused.
 *
 * The failure modes these pin are the ones that write a wrong row instead of throwing: two lessons in
 * one batch (the server refuses the whole thing), the same event counted twice because it arrived
 * through both the seed and the hook, and a refused batch dropped on the floor.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { FINAL_EVENTS, FLUSH_AT, createCollector } from "../lib/progress/sender.js";

const T0 = "2026-10-31T10:00:00.000Z";
const at = (seconds) => new Date(Date.parse(T0) + seconds * 1000).toISOString();
const event = (type, extra = {}) => ({ type, ts: at(0), ...extra });

describe("createCollector", () => {
  it("refuses a limit it cannot honour", () => {
    assert.throws(() => createCollector({ limit: 0 }), /positive/);
    assert.throws(() => createCollector({ limit: 1.5 }), /positive/);
  });

  it("accumulates a lesson and only offers it on the final event", () => {
    const collector = createCollector();
    assert.equal(collector.add(event("drill_start", { id: "01-sum-basics" })), null);
    assert.equal(collector.add(event("screen_view", { id: "01-sum-basics", screen: 1 })), null);
    assert.deepEqual(collector.lessons(), ["01-sum-basics"]);
    assert.equal(collector.add(event("check_correct", { id: "01-sum-basics" })), null);
    assert.equal(collector.add(event("lesson_complete", { id: "01-sum-basics" })), "01-sum-basics");
  });

  it("treats the same object as one event whichever door it came through", () => {
    const collector = createCollector();
    const start = event("drill_start", { id: "01-sum-basics" });
    collector.seed([start]);
    assert.equal(collector.add(start), null, "the hook delivers the object the seed already saw");
    const events = collector.take("01-sum-basics");
    assert.equal(events.length, 1);
    assert.equal(events[0], start);
  });

  it("seeds from a buffer that is not an array, and from one that is", () => {
    const collector = createCollector();
    collector.seed(undefined);
    collector.seed([event("drill_start", { id: "01-sum-basics" })]);
    assert.deepEqual(collector.lessons(), ["01-sum-basics"]);
  });

  it("keeps two lessons apart, because one batch carries one lesson", () => {
    const collector = createCollector();
    collector.add(event("drill_start", { id: "01-sum-basics" }));
    collector.add(event("drill_start", { id: "02-average-scores" }));
    const first = collector.take("01-sum-basics");
    assert.equal(first.length, 1);
    assert.equal(first[0].id, "01-sum-basics");
    assert.deepEqual(collector.lessons(), ["02-average-scores"]);
  });

  it("drops what belongs to no lesson rather than sending it", () => {
    const collector = createCollector();
    // The dashboard's `track_view` counts the whole track, so it names no lesson.
    assert.equal(collector.add(event("track_view", { completed: 3, total: 16 })), null);
    assert.equal(collector.add(event("drill_start")), null);
    assert.equal(collector.add(event("not_an_event", { id: "01-sum-basics" })), null);
    assert.equal(collector.add(null), null);
    assert.equal(collector.add("drill_start"), null);
    assert.deepEqual(collector.lessons(), []);
  });

  it("offers a long lesson before it ends", () => {
    const collector = createCollector({ limit: 3 });
    const lesson = "01-sum-basics";
    assert.equal(collector.add(event("drill_start", { id: lesson })), null);
    assert.equal(collector.add(event("screen_view", { id: lesson })), null);
    assert.equal(collector.add(event("check_wrong", { id: lesson })), lesson);
  });

  it("ships a real cap well under the server's 500", () => {
    assert.ok(FLUSH_AT > 0 && FLUSH_AT < 500, `FLUSH_AT is ${FLUSH_AT}`);
    assert.deepEqual([...FINAL_EVENTS].sort(), ["lesson_complete", "lesson_exhausted"]);
  });

  it("takes once: an empty bucket cannot be sent twice", () => {
    const collector = createCollector();
    collector.add(event("drill_start", { id: "01-sum-basics" }));
    assert.equal(collector.take("01-sum-basics").length, 1);
    assert.deepEqual(collector.take("01-sum-basics"), []);
    assert.deepEqual(collector.lessons(), []);
    assert.deepEqual(collector.take("no-such-lesson"), []);
  });

  it("restores a refused batch in front of what arrived while it was in flight", () => {
    const collector = createCollector();
    const lesson = "01-sum-basics";
    const refused = event("drill_start", { id: lesson });
    collector.add(refused);
    const sent = collector.take(lesson);
    collector.add(event("lesson_complete", { id: lesson }));
    collector.restore(lesson, sent);
    const events = collector.take(lesson);
    assert.equal(events.length, 2);
    assert.equal(events[0], refused, "the retried event goes first, so the drill order survives");
    assert.equal(events[1].type, "lesson_complete");
  });

  it("restoring nothing changes nothing", () => {
    const collector = createCollector();
    collector.add(event("drill_start", { id: "01-sum-basics" }));
    collector.restore("01-sum-basics", []);
    collector.restore("01-sum-basics", null);
    assert.equal(collector.take("01-sum-basics").length, 1);
  });
});
