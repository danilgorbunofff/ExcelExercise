/**
 * `/api/events` — the anonymous funnel step, one line in the log.
 *
 * Three facts arrive here and nowhere else: an exercise was started, an exercise was completed, a paywall was
 * shown. They are the numerator and denominator of the phase-7 scorecard, and the only reason they
 * cannot be derived from `/api/progress` is that most readers are signed out — the exercise works without
 * an account, so the completion the database never sees still has to be counted somewhere.
 *
 * What makes that compatible with `/privacy` is the shape of what is accepted. The body is a closed
 * set of two things: an event name from `lib/log-event.js` and a field object whose every key is in
 * `SHAPES` below and whose values are a surface, a slug and two small counts. No cookie is read
 * (`credentials: omit` on the client, and nothing here looks anyway), no address is stored, and the
 * answer a learner typed is never in the body — `attempts` counts them. A batch of pointless lines is
 * the worst an abuser can produce, and that is the same kind of line the process already writes for a
 * checkout.
 *
 * The endpoint answers 204 to anything it accepts and 400 to anything it will not, so a typo in a
 * client shows up in the network panel instead of vanishing into a silent drop. There is no retry
 * contract: the funnel client reads a failure as "this build has no endpoint" and stops for the visit.
 */
import { EVENTS, logEvent } from "../../../lib/log-event.js";

/** What each event is allowed to carry. A key outside the row is dropped, not an error. */
const SHAPES = Object.freeze({
  drill_started: ["surface", "slug"],
  drill_completed: ["surface", "slug", "attempts", "seconds"],
  paywall_shown: ["surface", "slug"],
});

/** Which `EVENTS` key each accepted name logs under. */
const KINDS = Object.freeze({
  drill_started: "drillStarted",
  drill_completed: "drillCompleted",
  paywall_shown: "paywallShown",
});

const SURFACES = new Set(["lesson", "formula", "article"]);
const SLUG = /^[a-z0-9][a-z0-9-]{0,79}$/;
const MAX_COUNT = 10_000;

/** One field, or `undefined` when it is not a shape the report prints. */
function field(key, value) {
  if (key === "surface") return SURFACES.has(value) ? value : undefined;
  if (key === "slug") return typeof value === "string" && SLUG.test(value) ? value : undefined;
  if (key === "attempts" || key === "seconds") {
    return Number.isInteger(value) && value >= 0 && value <= MAX_COUNT ? value : undefined;
  }
  return undefined;
}

const NO_STORE = { "cache-control": "no-store" };

function refuse() {
  return new Response(null, { status: 400, headers: NO_STORE });
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return refuse();
  }

  const event = String(body?.event ?? "");
  const allowed = SHAPES[event];
  if (!allowed) return refuse();

  const fields = {};
  for (const key of allowed) {
    const clean = field(key, body?.fields?.[key]);
    if (clean !== undefined) fields[key] = clean;
  }

  // A line with no surface is a line the report cannot place in a denominator.
  if (!fields.surface) return refuse();

  logEvent(EVENTS[KINDS[event]], fields);
  return new Response(null, { status: 204, headers: NO_STORE });
}
