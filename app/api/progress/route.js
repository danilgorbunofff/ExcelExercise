/**
 * `POST /api/progress` — the one way a signed-in learner's screen visits reach the database.
 *
 * The body is `{ batch_id, events }`: the same buffer the drill already fills in memory. Everything
 * that becomes a row is derived from those events (`lib/progress/derive.js`), so a browser cannot post
 * itself a score. Without accounts configured the route answers 503 rather than pretending, and an
 * anonymous request is 401 — the drills keep working locally either way.
 */
import { authConfig } from "../../../lib/auth/config.js";
import { currentUser } from "../../../lib/auth/server.js";
import { parseBatch } from "../../../lib/progress/derive.js";
import { progressClient, writeBatch } from "../../../lib/progress/write.js";
import { loadSite } from "../../../lib/site.js";

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export async function POST(request) {
  if (!authConfig().enabled) {
    return json({ ok: false, error: "progress_sync_unconfigured" }, 503);
  }

  const { user } = await currentUser();
  if (!user) return json({ ok: false, error: "sign_in_required" }, 401);

  const client = progressClient();
  if (!client) {
    // Configured for browsers but no service key: a deployment mistake, and a loud one.
    console.error("api/progress: SUPABASE_SERVICE_ROLE_KEY is unset, cannot write progress");
    return json({ ok: false, error: "progress_write_unconfigured" }, 503);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "body is not JSON" }, 400);
  }

  const parsed = parseBatch(body);
  if (!parsed.ok) return json({ ok: false, error: parsed.error }, 400);

  // The lesson id comes from the events, so it is checked against the catalog before it becomes a
  // primary-key component: an unknown id would otherwise sit in the table forever.
  const entry = loadSite().index.find((candidate) => candidate.exercise.id === parsed.lessonId);
  if (!entry) return json({ ok: false, error: `unknown lesson: ${parsed.lessonId}` }, 400);

  const result = await writeBatch(client, {
    user,
    lessonId: parsed.lessonId,
    track: "excel",
    batchId: parsed.batchId,
    attempts: parsed.attempts,
    summary: parsed.summary,
  });

  if (!result.ok) {
    return result.conflict
      ? json({ ok: false, error: "batch_id_conflict" }, 409)
      : json({ ok: false, error: result.error }, 502);
  }

  return json(
    {
      ok: true,
      replayed: result.replayed,
      attempts: result.attempts,
      status: result.status,
      score: result.score,
      first_try_accuracy: result.firstTryAccuracy,
    },
    result.replayed ? 200 : 201,
  );
}
