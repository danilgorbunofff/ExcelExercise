/**
 * The client sends the event buffer it already keeps (`globalThis.__esEvents`); this module turns it
 * into the two rows the database wants: one attempt per screen the learner actually worked on, and the
 * lesson roll-up.
 *
 * Deriving on the server rather than trusting a summary is the point: a browser can post any numbers it
 * likes, so the only thing worth accepting from it is what happened, in order. Everything a report reads
 * — attempts, wrong counts, whether the reference answer was used, first-try accuracy — is computed
 * here from that sequence, and `first_try_accuracy` is recomputed again in SQL from the inserted rows.
 *
 * Pure and DOM-free, so `tests/progress-sync.test.js` imports it instead of restating it.
 */
import { EVENT_TYPES } from "../../packages/session/events.js";

const KNOWN = new Set(EVENT_TYPES);

/** A session buffer is capped at 500 events by the sink; a body that claims more is not one of ours. */
export const MAX_BATCH_EVENTS = 500;

function isScreen(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function stamp(value) {
  if (typeof value !== "string") return null;
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
}

/**
 * @param {unknown} events
 * @returns {{ok: true, lessonId: string, attempts: object[], summary: object} | {ok: false, error: string}}
 */
export function deriveUpdates(events) {
  if (!Array.isArray(events)) return { ok: false, error: "events must be an array" };
  if (events.length > MAX_BATCH_EVENTS) {
    return { ok: false, error: `a batch carries at most ${MAX_BATCH_EVENTS} events` };
  }

  let lessonId = null;
  let open = null;
  let score = 0;
  let wrong = 0;
  let helped = false;
  let completed = false;
  let ms = null;
  const attempts = [];

  const close = (endedAt) => {
    if (!open) return;
    // A screen the learner only looked at is not an attempt: counting it would drag first-try accuracy
    // down for a visit that produced no answer.
    if (open.wrong > 0 || open.correct || open.helped) {
      attempts.push({
        screen_id: `screen-${open.screen}`,
        started_at: open.started_at,
        ended_at: endedAt ?? open.last_at,
        correct_first_try: open.correct && open.wrong === 0 && !open.helped,
        wrong_count: open.wrong,
        help_used: open.helped,
        answer: null,
      });
    }
    open = null;
  };

  for (const event of events) {
    if (!event || typeof event !== "object" || Array.isArray(event)) {
      return { ok: false, error: "every event must be an object" };
    }
    if (!KNOWN.has(event.type)) return { ok: false, error: `unknown event type: ${String(event.type)}` };
    const at = stamp(event.ts);
    if (!at) return { ok: false, error: `event has no usable timestamp: ${String(event.type)}` };

    if (typeof event.id === "string" && event.id) {
      if (lessonId === null) lessonId = event.id;
      else if (event.id !== lessonId) return { ok: false, error: "one batch carries one lesson" };
    }

    switch (event.type) {
      case "screen_view":
        // Moving on closes whatever was open, even if the learner left it unsolved.
        close(at);
        if (isScreen(event.screen)) {
          open = { screen: event.screen, started_at: at, last_at: at, wrong: 0, correct: false, helped: false };
        }
        break;
      case "check_wrong":
        wrong += 1;
        if (open) {
          open.wrong += 1;
          open.last_at = at;
        }
        break;
      case "check_correct":
        if (open) {
          open.correct = true;
          open.last_at = at;
        }
        break;
      case "screen_complete":
        close(at);
        break;
      case "hint_open":
      case "solution_reveal":
        helped = true;
        if (open) {
          open.helped = true;
          open.last_at = at;
        }
        break;
      case "lesson_complete":
        completed = true;
        close(at);
        if (typeof event.elapsed === "number" && Number.isFinite(event.elapsed)) {
          ms = Math.round(event.elapsed * 1000);
        }
        break;
      default:
        break;
    }

    if (typeof event.score === "number" && Number.isFinite(event.score)) score = Math.max(score, event.score);
  }
  close(null);

  if (lessonId === null) return { ok: false, error: "no event named a lesson" };

  return {
    ok: true,
    lessonId,
    attempts,
    summary: {
      score: Math.min(100, Math.max(0, Math.round(score))),
      wrong,
      helped,
      ms: ms ?? null,
      completed,
    },
  };
}

/** A uuid v4 the database will accept as a primary key; the browser's `crypto.randomUUID` fills this. */
const BATCH_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * The request body, checked before anything is derived. `batch_id` is the client's idempotency key, so
 * it is required rather than generated here: generating it server-side would make every retry a new
 * write.
 */
export function parseBatch(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "body must be an object" };
  }
  if (typeof body.batch_id !== "string" || !BATCH_ID.test(body.batch_id)) {
    return { ok: false, error: "batch_id must be a uuid" };
  }
  const derived = deriveUpdates(body.events);
  if (!derived.ok) return derived;
  return { ok: true, batchId: body.batch_id, ...derived };
}
