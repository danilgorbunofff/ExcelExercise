/**
 * Session timing: how long the learner has been working, how much of the session
 * budget is left, and a pause that survives a background tab.
 *
 * The clock takes `now` as a parameter rather than calling `Date.now()` itself, so the
 * whole file is testable without sleeping, and so "paused" is a fact the tests can
 * prove instead of a fact we hope for. A suspension that is *not* paused (a laptop lid
 * left open for an hour) counts as elapsed time — the budget is wall-clock — which is
 * why pause is explicit rather than inferred from a timer.
 */

export const DEFAULT_SESSION_MINUTES = 60;

const MINUTE_MS = 60_000;

function minutes(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`sessionMinutes must be a positive number, got ${String(value)}`);
  }
  return value;
}

/**
 * @param {object} options
 * @param {() => number} [options.now]      injectable millisecond clock
 * @param {number} [options.sessionMinutes] wall-clock budget, default 60
 */
export function createClock({ now = () => Date.now(), sessionMinutes = DEFAULT_SESSION_MINUTES } = {}) {
  if (typeof now !== "function") throw new Error("createClock now must be a function");
  const budgetMs = minutes(sessionMinutes) * MINUTE_MS;

  let accumulated = 0;
  let runningSince = now();

  // A clock that steps backwards (an NTP correction, a user changing the system time)
  // must not produce negative elapsed time, so a backwards jump counts as zero.
  function elapsed() {
    return accumulated + (runningSince === null ? 0 : Math.max(0, now() - runningSince));
  }

  return {
    elapsedMs: elapsed,
    remainingMs() {
      return Math.max(0, budgetMs - elapsed());
    },
    expired() {
      return budgetMs - elapsed() <= 0;
    },
    isPaused() {
      return runningSince === null;
    },
    /** Idempotent: pausing a paused clock must not credit the same gap twice. */
    pause() {
      if (runningSince === null) return;
      accumulated = elapsed();
      runningSince = null;
    },
    /** Idempotent for the same reason, and it never rewinds the accumulated time. */
    resume() {
      if (runningSince !== null) return;
      runningSince = now();
    },
  };
}
