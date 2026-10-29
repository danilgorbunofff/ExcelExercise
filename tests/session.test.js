import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  EVENT_TYPES,
  MAX_EVENTS,
  createClock,
  createSession,
  createSink,
  currentScreen,
  emitAll,
  isComplete,
  nextIndex,
  progress,
  recordVerdict,
} from "../packages/session/index.js";

/** Play a session to completion, returning the final session and every event seen. */
function play(session, answers) {
  let state = session;
  const events = [];
  for (const ok of answers) {
    const step = recordVerdict(state, ok);
    state = step.session;
    events.push(...step.events);
  }
  return { session: state, events };
}

function types(events) {
  return events.map((event) => event.type);
}

describe("session score loop", () => {
  it("starts on the first screen with nothing scored", () => {
    const session = createSession({ screens: 7 });
    assert.equal(session.index, 0);
    assert.equal(currentScreen(session), 1);
    assert.equal(session.score, 0);
    assert.equal(session.complete, false);
    assert.equal(isComplete(session), false);
    assert.equal(progress(session), 0);
  });

  it("reaches the cap in five correct answers on the default weights", () => {
    const { session, events } = play(
      createSession({ screens: 7 }),
      [true, true, true, true, true],
    );
    assert.equal(session.score, 100);
    assert.equal(session.complete, true);
    assert.equal(types(events).filter((type) => type === "lesson_complete").length, 1);
    assert.equal(progress(session), 1);
  });

  it("clamps a weight that does not divide the cap, and completes exactly once", () => {
    // 15 into 100 finishes on the seventh answer with 105 clamped to 100.
    const answers = Array.from({ length: 9 }, () => true);
    const { session } = play(
      createSession({ screens: 5, scoring: { correct: 15, incorrect: 0, cap: 100 } }),
      answers,
    );
    assert.equal(session.score, 100);
    assert.equal(session.correct, 7, "the loop stops asking once the cap is reached");
    assert.equal(session.complete, true);
  });

  it("terminates for a five-screen lesson that has to recycle", () => {
    // The acceptance criterion: a five-screen lesson with recycling still ends at 100.
    const screens = 5;
    const session = createSession({ screens, scoring: { correct: 15, incorrect: 0, cap: 100 } });
    const seen = [];
    let state = session;
    for (let step = 0; step < 100 && !state.complete; step += 1) {
      seen.push(state.index);
      state = recordVerdict(state, true).session;
    }
    assert.equal(state.complete, true);
    assert.deepEqual(
      seen,
      [0, 1, 2, 3, 4, 3, 4],
      "seven answers at 15 points: the sixth screen is the fourth again, not a sixth screen",
    );
    for (const index of seen) assert.ok(index >= 0 && index < screens, "the loop never reads past the lesson");
  });

  it("recycles a one-screen lesson to itself instead of running off the end", () => {
    assert.equal(nextIndex(0, 1, 4), 0);
    const session = createSession({ screens: 1, scoring: { correct: 60, incorrect: 0, cap: 100 } });
    const { session: done } = play(session, [true, true]);
    assert.equal(done.score, 100);
    assert.equal(done.index, 0);
    assert.equal(done.complete, true);
  });

  it("clamps a recycle point beyond the last screen back into the lesson", () => {
    assert.equal(nextIndex(1, 2, 4), 0, "a two-screen lesson restarts rather than repeating its last screen");
    assert.equal(nextIndex(4, 5, 4), 3, "after the last screen the lesson replays from screen 4");
    assert.equal(nextIndex(4, 5, 1), 0, "recycling from screen 1 restarts the lesson");
    assert.equal(nextIndex(1, 5, 1), 2, "mid-lesson navigation is untouched by the recycle point");
  });

  it("never scores a wrong answer and never moves the screen", () => {
    const start = createSession({ screens: 3 });
    const { session, events } = recordVerdict(start, false);
    assert.equal(session.score, 0);
    assert.equal(session.index, 0);
    assert.equal(session.wrong, 1);
    assert.deepEqual(types(events), ["check_wrong"]);
    assert.equal(events[0].props.attempts, 1);
  });

  it("floors a penalised score at zero", () => {
    const session = createSession({ screens: 3, scoring: { correct: 20, incorrect: -15, cap: 100 } });
    const { session: after } = play(recordVerdict(session, true).session, [false, false]);
    assert.equal(after.score, 0, "a wrong answer cannot push the score below zero");
  });

  it("counts a correct answer after a penalty from the reduced score", () => {
    const session = createSession({ screens: 3, scoring: { correct: 20, incorrect: -5, cap: 100 } });
    const first = recordVerdict(session, true).session; // 20
    const second = recordVerdict(first, false).session; // 15
    assert.equal(second.score, 15);
    assert.equal(recordVerdict(second, true).session.score, 35);
  });

  it("does nothing on a graded answer after completion", () => {
    const { session } = play(createSession({ screens: 2 }), [true, true, true, true, true]);
    assert.equal(session.complete, true);
    const again = recordVerdict(session, true);
    assert.equal(again.session, session, "the same session object comes back");
    assert.deepEqual(again.events, [], "no second lesson_complete");
    const wrongAgain = recordVerdict(session, false);
    assert.deepEqual(wrongAgain.events, []);
  });

  it("emits check_correct, screen_complete, then lesson_complete on the last screen", () => {
    const session = createSession({ screens: 1, scoring: { correct: 100, incorrect: 0, cap: 100 } });
    const { events } = recordVerdict(session, true);
    assert.deepEqual(types(events), ["check_correct", "screen_complete", "lesson_complete"]);
    assert.equal(events.at(-1).props.score, 100);
  });

  it("emits only check_correct and screen_complete while the lesson continues", () => {
    const { events } = recordVerdict(createSession({ screens: 3 }), true);
    assert.deepEqual(types(events), ["check_correct", "screen_complete"]);
  });

  it("refuses a configuration that could not terminate", () => {
    assert.throws(() => createSession({ screens: 4, scoring: { correct: 0, incorrect: 0, cap: 100 } }), /scoring\.correct/);
    assert.throws(() => createSession({ screens: 4, scoring: { correct: 20, incorrect: 0, cap: 0 } }), /scoring\.cap/);
    assert.throws(() => createSession({ screens: 0 }), /screens/);
    assert.throws(() => createSession({ screens: 4, recycleFrom: 0 }), /recycleFrom/);
    assert.throws(() => createSession({ screens: 4, scoring: { correct: 20, incorrect: 5, cap: 100 } }), /scoring\.incorrect/);
    assert.throws(() => createSession({ screens: 4.5 }), /screens/);
    assert.throws(() => recordVerdict(createSession({ screens: 4 }), "yes"), /boolean/);
  });

  it("forwards loop events to a sink, counting only the ones it accepts", () => {
    const written = [];
    const sink = createSink({ write: (event) => written.push(event) });
    const { events } = recordVerdict(
      createSession({ screens: 1, scoring: { correct: 100, incorrect: 0, cap: 100 } }),
      true,
    );
    assert.equal(emitAll(sink, events), 3);
    assert.deepEqual(written.map((event) => event.type), ["check_correct", "screen_complete", "lesson_complete"]);
    assert.equal(emitAll(sink, [{ type: "not_a_real_event", props: {} }]), 0);
  });
});

describe("session clock", () => {
  it("counts elapsed time from the injected clock and expires at the budget", () => {
    let now = 1_000;
    const clock = createClock({ now: () => now, sessionMinutes: 1 });
    assert.equal(clock.elapsedMs(), 0);
    assert.equal(clock.remainingMs(), 60_000);
    assert.equal(clock.expired(), false);

    now += 30_000;
    assert.equal(clock.elapsedMs(), 30_000);
    assert.equal(clock.remainingMs(), 30_000);
    assert.equal(clock.expired(), false);

    now += 30_000;
    assert.equal(clock.remainingMs(), 0);
    assert.equal(clock.expired(), true);

    now += 600_000;
    assert.equal(clock.remainingMs(), 0, "remaining never goes negative");
  });

  it("stops counting while paused, however long the tab is hidden", () => {
    let now = 0;
    const clock = createClock({ now: () => now, sessionMinutes: 10 });
    now = 5_000;
    clock.pause();
    assert.equal(clock.isPaused(), true);
    now += 3_600_000;
    assert.equal(clock.elapsedMs(), 5_000, "a hidden tab does not spend the budget");
    assert.equal(clock.expired(), false);
    clock.resume();
    assert.equal(clock.isPaused(), false);
    now += 1_000;
    assert.equal(clock.elapsedMs(), 6_000);
  });

  it("does not double-count a pause or rewind on a repeated resume", () => {
    let now = 0;
    const clock = createClock({ now: () => now, sessionMinutes: 10 });
    now = 1_000;
    clock.pause();
    clock.pause();
    now += 1_000;
    clock.resume();
    clock.resume();
    now += 1_000;
    assert.equal(clock.elapsedMs(), 2_000, "1 s before the pause plus 1 s after it");
  });

  it("treats a backwards clock step as zero rather than negative", () => {
    let now = 10_000;
    const clock = createClock({ now: () => now, sessionMinutes: 10 });
    now = 4_000;
    assert.equal(clock.elapsedMs(), 0);
    assert.equal(clock.remainingMs(), 600_000);
  });

  it("refuses a budget that is not a positive number of minutes", () => {
    for (const sessionMinutes of [0, -1, Number.NaN, "60"]) {
      assert.throws(() => createClock({ sessionMinutes }), /sessionMinutes/, String(sessionMinutes));
    }
    assert.throws(() => createClock({ now: "soon" }), /now must be a function/);
  });
});

describe("session event sink", () => {
  it("refuses a name outside the vocabulary so a typo cannot reach the transport", () => {
    const written = [];
    const sink = createSink({ write: (event) => written.push(event) });
    assert.equal(sink.emit("drill_view", {}), false, "the old name is gone on purpose");
    assert.equal(written.length, 0);
    assert.equal(sink.count, 0);
    assert.ok(EVENT_TYPES.includes("screen_view"));
  });

  it("writes one event with a type and an ISO timestamp", () => {
    const written = [];
    const sink = createSink({ write: (event) => written.push(event), now: () => new Date("2026-01-02T03:04:05.000Z") });
    assert.equal(sink.emit("check_correct", { score: 20 }), true);
    assert.deepEqual(written, [{ score: 20, type: "check_correct", ts: "2026-01-02T03:04:05.000Z" }]);
    assert.equal(sink.count, 1);
  });

  it("merges context under the event's own props", () => {
    const written = [];
    const sink = createSink({
      write: (event) => written.push(event),
      context: () => ({ route: "/excel/sum-basics", track: "excel", lesson: "from-context" }),
    });
    sink.emit("screen_view", { lesson: "sum-basics" });
    assert.deepEqual(
      { route: written[0].route, track: written[0].track, lesson: written[0].lesson },
      { route: "/excel/sum-basics", track: "excel", lesson: "sum-basics" },
    );
  });

  it("keeps flat primitives and drops everything the collector cannot store", () => {
    const written = [];
    const sink = createSink({ write: (event) => written.push(event) });
    sink.emit("check_wrong", {
      attempts: 2,
      rule: "value",
      helped: false,
      screen_elapsed: 7,
      nothing: null,
      missing: undefined,
      nested: { a: 1 },
      list: [1, 2],
      notFinite: Number.NaN,
      fn: () => {},
    });
    assert.deepEqual(Object.keys(written[0]).sort(), [
      "attempts",
      "helped",
      "nothing",
      "rule",
      "screen_elapsed",
      "ts",
      "type",
    ]);
  });

  it("does not let a prop overwrite the schema", () => {
    const written = [];
    const sink = createSink({ write: (event) => written.push(event), now: () => new Date(0) });
    sink.emit("screen_view", { type: "forged", ts: "1999-01-01T00:00:00.000Z" });
    assert.equal(written[0].type, "screen_view");
    assert.equal(written[0].ts, "1970-01-01T00:00:00.000Z");
  });

  it("stops buffering at the cap instead of growing without bound", () => {
    let written = 0;
    const sink = createSink({ write: () => (written += 1) });
    for (let index = 0; index < MAX_EVENTS; index += 1) assert.equal(sink.emit("track_view", {}), true);
    assert.equal(sink.emit("track_view", {}), false);
    assert.equal(written, MAX_EVENTS);
  });

  it("needs a write function", () => {
    assert.throws(() => createSink({}), /write/);
    assert.throws(() => createSink(), /write/);
  });
});
