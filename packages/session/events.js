/**
 * The player's event vocabulary, in one place, because two things depend on it: the
 * browser buffer the drill fills today and the collector that will read it later
 * (phase 10). A name that is not on this list never reaches the buffer, so a typo at a
 * call site shows up as a missing event in a test rather than as a wrong column in a
 * funnel three months from now.
 *
 * Nothing here touches the network or the DOM: `createSink` takes a `write` function,
 * which is what makes the whole module testable under `node --test`.
 */

export const EVENT_TYPES = Object.freeze([
  "drill_start",
  "screen_view",
  "check_correct",
  "check_wrong",
  "hint_open",
  "solution_reveal",
  "screen_complete",
  "lesson_complete",
  "lesson_exhausted",
  "lesson_abandon",
  "gate_view",
  "paywall_view",
  "paywall_email",
  "trial_start",
  "track_unlock",
  "track_view",
  "feedback_sent",
]);

const KNOWN = new Set(EVENT_TYPES);

/**
 * A session is bounded, so its buffer is too: a learner who leaves a tab open for an
 * afternoon must not accumulate an event per check forever.
 */
export const MAX_EVENTS = 500;

const DROPPED = Symbol("dropped");

/**
 * Flat primitives only. The collector's schema is a column per field, so a nested
 * object would either be stringified or rejected server-side; dropping it here keeps
 * the buffer honest, and the tests pin which shapes survive.
 */
function flatValue(value) {
  if (value === null) return null;
  const kind = typeof value;
  if (kind === "string" || kind === "boolean") return value;
  if (kind === "number") return Number.isFinite(value) ? value : DROPPED;
  return DROPPED;
}

function cleanProps(props) {
  if (typeof props !== "object" || props === null || Array.isArray(props)) return {};
  const clean = {};
  for (const [key, value] of Object.entries(props)) {
    const flat = flatValue(value);
    if (flat !== DROPPED) clean[key] = flat;
  }
  return clean;
}

/**
 * @param {object} options
 * @param {(event: object) => void} options.write  where an emitted event goes
 * @param {() => object} [options.context]         fields every event carries (route, track, ids)
 * @param {() => Date} [options.now]               injectable clock, so tests need no timers
 */
export function createSink({ write, context = () => ({}), now = () => new Date() } = {}) {
  if (typeof write !== "function") throw new Error("createSink needs a write(event) function");
  if (typeof context !== "function") throw new Error("createSink context must be a function");
  if (typeof now !== "function") throw new Error("createSink now must be a function");

  let count = 0;

  return {
    /** True when the event was accepted; false for an unknown name or a full buffer. */
    emit(type, props = {}) {
      if (!KNOWN.has(type)) return false;
      if (count >= MAX_EVENTS) return false;
      const ts = new Date(now()).toISOString();
      // `type` and `ts` are the schema, not caller data, so they are written last.
      const event = { ...cleanProps(context()), ...cleanProps(props), type, ts };
      count += 1;
      write(event);
      return true;
    },
    get count() {
      return count;
    },
  };
}
