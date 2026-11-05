/**
 * One line per server-side thing nobody would notice afterwards.
 *
 * There is no analytics provider and `/privacy` says so, so the operational record has to come from
 * this process: whether a checkout attempt started, what Stripe said when it did not, whether a note
 * from the feedback dialog was stored, whether a content page was rendered and did its reader start
 * the exercise. `scripts/content-report.mjs` turns those last ones into the phase-7 funnel. A launch with none of that cannot tell "nobody wanted to buy"
 * from "the buy button answered 500 for six days".
 *
 * The one rule that makes this compatible with the privacy page: **a line is never about a person.**
 * `IDENTITY` drops the fields that would identify someone and any value that looks like an address, so
 * the sentence "nothing joins these logs to an account" stays true by construction rather than by care.
 *
 * Failure is swallowed on purpose: every caller is already inside a catch block or a refusal path, and
 * a logger that turns a handled error into an unhandled one is worse than no logger.
 */

export const EVENTS = Object.freeze({
  checkoutStarted: "checkout_started",
  checkoutRefused: "checkout_refused",
  checkoutFailed: "checkout_failed",
  feedbackReceived: "feedback_received",
  feedbackFailed: "feedback_failed",
  // The funnel. Four of the five rates on the phase-7 scorecard are these plus the checkout's own
  // event; the fifth needs a form that collects an address, and nothing here does (the offer form is
  // the Stripe checkout, which already logs `checkout_started`).
  contentRendered: "content_rendered",
  drillStarted: "drill_started",
  drillCompleted: "drill_completed",
  paywallShown: "paywall_shown",
});

/** Field names that would make a record about a person. */
const IDENTITY = new Set([
  "email",
  "user",
  "user_id",
  "userId",
  "id",
  "account",
  "account_id",
  "ip",
  "address",
  "card",
  "token",
  "cookie",
]);

/** A value that looks like an address or a bearer token is dropped wherever it appears. */
const LOOKS_LIKE_IDENTITY = /@|^sk_|^whsec_|^ey[A-Za-z0-9_-]{10,}/;

function safe(value, depth = 0) {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
  if (typeof value === "string") return LOOKS_LIKE_IDENTITY.test(value) ? undefined : value.slice(0, 200);
  if (typeof value !== "object" || depth > 2) return undefined;
  if (Array.isArray(value)) return value.map((item) => safe(item, depth + 1)).filter((item) => item !== undefined).slice(0, 20);
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (IDENTITY.has(key)) continue;
    const clean = safe(item, depth + 1);
    if (clean !== undefined) out[key] = clean;
  }
  return out;
}

/**
 * Write one event line.
 *
 * @param {string} kind - one of `EVENTS`; free text is accepted so a caller is never blocked by a list.
 * @param {Record<string, unknown>} [fields] - numbers, booleans and short strings about the request.
 * @param {{ sink?: { info: (line: string) => void } }} [options] - a sink, for tests.
 */
export function logEvent(kind, fields = {}, { sink = console } = {}) {
  try {
    const record = { event: String(kind ?? "unknown").slice(0, 60), at: new Date().toISOString(), ...safe(fields ?? {}) };
    const line = JSON.stringify(record);
    (sink?.info ?? (() => {})).call(sink, line);
    return record;
  } catch {
    // Never throws: see the note at the top of this file.
    return null;
  }
}
