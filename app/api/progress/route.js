/**
 * `POST /api/progress` — the one way a signed-in learner's progress reaches the database.
 *
 * Two bodies, because there are two things to say:
 *
 *   * `{ batch_id, events }` — the buffer the drill fills in memory. Every row is derived from those
 *     events (`lib/progress/derive.js`), so a browser cannot post itself a score.
 *   * `{ batch_id, lessons }` — the roll-up a signed-out browser kept in `es.progress`. It carries no
 *     screen visits, so it writes `lesson_progress` only and never `attempts` (`lib/progress/migrate.js`).
 *
 * Both are idempotent on the same batch id, both check the lesson ids against the catalog, and both
 * refuse rather than pretend: without accounts configured the answer is 503, and an anonymous request
 * is 401 — the drills keep working locally either way.
 *
 * A batch that lands is also credited (phase 5): points per payable screen, and the streak on the
 * day's first completion. That happens after the write, in `lib/retention/write.js`, and a refusal
 * there is logged rather than returned — the lesson is recorded either way, and re-sending a batch to
 * collect points it already collected would be the wrong trade.
 */
import { authConfig } from "../../../lib/auth/config.js";
import { currentUser } from "../../../lib/auth/server.js";
import { parseBatch } from "../../../lib/progress/derive.js";
import { parseMigration } from "../../../lib/progress/migrate.js";
import { importProgress, progressClient, writeBatch } from "../../../lib/progress/write.js";
import { creditBatch } from "../../../lib/retention/write.js";
import { loadSite } from "../../../lib/site.js";

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

/** The signed-out roll-up path: one RPC over the whole list, no attempts, no accuracy. */
async function migrate({ client, user, body }) {
  const parsed = parseMigration(body);
  if (!parsed.ok) return json({ ok: false, error: parsed.error }, 400);

  const known = new Set(loadSite().index.map((candidate) => candidate.exercise.id));
  const unknown = parsed.lessons.find((lesson) => !known.has(lesson.lesson_id));
  if (unknown) return json({ ok: false, error: `unknown lesson: ${unknown.lesson_id}` }, 400);

  const result = await importProgress(client, { user, batchId: parsed.batchId, lessons: parsed.lessons });
  if (!result.ok) {
    return result.conflict
      ? json({ ok: false, error: "batch_id_conflict" }, 409)
      : json({ ok: false, error: result.error }, 502);
  }

  return json({ ok: true, replayed: result.replayed, lessons: result.lessons }, result.replayed ? 200 : 201);
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

  // A migration says `lessons`; an event batch says `events`. Anything else falls through to the event
  // parser, which rejects it with the error a caller can act on.
  if (Array.isArray(body?.lessons)) return migrate({ client, user, body });

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

  // The batch is committed; points and the streak are what it was worth. This runs after the fact and
  // its failure is a log line, not a status: a completed lesson is complete whether or not the award
  // answered, and asking the browser to retry a batch it already landed would be worse than losing a
  // day's points. `creditBatch` also refuses to re-ask on a replay, where the claim is already spent.
  let credit = { points: null, streak: null };
  try {
    credit = await creditBatch(client, {
      user,
      lessonId: parsed.lessonId,
      attempts: parsed.attempts,
      summary: parsed.summary,
      replayed: result.replayed,
    });
    if (credit.points?.ok === false) console.error(`api/progress: award refused — ${credit.points.error}`);
    if (credit.streak?.ok === false) console.error(`api/progress: streak refused — ${credit.streak.error}`);
  } catch (error) {
    console.error("api/progress: the retention write threw, the batch stands", error);
  }

  return json(
    {
      ok: true,
      replayed: result.replayed,
      attempts: result.attempts,
      status: result.status,
      score: result.score,
      first_try_accuracy: result.firstTryAccuracy,
      points: credit.points?.ok ? { awarded: credit.points.awarded, total: credit.points.total } : null,
      streak: credit.streak?.ok ? { current: credit.streak.current, longest: credit.streak.longest } : null,
    },
    result.replayed ? 200 : 201,
  );
}
