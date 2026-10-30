/**
 * The browser's half of the progress path: hold the drill's events until there is something worth
 * sending, and hand them over one lesson at a time.
 *
 * Two things it must not do. It must not send a batch the server will refuse, so events are bucketed
 * by lesson (`deriveUpdates` accepts one lesson per batch) and capped well under the 500-event limit.
 * And it must not lose an event when a flush is refused, so `take`/`restore` are separate operations:
 * a failed POST puts the same objects back rather than re-deriving them.
 *
 * Pure and DOM-free, so `tests/progress-sender.test.js` imports it instead of restating it.
 */
import { EVENT_TYPES } from "../../packages/session/events.js";

const KNOWN = new Set(EVENT_TYPES);

/** An event that means the lesson is over, so there is nothing left to wait for. */
export const FINAL_EVENTS = Object.freeze(["lesson_complete", "lesson_exhausted"]);

/** Below the server's 500, and small enough that a page-hide flush is not the first chance to send. */
export const FLUSH_AT = 120;

function lessonOf(event) {
  return typeof event?.id === "string" && event.id ? event.id : null;
}

/**
 * @param {object} [options]
 * @param {number} [options.limit]  events one lesson may accumulate before it is worth sending
 */
export function createCollector({ limit = FLUSH_AT } = {}) {
  if (!Number.isInteger(limit) || limit < 1) throw new Error("createCollector needs a positive limit");

  const seen = new WeakSet();
  const buckets = new Map();

  const bucket = (lessonId) => {
    let events = buckets.get(lessonId);
    if (!events) {
      events = [];
      buckets.set(lessonId, events);
    }
    return events;
  };

  return {
    /**
     * Accept one event from the sink.
     * @returns {string|null} the lesson that should be sent now, or `null`
     */
    add(event) {
      // The same object arrives twice when the sender seeds from the buffer an event it then receives
      // through the hook; identity is enough, because the sink never emits a copy.
      if (!event || typeof event !== "object" || seen.has(event)) return null;
      seen.add(event);
      const lessonId = lessonOf(event);
      // Nobody to attribute it to (`track_view` counts the whole track): not a progress event.
      if (!lessonId || !KNOWN.has(event.type)) return null;
      const events = bucket(lessonId);
      events.push(event);
      return FINAL_EVENTS.includes(event.type) || events.length >= limit ? lessonId : null;
    },

    /** Seed from the buffer the drill already fills, for events emitted before this code ran. */
    seed(events = []) {
      if (!Array.isArray(events)) return;
      for (const event of events) this.add(event);
    },

    /** Lesson ids with something pending, oldest first. */
    lessons() {
      return [...buckets.entries()].filter(([, events]) => events.length > 0).map(([id]) => id);
    },

    /** Remove and return this lesson's events; an empty array when there is nothing to send. */
    take(lessonId) {
      const events = buckets.get(lessonId);
      if (!events || events.length === 0) return [];
      buckets.set(lessonId, []);
      return events;
    },

    /** Put a refused batch back in front of anything that arrived while it was in flight. */
    restore(lessonId, events) {
      if (!Array.isArray(events) || events.length === 0) return;
      buckets.set(lessonId, [...events, ...(buckets.get(lessonId) ?? [])]);
    },
  };
}
