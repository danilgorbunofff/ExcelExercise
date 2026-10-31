/**
 * The points rule and the day it belongs to, as pure functions.
 *
 * Phase 5 work item 1 asks for `random(1..5) × lessonNumber` per correct answer, computed on the
 * server. "Server-authoritative" is only true if the browser cannot name the number, so the award is
 * derived here from the lesson id the catalog already knows plus one random draw the caller supplies.
 * The draw is a parameter rather than a call to `Math.random()` inside the function, which is what
 * makes the range provable in `tests/retention.test.js` instead of merely plausible.
 *
 * The day is a calendar date in the learner's timezone, never a UTC instant: a learner in Auckland
 * finishing at 11pm local must not be credited to yesterday because the server is in UTC, and a
 * streak must survive the DST jump in both directions. Comparing calendar dates also means a DST day
 * cannot be 23 hours long and break a "yesterday" test.
 */

/** The day a learner's points belong to when the profile carries no usable timezone. */
export const FALLBACK_TIMEZONE = "UTC";

/**
 * One day's ceiling. The longest lesson is 88, so one screen pays at most `5 × 88 = 440`; 500 covers
 * that and a second screen, while a script replaying a lesson all afternoon hits the ceiling and
 * earns nothing more. It is a farming guard, not a game rule — a real day never reaches it.
 */
export const DAILY_CAP = 500;

/** The unit of the award, named because the phase doc's formula is `1..5 × lessonNumber`. */
export const MIN_UNITS = 1;
export const MAX_UNITS = 5;

const NUMBER_IN_ID = /(?:^|-)(\d{1,3})(?=-|$)/;

/**
 * The lesson's position in the curriculum, read out of its id.
 *
 * `01-sum-basics` → 1 and `sql-04-lookups` → 4 both carry the number as their own hyphen-delimited
 * field, so one pattern reads both tracks. `project-ufo` carries none and returns `null`: a project
 * is not numbered, so no points are owed for it.
 *
 * @param {unknown} lessonId
 * @returns {number|null}
 */
export function parseLessonNumber(lessonId) {
  if (typeof lessonId !== "string") return null;
  const match = NUMBER_IN_ID.exec(lessonId);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isInteger(value) && value > 0 ? value : null;
}

/**
 * `random(1..5) × lessonNumber`, clamped so a bad draw cannot invent points.
 *
 * @param {number} lessonNumber
 * @param {() => number} [random] one draw in `[0, 1)`; injected so tests can pin it
 * @returns {number} a multiple of `lessonNumber`, or 0 when the lesson is unnumbered
 */
export function pointsAward(lessonNumber, random = Math.random) {
  if (!Number.isInteger(lessonNumber) || lessonNumber < 1) return 0;
  const draw = Number(typeof random === "function" ? random() : random);
  if (!Number.isFinite(draw)) return MIN_UNITS * lessonNumber;
  const units = MIN_UNITS + Math.min(MAX_UNITS - MIN_UNITS, Math.max(0, Math.floor(draw * MAX_UNITS)));
  return units * lessonNumber;
}

/**
 * The same award, starting from the id the drill already reports.
 *
 * @param {unknown} lessonId
 * @param {() => number} [random]
 */
export function awardForLesson(lessonId, random = Math.random) {
  return pointsAward(parseLessonNumber(lessonId), random);
}

/**
 * The award actually credited once the day's ceiling is taken into account: the part of `award` that
 * still fits under `DAILY_CAP`, which is 0 once the day is full rather than an error.
 *
 * @param {number} total points already credited today
 * @param {number} award what the screen earned
 * @returns {number}
 */
export function capDailyPoints(total, award) {
  const used = Number.isFinite(total) ? Math.max(0, Math.trunc(total)) : 0;
  const earned = Number.isFinite(award) ? Math.max(0, Math.trunc(award)) : 0;
  return Math.min(earned, Math.max(0, DAILY_CAP - used));
}

const formatters = new Map();

function dayFormatter(timeZone) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

/** `Intl` throws on an unknown zone, so the caller's stored profile value is checked, not trusted. */
function usableZone(timeZone) {
  if (typeof timeZone !== "string" || timeZone.trim() === "") return FALLBACK_TIMEZONE;
  const cached = formatters.get(timeZone);
  if (cached === null) return FALLBACK_TIMEZONE;
  if (cached) return timeZone;
  try {
    formatters.set(timeZone, dayFormatter(timeZone));
    return timeZone;
  } catch {
    formatters.set(timeZone, null);
    return FALLBACK_TIMEZONE;
  }
}

/**
 * The calendar date an instant falls on, in `timeZone`.
 *
 * @param {Date|number|string} instant
 * @param {unknown} [timeZone] the profile's stored zone; anything unusable falls back to UTC
 * @returns {string|null} `YYYY-MM-DD`, or `null` when the instant itself is unreadable
 */
export function dayKey(instant, timeZone = FALLBACK_TIMEZONE) {
  const at = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(at.getTime())) return null;
  const zone = usableZone(timeZone);
  const formatter = formatters.get(zone) ?? dayFormatter(zone);
  const parts = formatter.formatToParts(at);
  const get = (type) => parts.find((part) => part.type === type)?.value;
  const [year, month, day] = [get("year"), get("month"), get("day")];
  if (!year || !month || !day) return null;
  return `${year}-${month}-${day}`;
}
