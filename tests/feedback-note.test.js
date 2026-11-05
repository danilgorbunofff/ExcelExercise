/**
 * The feedback form now reaches a human, so the route that carries it has three jobs before the
 * insert: refuse a note that is not one, refuse a note that claims a page it did not come from, and
 * refuse a browser that is filing them by the hundred.
 *
 * The rules live here rather than in the route so they can be checked without a database, and the
 * limits are the same ones the dialog enforces in the browser — a client that disagrees with the
 * server is a form that fails after the learner has typed.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { NOTE_LIMIT, parseNote, overLimit, RATE } from "../lib/feedback/note.js";

const good = { mood: "stuck", text: "The formula bar swallowed my bracket.", page: "/excel/if-basics" };

test("a complete note passes and is trimmed", () => {
  const parsed = parseNote({ ...good, text: "   spaced out   " });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.note.text, "spaced out");
  assert.equal(parsed.note.page, "/excel/if-basics");
  assert.equal(parsed.note.mood, "stuck");
});

test("the page must be a path on this site, not a URL", () => {
  for (const page of ["https://evil.example/x", "javascript:alert(1)", "//evil.example", "", null, 42]) {
    const parsed = parseNote({ ...good, page });
    assert.equal(parsed.ok, true, `a bad page should not lose the note: ${page}`);
    assert.equal(parsed.note.page, "/", `${page} should fall back to the front door`);
  }
});

test("a note without a mood is refused — the mood is the part that is one click", () => {
  for (const mood of [undefined, null, "", "angry", 1]) {
    const parsed = parseNote({ ...good, mood });
    assert.equal(parsed.ok, false);
    assert.match(parsed.error, /mood/);
  }
});

test("an empty note is refused, and a note past the limit is cut rather than refused", () => {
  assert.equal(parseNote({ ...good, text: "   " }).ok, false);
  assert.equal(parseNote({ ...good, text: undefined }).ok, false);

  const long = "x".repeat(NOTE_LIMIT + 50);
  const parsed = parseNote({ ...good, text: long });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.note.text.length, NOTE_LIMIT);
});

test("the route refuses what is not an object at all", () => {
  for (const body of [null, "text", 7, []]) assert.equal(parseNote(body).ok, false);
});

test("a signed-in note carries no identity from the browser", () => {
  // The account is the session's, never the body's: a form that could name a user id would let a
  // browser file notes as someone else.
  const parsed = parseNote({ ...good, user_id: "00000000-0000-0000-0000-000000000000" });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.note.user_id, undefined);
});

test("the rate limit counts one browser's recent notes and forgets the old ones", () => {
  const now = Date.parse("2026-10-28T12:00:00.000Z");
  const minute = 60_000;
  const times = Array.from({ length: RATE.max }, (_, index) => now - index * 1000);

  assert.equal(overLimit(times, now), true, "the limit itself is the limit");
  assert.equal(overLimit(times.slice(0, RATE.max - 1), now), false);
  // A note older than the window does not count, so the form opens again on its own.
  assert.equal(overLimit(times.map((at) => at - RATE.window - minute), now), false);
  assert.equal(overLimit([], now), false);
});
