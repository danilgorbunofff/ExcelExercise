/**
 * Streaks, as a pure transition over calendar dates.
 *
 * The rule from phase 5's work item 2 is one sentence — the first completed lesson of a day moves the
 * streak — but the sentence has four hard edges, and each is a real learner:
 *
 *   * the same day twice (a second lesson, or a replayed batch) must not count twice;
 *   * a gap of one day continues the run, a gap of two ends it;
 *   * a clock that moves backwards — a timezone change, a device with the wrong date — must not
 *     destroy a streak that was honestly earned;
 *   * `longest` survives a reset, because the number it records is a personal best.
 *
 * Dates are `YYYY-MM-DD` calendar strings, so "yesterday" is a two-date comparison and cannot be
 * broken by a 23-hour DST day. `tests/retention.test.js` imports these functions rather than
 * restating the rules.
 */
import { FALLBACK_TIMEZONE, dayKey } from "./points.js";

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Midnight UTC on a `YYYY-MM-DD` string, or `null` when the string is not one. */
function utcMidnight(day) {
  if (typeof day !== "string") return null;
  const match = DAY.exec(day);
  if (!match) return null;
  const [, year, month, date] = match;
  const at = Date.UTC(Number(year), Number(month) - 1, Number(date));
  if (Number.isNaN(at)) return null;
  const stamp = new Date(at);
  // `2026-02-30` parses and rolls forward to March; a day key that is not a real date is not one.
  if (stamp.getUTCDate() !== Number(date) || stamp.getUTCMonth() !== Number(month) - 1) return null;
  return at;
}

/**
 * Whole days from `from` to `to`, positive when `to` is later. `null` when either is not a date.
 *
 * @returns {number|null}
 */
export function daysBetween(from, to) {
  const start = utcMidnight(from);
  const end = utcMidnight(to);
  if (start === null || end === null) return null;
  return Math.round((end - start) / 86_400_000);
}

/** `YYYY-MM-DD` shifted by whole days, e.g. for "yesterday" in a test or a query. */
export function addDays(day, offset) {
  const start = utcMidnight(day);
  if (start === null || !Number.isInteger(offset)) return null;
  return new Date(start + offset * 86_400_000).toISOString().slice(0, 10);
}

/** The day a streak move happened on, for a learner in `timeZone`. */
export function todayFor(instant, timeZone = FALLBACK_TIMEZONE) {
  return dayKey(instant, timeZone);
}

/**
 * The streak after a lesson was completed on `day`.
 *
 * Returns the row the database would hold — `current`, `longest`, `last_day` — plus `changed`, which
 * is what lets the caller skip a write (and the client skip a celebration) when nothing moved.
 *
 * @param {{current?: number, longest?: number, last_day?: string|null}} state
 * @param {string} day `YYYY-MM-DD`
 * @returns {{current: number, longest: number, last_day: string|null, changed: boolean}}
 */
export function streakAfter(state, day) {
  const current = Math.max(0, Math.trunc(Number(state?.current ?? 0)) || 0);
  const longest = Math.max(0, Math.trunc(Number(state?.longest ?? 0)) || 0);
  // A `last_day` the column should make impossible is treated as no history at all: freezing the
  // streak forever would be a quieter bug than starting it again.
  const stored = typeof state?.last_day === "string" ? state.last_day : null;
  const lastDay = stored !== null && utcMidnight(stored) !== null ? stored : null;
  const same = { current, longest, last_day: lastDay, changed: false };

  // A day key the caller could not produce, or one that is not a real date, leaves the streak alone:
  // losing a run because a clock was unreadable is worse than not counting today.
  if (utcMidnight(day) === null) return same;
  if (lastDay === null) return { current: 1, longest: Math.max(longest, 1), last_day: day, changed: true };

  const delta = daysBetween(lastDay, day);
  if (delta === null) return same;
  if (delta <= 0) {
    // Same day: idempotent, and `last_day` is not rewritten. Negative: the learner's calendar moved
    // backwards, so today is folded into the day already counted instead of ending the run.
    return same;
  }
  if (delta === 1) {
    const next = current + 1;
    return { current: next, longest: Math.max(longest, next), last_day: day, changed: true };
  }
  return { current: 1, longest: Math.max(longest, 1), last_day: day, changed: true };
}
