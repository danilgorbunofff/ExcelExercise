/**
 * `GET /api/account/export` — everything this site holds about the signed-in learner, as one JSON file.
 *
 * Read through the learner's own session, not the service role: `profiles`, `lesson_progress`,
 * `attempts`, `daily_points` and `streaks` are filtered by row-level security to `auth.uid()`, so a
 * bug in this route can only ever return the data the caller already owns. The two money tables carry
 * no grant for learners at all (0002), so their history arrives through `my_entitlements()` and
 * `my_payments()`, which are self-scoped in SQL.
 *
 * Nothing here is a privileged read, which is the point: an export that needed the service-role key
 * would be a root-key read path with a user-facing button on it.
 */
import { authConfig } from "../../../../lib/auth/config.js";
import { currentUser } from "../../../../lib/auth/server.js";
import { buildExport, exportFilename } from "../../../../lib/legal.js";

function json(body, status, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...headers },
  });
}

/** Column lists rather than `*`: the document is a contract, and a new column should be a decision. */
const READS = {
  profile: ["profiles", "id, username, display_name, linkedin_url, timezone, role, created_at"],
  progress: [
    "lesson_progress",
    "lesson_id, track, status, score, attempts, wrong_count, helped, first_try_accuracy, best_ms, completed_at, last_seen_at",
  ],
  attempts: [
    "attempts",
    "lesson_id, screen_id, attempt_seq, started_at, ended_at, correct_first_try, wrong_count, help_used, answer",
  ],
  points: ["daily_points", "day, points"],
  streaks: ["streaks", "current, longest, last_day"],
};

export async function GET() {
  if (!authConfig().enabled) {
    return json({ ok: false, error: "account_export_unconfigured" }, 503);
  }

  const { supabase, user } = await currentUser();
  if (!supabase || !user) return json({ ok: false, error: "sign_in_required" }, 401);

  const [profile, progress, attempts, points, streaks, entitlements, payments] = await Promise.all([
    supabase
      .from(READS.profile[0])
      .select(READS.profile[1])
      .eq("id", user.id)
      .maybeSingle(),
    supabase.from(READS.progress[0]).select(READS.progress[1]).eq("user_id", user.id).order("lesson_id"),
    supabase
      .from(READS.attempts[0])
      .select(READS.attempts[1])
      .eq("user_id", user.id)
      .order("started_at")
      .order("attempt_seq"),
    supabase.from(READS.points[0]).select(READS.points[1]).eq("user_id", user.id).order("day"),
    supabase.from(READS.streaks[0]).select(READS.streaks[1]).eq("user_id", user.id).maybeSingle(),
    supabase.rpc("my_entitlements"),
    supabase.rpc("my_payments"),
  ]);

  // A failed read is a refused export, never a document with a hole in it: an export missing half of
  // the learner's attempts would look complete and would be wrong.
  const failed = [profile, progress, attempts, points, streaks, entitlements, payments].find(
    (result) => result.error,
  );
  if (failed) {
    console.error(`api/account/export: ${failed.error.code ?? "error"} ${failed.error.message}`);
    return json({ ok: false, error: "export_failed" }, 502);
  }

  const document = buildExport({
    user,
    profile: profile.data ?? null,
    progress: progress.data ?? [],
    attempts: attempts.data ?? [],
    points: points.data ?? [],
    streaks: streaks.data ? [streaks.data] : [],
    entitlements: entitlements.data ?? [],
    payments: payments.data ?? [],
  });

  return new Response(JSON.stringify(document, null, 2), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${exportFilename()}"`,
      "cache-control": "no-store",
    },
  });
}
