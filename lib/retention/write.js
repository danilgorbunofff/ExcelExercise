/**
 * The retention half of the progress write: what a landed batch pays, and whether it moved the streak.
 *
 * This runs *after* `record_progress` has committed, and its result is not the point of the request.
 * Progress is the primary record — a lesson that completed is complete whether or not the points call
 * answered — so every failure here is reported, logged by the route, and never allowed to fail the
 * batch. `tests/retention-write.test.js` imports these functions with a recording client and asserts
 * both halves: which screens are asked to pay, and that a refusal is a value rather than an exception.
 *
 * The award and the ceiling are decided in SQL (`award_points`, 0009) because they need the row lock.
 * What is decided here is the smaller question: which screens are worth asking about, and which day
 * the learner is having.
 */
import { retentionFlags } from "../flags.js";
import { FALLBACK_TIMEZONE, awardForLesson, dayKey } from "./points.js";

/**
 * The screens a batch pays for.
 *
 * An attempt row exists only when the learner answered something, so presence already means "got
 * there". Two rows still do not pay: one where the reference answer was used, because that is the
 * product handing over the answer rather than the learner producing one, and one with no screen id,
 * which could not be claimed twice a day and would pay on every replay.
 *
 * @param {Array<{screen_id?: string, help_used?: boolean}>} attempts
 */
export function payableScreens(attempts) {
  if (!Array.isArray(attempts)) return [];
  return attempts.filter(
    (attempt) =>
      attempt && typeof attempt.screen_id === "string" && attempt.screen_id.trim() !== "" && attempt.help_used !== true,
  );
}

/**
 * The learner's stored timezone, or UTC when it cannot be read.
 *
 * Read through the service client that is already in hand, not through the learner's session: the
 * write path must not gain a second authorization story, and the question is one column of their own
 * row. A missing profile is UTC rather than an error — a learner with no profile row still drills.
 */
export async function learnerTimezone(client, userId) {
  try {
    const { data, error } = await client.from("profiles").select("timezone").eq("id", userId).maybeSingle();
    if (error || !data) return FALLBACK_TIMEZONE;
    return typeof data.timezone === "string" && data.timezone.trim() !== "" ? data.timezone : FALLBACK_TIMEZONE;
  } catch {
    return FALLBACK_TIMEZONE;
  }
}

/** The calendar day an instant falls on for a learner, never `null`. */
export function batchDay(instant, timeZone) {
  return dayKey(instant, timeZone) ?? dayKey(instant, FALLBACK_TIMEZONE) ?? dayKey(new Date());
}

/**
 * Credit every payable screen in the batch.
 *
 * @returns {Promise<{ok: true, awarded: number, total: number, paid: number} | {ok: false, error: string}>}
 */
export async function creditScreens(client, { user, lessonId, screens, day, random = Math.random }) {
  const award = awardForLesson(lessonId, random);
  if (award === 0) return { ok: true, awarded: 0, total: 0, paid: 0 };

  let awarded = 0;
  let total = 0;
  let paid = 0;
  for (const screen of screens) {
    const { data, error } = await client.rpc("award_points", {
      p_user: user.id,
      p_lesson_id: lessonId,
      p_screen_id: screen.screen_id,
      p_day: day,
      p_award: award,
    });
    if (error) return { ok: false, error: error.message };
    const row = Array.isArray(data) ? data[0] : data;
    if (row && typeof row === "object") {
      awarded += Number(row.awarded ?? 0);
      total = Number(row.total ?? total);
      if (Number(row.awarded ?? 0) > 0) paid += 1;
    }
  }
  return { ok: true, awarded, total, paid };
}

/**
 * Move the streak, if this batch is the day's first completion.
 *
 * @returns {Promise<{ok: true, current: number, longest: number, changed: boolean} | {ok: false, error: string}>}
 */
export async function moveStreak(client, { user, day }) {
  const { data, error } = await client.rpc("touch_streak", { p_user: user.id, p_day: day });
  if (error) return { ok: false, error: error.message };
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") return { ok: false, error: "the database returned nothing" };
  return {
    ok: true,
    current: Number(row.current ?? 0),
    longest: Number(row.longest ?? 0),
    changed: row.changed === true,
  };
}

/**
 * Both halves, in the order the route wants them: the batch has already been written, so this only
 * reports. `replayed` short-circuits it — a retried batch has already been paid, and asking again
 * would be a wasted round trip against a claim that is already spent.
 *
 * `flags` is a parameter so the switch can be proved without an environment: the streak half is
 * skipped when `streaks` is off, which is the whole point of the flag — a broken `touch_streak` must
 * not be able to take the points down with it.
 *
 * @returns {Promise<{points: object|null, streak: object|null}>}
 */
export async function creditBatch(
  client,
  { user, lessonId, attempts, summary, replayed, instant = new Date(), flags = retentionFlags() },
) {
  if (replayed) return { points: null, streak: null };

  const timeZone = await learnerTimezone(client, user.id);
  const day = batchDay(instant, timeZone);
  const points = await creditScreens(client, {
    user,
    lessonId,
    screens: payableScreens(attempts),
    day,
  });
  const streak =
    summary?.completed && flags.streaks ? await moveStreak(client, { user, day }) : { ok: true, skipped: true };
  return { points, streak };
}
