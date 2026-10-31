/**
 * `/api/progress` — the one way a signed-in learner's progress crosses between the browser and the
 * database, in both directions.
 *
 * `POST` has two bodies, because there are two things to say:
 *
 *   * `{ batch_id, events }` — the buffer the drill fills in memory. Every row is derived from those
 *     events (`lib/progress/derive.js`), so a browser cannot post itself a score.
 *   * `{ batch_id, lessons }` — the roll-up a signed-out browser kept in `es.progress`. It carries no
 *     screen visits, so it writes `lesson_progress` only and never `attempts` (`lib/progress/migrate.js`).
 *
 * Both are idempotent on the same batch id, both check the lesson ids against the catalog (the drill
 * track's and the project track's, which is `entryForLesson` below), and both
 * refuse rather than pretend: without accounts configured the answer is 503, and an anonymous request
 * is 401 — the drills keep working locally either way.
 *
 * A batch that lands is also credited (phase 5): points per payable screen, and the streak on the
 * day's first completion. That happens after the write, in `lib/retention/write.js`, and a refusal
 * there is logged rather than returned — the lesson is recorded either way, and re-sending a batch to
 * collect points it already collected would be the wrong trade.
 *
 * `GET` is the other half: the dashboard reads its counts from `localStorage`, so without it a signed-in
 * learner on a second browser sees an empty track. It answers the same record shape the island parses.
 */
import { authConfig } from "../../../lib/auth/config.js";
import { currentUser } from "../../../lib/auth/server.js";
import { parseBatch } from "../../../lib/progress/derive.js";
import { parseMigration } from "../../../lib/progress/migrate.js";
import { recordFrom } from "../../../lib/progress/record.js";
import { importProgress, progressClient, writeBatch } from "../../../lib/progress/write.js";
import { loadProjectTrack } from "../../../lib/projects.js";
import { creditBatch } from "../../../lib/retention/write.js";
import { loadSite } from "../../../lib/site.js";

/**
 * Where a lesson id lives. A project is a lesson in every way the write path cares about — same
 * screens, same batch, same table — so it resolves through the same lookup; what differs is the track
 * column, which is how the database says which shelf the completion belongs to. Both values are already
 * in the schema's check.
 */
function entryForLesson(lessonId) {
  const project = loadProjectTrack().index.find((candidate) => candidate.exercise.id === lessonId);
  if (project) return { entry: project, track: "project" };
  const lesson = loadSite().index.find((candidate) => candidate.exercise.id === lessonId);
  return lesson ? { entry: lesson, track: "excel" } : null;
}

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

  const resolved = parsed.lessons.map((lesson) => ({ lesson, entry: entryForLesson(lesson.lesson_id) }));
  const unknown = resolved.find((item) => !item.entry);
  if (unknown) return json({ ok: false, error: `unknown lesson: ${unknown.lesson.lesson_id}` }, 400);

  const result = await importProgress(client, {
    user,
    batchId: parsed.batchId,
    lessons: resolved.map(({ lesson, entry }) => ({ ...lesson, track: entry.track })),
  });
  if (!result.ok) {
    return result.conflict
      ? json({ ok: false, error: "batch_id_conflict" }, 409)
      : json({ ok: false, error: result.error }, 502);
  }

  return json({ ok: true, replayed: result.replayed, lessons: result.lessons }, result.replayed ? 200 : 201);
}

/**
 * `GET /api/progress` — what the database thinks this learner has finished, in the browser's own shape.
 *
 * The dashboard is a prerendered page filled by an island, so before this route existed a signed-in
 * learner's copy on a second browser read "0 of 88" while the database held a finished track: the only
 * store the island knew about was `localStorage`. The answer is deliberately the roll-up record
 * (`{ v, done, tries, unlocked }`, see `lib/progress/record.js`) rather than the richer rows, because
 * the island already parses exactly that and a second shape would mean a second code path.
 *
 * Anonymous and unconfigured are answers, not errors: the static edition and the accounts-off
 * deployment both call this from the same island, and both should keep working off `localStorage`.
 */
export async function GET() {
  if (!authConfig().enabled) return json({ ok: true, signed_in: false, configured: false }, 200);

  const { supabase, user } = await currentUser();
  if (!user || !supabase) return json({ ok: true, signed_in: false }, 200);

  const { data, error } = await supabase
    .from("lesson_progress")
    .select("lesson_id, status, attempts, helped, completed_at, last_seen_at")
    .order("last_seen_at", { ascending: false });
  if (error) {
    console.error(`api/progress: reading lesson_progress failed: ${error.message}`);
    return json({ ok: false, error: "progress_read_failed" }, 502);
  }

  return json({ ok: true, signed_in: true, progress: recordFrom(data) }, 200);
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
  const entry = entryForLesson(parsed.lessonId);
  if (!entry) return json({ ok: false, error: `unknown lesson: ${parsed.lessonId}` }, 400);

  const result = await writeBatch(client, {
    user,
    lessonId: parsed.lessonId,
    track: entry.track,
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
