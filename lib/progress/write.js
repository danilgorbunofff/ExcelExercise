/**
 * The write half of the progress path: one RPC call, with the service-role client.
 *
 * Learners hold read-only grants on `lesson_progress` and `attempts` (0002), so the credentials that
 * write them must never reach a browser. `SUPABASE_SERVICE_ROLE_KEY` is read here, on the server, and
 * only here; the route refuses the request when it is absent rather than falling back to the anon key,
 * which would fail as a 403 nobody can explain.
 */
import { createClient } from "@supabase/supabase-js";

import { authConfig } from "../auth/config.js";

let cached = null;

/** The service-role client, or `null` when the deployment has no key configured. */
export function progressClient(env = process.env) {
  if (cached) return cached;
  const config = authConfig(env);
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!config.enabled || typeof key !== "string" || key.length === 0) return null;
  cached = createClient(config.url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { "x-application-name": "excelsupreme-progress-writer" } },
  });
  return cached;
}

/**
 * One batch, one transaction inside the database. The RPC owns the idempotency claim and the
 * `attempt_seq` assignment, so this function only has to be honest about the outcome: `replayed` is a
 * success (the caller retried), and anything else is a failure the client may retry with a new batch id.
 *
 * @returns {Promise<{ok: true, replayed: boolean, attempts: number, status?: string, score?: number, firstTryAccuracy?: number|null}
 *   | {ok: false, error: string, conflict?: boolean}>}
 */
export async function writeBatch(client, { user, lessonId, track, batchId, attempts, summary }) {
  const { data, error } = await client.rpc("record_progress", {
    p_user: user.id,
    p_lesson_id: lessonId,
    p_track: track,
    p_batch: batchId,
    p_attempts: attempts,
    p_score: summary.score,
    p_wrong: summary.wrong,
    p_helped: summary.helped,
    p_ms: summary.ms,
    p_completed: summary.completed,
  });

  // 23505 here is the collision guard, not a unique-violation on the rows themselves: the batch id
  // belongs to another account. Retrying with the same id would fail forever, so the caller needs to
  // know it may mint a new one — that is a 409, not a 502.
  if (error) return { ok: false, error: error.message, conflict: error.code === "23505" };
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") return { ok: false, error: "the database returned nothing" };

  return {
    ok: true,
    replayed: row.replayed === true,
    attempts: Number(row.attempts ?? 0),
    status: row.status ?? undefined,
    score: row.score ?? undefined,
    firstTryAccuracy: row.first_try_accuracy ?? null,
  };
}

/**
 * The migration half: the same claim, the same service role, one RPC over the whole roll-up. Separate
 * from `writeBatch` because it writes no attempts and returns no accuracy — the two paths must not be
 * able to drift into one shape.
 *
 * @returns {Promise<{ok: true, replayed: boolean, lessons: number} | {ok: false, error: string, conflict?: boolean}>}
 */
export async function importProgress(client, { user, batchId, lessons }) {
  const { data, error } = await client.rpc("import_lesson_progress", {
    p_user: user.id,
    p_batch: batchId,
    p_lessons: lessons.map((lesson) => ({
      lesson_id: lesson.lesson_id,
      // The caller resolves the shelf: `excel` for a drill, `project` for a project. An old roll-up that
      // predates projects carries no track, and those are all drills.
      track: lesson.track ?? "excel",
      score: lesson.score ?? 0,
      helped: lesson.helped === true,
      completed_at: lesson.completed_at ?? null,
    })),
  });

  if (error) return { ok: false, error: error.message, conflict: error.code === "23505" };
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") return { ok: false, error: "the database returned nothing" };
  return { ok: true, replayed: row.replayed === true, lessons: Number(row.lessons ?? 0) };
}
