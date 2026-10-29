/**
 * The feedback queue. It is the one thing the dialog cannot be trusted to get right on its own: it
 * shares `localStorage` with the progress record, so its bound and its tolerance for junk decide whether
 * a learner who files a lot of notes still has a track.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  FEEDBACK_LIMIT,
  FEEDBACK_TEXT_LIMIT,
  MOODS,
  enqueueFeedback,
  feedbackEntry,
  readQueue,
} from "../packages/session/index.js";

const AT = "2026-03-20T12:00:00.000Z";
const entry = (mood = "stuck", text = "") => ({ mood, text, route: "/excel/sum-basics", at: AT });

describe("feedbackEntry", () => {
  it("keeps the three choices and refuses anything else", () => {
    assert.deepEqual(MOODS, ["stuck", "progress", "clicked"]);
    for (const mood of MOODS) assert.equal(feedbackEntry({ mood, at: AT })?.mood, mood);
    for (const mood of [null, undefined, "", "angry", 1]) {
      assert.equal(feedbackEntry({ mood, at: AT }), null, `${mood} should not be a submission`);
    }
  });

  it("trims the note before it cuts it, and caps it at the limit", () => {
    assert.equal(feedbackEntry({ mood: "stuck", text: "  no comma  ", at: AT }).text, "no comma");
    const long = "x".repeat(FEEDBACK_TEXT_LIMIT + 40);
    assert.equal(feedbackEntry({ mood: "stuck", text: long, at: AT }).text.length, FEEDBACK_TEXT_LIMIT);
    assert.equal(feedbackEntry({ mood: "stuck", text: undefined, at: AT }).text, "");
  });

  it("carries the route it was written on, so a note is never anonymous about its page", () => {
    assert.equal(feedbackEntry({ mood: "clicked", route: "/learn", at: AT }).route, "/learn");
  });
});

describe("enqueueFeedback", () => {
  it("keeps the newest entries and drops the oldest first", () => {
    let queue = [];
    for (let i = 0; i < FEEDBACK_LIMIT + 5; i += 1) queue = enqueueFeedback(queue, entry("stuck", `n${i}`));
    assert.equal(queue.length, FEEDBACK_LIMIT);
    assert.equal(queue[0].text, "n5");
    assert.equal(queue.at(-1).text, `n${FEEDBACK_LIMIT + 4}`);
  });

  it("starts over from a queue that is not a queue", () => {
    for (const junk of [null, undefined, "text", 42, {}]) {
      assert.deepEqual(enqueueFeedback(junk, entry()), [entry()], `${junk} should start a new queue`);
    }
  });

  it("drops entries it would not have written itself", () => {
    const queue = [{ mood: "angry", text: "", at: AT }, { mood: "stuck", text: 7, at: AT }, entry()];
    assert.deepEqual(enqueueFeedback(queue, entry("clicked")), [entry(), entry("clicked")]);
  });
});

describe("readQueue", () => {
  it("treats every kind of junk as an empty queue", () => {
    for (const junk of [null, "", "null", "{", "42", '"text"', '{"mood":"stuck"}']) {
      assert.deepEqual(readQueue(junk), [], `${junk} should read as no notes`);
    }
  });

  it("round-trips what it wrote", () => {
    const queue = enqueueFeedback(enqueueFeedback([], entry()), entry("clicked", "more of this"));
    assert.deepEqual(readQueue(JSON.stringify(queue)), queue);
  });
});
