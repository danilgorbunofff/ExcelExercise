/**
 * The score loop for a lesson session: answer screens correctly until the score reaches
 * the cap, recycling to an earlier screen when the lesson runs out of new ones.
 *
 * It is pure on purpose. The reference's loop is the one place where a bug shows up as
 * "the lesson never ends", so the rules live here, are unit-tested without a browser,
 * and the caller only renders whatever `index` it is handed.
 *
 * Two invariants make the loop terminate, and both are enforced at construction:
 * a correct answer always adds at least one point, and the cap is finite. That is why
 * `scoring.correct` may not be zero — a zero-weight loop would recycle forever, which
 * is exactly the failure mode the reference's recycling is famous for.
 */

export const DEFAULT_SCORING = Object.freeze({ correct: 20, incorrect: 0, cap: 100 });

/** The reference recycles to the fourth screen: the first three are the easy ramp. */
export const DEFAULT_RECYCLE_FROM = 4;

export const DEFAULT_SESSION_MINUTES = 60;

function integer(value, name, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}, got ${String(value)}`);
  }
  return value;
}

/**
 * Index of the screen after `index`. Past the last screen the loop replays from screen
 * `recycleFrom`, clamped into the lesson. A lesson shorter than that point has no
 * earlier ramp to replay, so it restarts from its first screen rather than showing its
 * last one again.
 */
export function nextIndex(index, screens, recycleFrom) {
  const next = index + 1;
  if (next < screens) return next;
  const back = Math.min(recycleFrom, screens) - 1;
  return back === index ? 0 : back;
}

/**
 * @param {object} options
 * @param {number} options.screens                     how many screens the lesson has (≥ 1)
 * @param {{correct: number, incorrect: number, cap: number}} [options.scoring]
 * @param {number} [options.recycleFrom]               1-based screen number to fall back to
 */
export function createSession({ screens, scoring = DEFAULT_SCORING, recycleFrom = DEFAULT_RECYCLE_FROM } = {}) {
  integer(screens, "screens", { min: 1 });
  integer(scoring?.correct, "scoring.correct", { min: 1 });
  integer(scoring?.incorrect, "scoring.incorrect", { min: -100, max: 0 });
  integer(scoring?.cap, "scoring.cap", { min: 1 });
  integer(recycleFrom, "recycleFrom", { min: 1 });

  return {
    screens,
    scoring: Object.freeze({ correct: scoring.correct, incorrect: scoring.incorrect, cap: scoring.cap }),
    recycleFrom,
    index: 0,
    score: 0,
    correct: 0,
    wrong: 0,
    complete: false,
  };
}

/** 1-based, because screens are numbered for humans in the progress dots. */
export function currentScreen(session) {
  return session.index + 1;
}

export function isComplete(session) {
  return session.complete;
}

/** How far through the cap the learner is, 0–1. */
export function progress(session) {
  return Math.min(1, session.score / session.scoring.cap);
}

/**
 * One graded answer. Returns the next session plus the events it produced — the caller
 * emits them, so the loop never reaches for a transport of its own.
 *
 * A graded answer on a finished session changes nothing and emits nothing: double
 * grading is the caller's bug, but it must not be able to inflate a score.
 */
export function recordVerdict(session, ok) {
  if (typeof ok !== "boolean") throw new Error(`recordVerdict needs a boolean, got ${String(ok)}`);
  const events = [];
  if (session.complete) return { session, events };

  const { correct: plus, incorrect: minus, cap } = session.scoring;

  if (!ok) {
    const score = Math.max(0, session.score + minus);
    events.push({ type: "check_wrong", props: { score, attempts: session.wrong + 1 } });
    return { session: { ...session, score, wrong: session.wrong + 1 }, events };
  }

  const score = Math.min(cap, session.score + plus);
  const complete = score >= cap;
  const index = complete ? session.index : nextIndex(session.index, session.screens, session.recycleFrom);
  events.push({ type: "check_correct", props: { score, attempts: session.correct + 1 } });
  events.push({ type: "screen_complete", props: { screen: currentScreen(session), score } });
  if (complete) events.push({ type: "lesson_complete", props: { score, correct: session.correct + 1, wrong: session.wrong } });

  return { session: { ...session, score, complete, index, correct: session.correct + 1 }, events };
}

/** Hand a batch of loop events to a sink; unknown names are refused by the sink itself. */
export function emitAll(sink, events) {
  let emitted = 0;
  for (const event of events) if (sink.emit(event.type, event.props)) emitted += 1;
  return emitted;
}
