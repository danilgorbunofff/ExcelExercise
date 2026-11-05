/**
 * The record of a thing going wrong, and the one wire that can carry it off the box.
 *
 * Until this existed the site had no answer to "is it up, and did it break": a render error reached
 * `app/error.js`, which could only `console.error` it, and a failed request reached nobody at all.
 * On a serverless host that console line is evicted within hours and nothing is watching it.
 *
 * Two halves, deliberately separable:
 *
 * - **A record.** `errorRecord()` turns whatever was thrown into a small, flat, sanitized object. The
 *   same rules as `log-event.js` apply and for the same reason: `/privacy` says nothing joins these
 *   logs to an account, so an error record may name a route and a digest but never a person, an
 *   address or a token. The message is kept because a stack trace without it is a riddle.
 * - **An optional wire.** If `ERROR_SINK_URL` is set, the record is also POSTed there, fire-and-forget
 *   with a timeout. Unset is a fully supported state: the record still goes to stdout, which is where
 *   a host's log viewer reads it. That is what keeps this vendor-neutral — pointing it at a service
 *   later is an environment variable, not a code change.
 *
 * Nothing here throws or blocks. A reporter that turns a handled error into an unhandled one, or that
 * adds two seconds to a 500, is worse than no reporter.
 */
import { logEvent } from "./log-event.js";

const MAX_MESSAGE = 200;
const MAX_PATH = 120;
const MAX_FRAMES = 3;
const MAX_FRAME = 120;

/** How long the outbound POST may take before it is abandoned. */
export const SINK_TIMEOUT = 2000;

/** A burst guard, per instance: a render loop must not become a denial of service on the sink. */
export const BURST = Object.freeze({ window: 10 * 60 * 1000, limit: 60 });

function text(value, max) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed.slice(0, max);
}

/** A path never needs its query string: it is the part that carries somebody's form input. */
function pathOf(request) {
  const path = request?.path;
  if (typeof path !== "string") return undefined;
  return text(path.split("?")[0], MAX_PATH);
}

/** The first few frames, which is where the answer is, and no further. */
function framesOf(error) {
  const stack = error?.stack;
  if (typeof stack !== "string") return undefined;
  const frames = stack
    .split("\n")
    .filter((line) => line.trim().startsWith("at "))
    .slice(0, MAX_FRAMES)
    .map((line) => line.trim().slice(0, MAX_FRAME));
  return frames.length === 0 ? undefined : frames;
}

/**
 * What was thrown, as a record.
 *
 * `request` and `context` are the shapes Next hands `onRequestError`: a path and method, and how the
 * error was reached (which route file, rendering or a route handler or an action).
 */
export function errorRecord(error, { request, context } = {}) {
  const record = {
    name: text(error?.name, 60) ?? "Error",
    message: text(error?.message, MAX_MESSAGE) ?? text(String(error ?? ""), MAX_MESSAGE),
    digest: text(typeof error?.digest === "string" ? error.digest : undefined, 60),
    route: text(context?.routePath, MAX_PATH),
    routeType: text(context?.routeType, 20),
    renderSource: text(context?.renderSource, 40),
    method: text(request?.method, 10),
    path: pathOf(request),
    frames: framesOf(error),
  };
  for (const key of Object.keys(record)) if (record[key] === undefined) delete record[key];
  return record;
}

/** The sink, if it is a url this module is willing to call. Anything else is off. */
export function sinkUrl(env = process.env) {
  const raw = env?.ERROR_SINK_URL;
  if (typeof raw !== "string" || raw.length === 0) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

const sent = [];

function maySend(now) {
  while (sent.length > 0 && now - sent[0] > BURST.window) sent.shift();
  if (sent.length >= BURST.limit) return false;
  sent.push(now);
  return true;
}

/**
 * Record one error, and forward it if a sink is configured.
 *
 * @param {unknown} error - whatever was caught.
 * @param {{ request?: object, context?: object }} [sources] - Next's request and context.
 * @param {{ env?: object, now?: () => number, fetchImpl?: typeof fetch, sink?: object }} [options]
 * @returns {Promise<{ record: object, forwarded: boolean } | null>} null only if even logging failed.
 */
export async function reportError(error, sources = {}, options = {}) {
  const { env = process.env, now = () => Date.now(), fetchImpl = globalThis.fetch, sink = console } = options;
  try {
    const record = errorRecord(error, sources);
    logEvent("error", record, { sink });

    const url = sinkUrl(env);
    if (!url || typeof fetchImpl !== "function" || !maySend(now())) return { record, forwarded: false };

    await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event: "error", at: new Date(now()).toISOString(), ...record }),
      signal: AbortSignal.timeout(SINK_TIMEOUT),
      // A response nobody reads is a socket the runtime cannot close early.
      keepalive: true,
    });
    return { record, forwarded: true };
  } catch {
    // Deliberately silent: the caller is already handling a failure, and the record went to stdout
    // before the wire was tried.
    return null;
  }
}

/** Only for tests: the burst window is process state and has to be resettable. */
export function resetBurst() {
  sent.length = 0;
}
