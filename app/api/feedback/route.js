/**
 * `POST /api/feedback` — the note the footer has been promising to keep.
 *
 * Until now the dialog queued a note in `localStorage` and said so. This is the other end: one row in
 * `feedback`, written with the service role because learners have no insert grant of their own and a
 * signed-out visitor has no identity at all. The account, when there is one, comes from the session
 * cookie — never from the body.
 *
 * The rate limit is per address and held in memory. That is honest for a single instance and not a
 * guarantee across a fleet; the alternative (a database counter per address) would put a write in
 * front of every note. Twelve notes in ten minutes is well past a stuck afternoon.
 */
import { createClient } from "@supabase/supabase-js";

import { authConfig } from "../../../lib/auth/config.js";
import { currentUser } from "../../../lib/auth/server.js";
import { RATE, overLimit, parseNote } from "../../../lib/feedback/note.js";
import { EVENTS, logEvent } from "../../../lib/log-event.js";

let cached = null;

function writeClient(env = process.env) {
  if (cached) return cached;
  const config = authConfig(env);
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!config.enabled || typeof key !== "string" || key.length === 0) return null;
  cached = createClient(config.url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { "x-application-name": "excelsupreme-feedback" } },
  });
  return cached;
}

/** One address's recent notes. Bounded so a busy day cannot grow the map without limit. */
const filed = new Map();
const MAX_ADDRESSES = 5000;

function addressOf(request) {
  const forwarded = request.headers.get("x-forwarded-for") ?? "";
  return forwarded.split(",")[0].trim() || request.headers.get("x-real-ip") || "unknown";
}

function recentFor(address, now) {
  const times = (filed.get(address) ?? []).filter((at) => now - at < RATE.window);
  if (times.length === 0) filed.delete(address);
  else filed.set(address, times);
  return times;
}

function json(body, status, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...headers },
  });
}

export async function POST(request) {
  const client = writeClient();
  if (!client) {
    // The browser falls back to its own queue and says the note stayed here, which is true.
    return json({ ok: false, error: "feedback_unconfigured" }, 503);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "body is not JSON" }, 400);
  }

  const parsed = parseNote(body);
  if (!parsed.ok) return json({ ok: false, error: parsed.error }, 400);

  const now = Date.now();
  const address = addressOf(request);
  const times = recentFor(address, now);
  if (overLimit(times, now)) {
    const wait = Math.max(1, Math.ceil((times[0] + RATE.window - now) / 1000));
    return json({ ok: false, error: "too_many_notes", retry_after: wait }, 429, { "retry-after": String(wait) });
  }

  if (filed.size >= MAX_ADDRESSES && !filed.has(address)) filed.delete(filed.keys().next().value);
  filed.set(address, [...times, now]);

  const { user } = await currentUser();
  const { error } = await client.from("feedback").insert({
    user_id: user?.id ?? null,
    page: parsed.note.page,
    body: parsed.note.text,
  });
  if (error) {
    console.error(`api/feedback: insert failed: ${error.message}`);
    logEvent(EVENTS.feedbackFailed, { page: parsed.note.page, reason: error.code ?? error.message });
    // Not the learner's fault and worth keeping: the browser queues it and can try again.
    return json({ ok: false, error: "feedback_write_failed" }, 502);
  }

  logEvent(EVENTS.feedbackReceived, { page: parsed.note.page, chars: parsed.note.text.length, signed_in: Boolean(user) });
  return json({ ok: true }, 201);
}

/** The route only takes notes; a GET is a question nobody asked, answered honestly. */
export async function GET() {
  return json({ ok: false, error: "method_not_allowed" }, 405, { allow: "POST" });
}
