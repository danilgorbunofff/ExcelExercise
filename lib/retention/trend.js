/**
 * The week's accuracy, shaped for a page rather than for a chart library.
 *
 * `0012_retention_week.sql` answers with the days it was asked for, gaps included; this module is the
 * half that has to be true in the browser: a day with no screens has no accuracy at all (not 0%), the
 * percentages are rounded once and consistently, and the sparkline is drawn from numbers a test can
 * predict instead of from a canvas somebody has to look at.
 *
 * Every function here is pure and takes its "today" as an argument, so the 0-day, 1-day and 7-day
 * cases in `tests/retention-trend.test.js` are the same code the page runs, driven a week apart.
 */

import { dayKey } from "./points.js";

/** The window the phase plan asks for. */
export const TREND_DAYS = 7;

/** The database clamps to the same range; asking for more is a caller bug, not a feature. */
export const TREND_MIN_DAYS = 1;
export const TREND_MAX_DAYS = 30;

const DAY = 86_400_000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function isDay(value) {
  return typeof value === "string" && DATE.test(value);
}

/** A finite, non-negative integer, or 0. Anything else in a row is not a count. */
function count(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : 0;
}

function clampDays(days) {
  const number = Number(days);
  if (!Number.isFinite(number)) return TREND_DAYS;
  return Math.min(Math.max(Math.round(number), TREND_MIN_DAYS), TREND_MAX_DAYS);
}

/** `YYYY-MM-DD` plus `offset` calendar days, in UTC — the arithmetic a date string needs. */
export function shiftDay(day, offset) {
  if (!isDay(day)) return null;
  const at = new Date(`${day}T00:00:00.000Z`).getTime() + Number(offset) * DAY;
  return Number.isNaN(at) ? null : new Date(at).toISOString().slice(0, 10);
}

/** Today where the server is, used only when a caller has no day of its own. */
export function todayKey(instant = Date.now()) {
  return dayKey(instant, "UTC");
}

/**
 * First-try accuracy as a percentage, or `null` when nothing was attempted.
 *
 * `null` rather than `0` is the whole point: a day off is not a day of wrong answers, and a sparkline
 * that draws it at the bottom tells a learner they did badly when they did nothing.
 */
export function accuracyOf(screens, firstTry) {
  const total = count(screens);
  if (total === 0) return null;
  const share = Math.min(count(firstTry) / total, 1);
  return Math.round(share * 1000) / 10;
}

/**
 * The window, oldest day first, with a bucket for every day even when the database sent fewer.
 *
 * Rows outside the window, rows with an unparseable day and duplicate days are all handled rather than
 * trusted: the series is exactly `days` entries ending today, whatever the caller hands over.
 */
export function trendSeries(rows, { days = TREND_DAYS, today = null } = {}) {
  const size = clampDays(days);
  const end = isDay(today) ? today : todayKey();

  const byDay = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const day = isDay(row?.day) ? row.day : null;
    if (!day) continue;
    const previous = byDay.get(day) ?? { screens: 0, firstTry: 0 };
    byDay.set(day, {
      screens: previous.screens + count(row.screens),
      firstTry: previous.firstTry + count(row.firstTry),
    });
  }

  const series = [];
  for (let back = size - 1; back >= 0; back -= 1) {
    const day = shiftDay(end, -back);
    const bucket = byDay.get(day) ?? { screens: 0, firstTry: 0 };
    series.push({
      day,
      screens: bucket.screens,
      firstTry: bucket.firstTry,
      accuracy: accuracyOf(bucket.screens, bucket.firstTry),
    });
  }
  return series;
}

/** The week's totals, over the days that had any attempts. */
export function trendTotals(series) {
  let screens = 0;
  let firstTry = 0;
  let activeDays = 0;
  for (const day of Array.isArray(series) ? series : []) {
    screens += count(day?.screens);
    firstTry += count(day?.firstTry);
    if (count(day?.screens) > 0) activeDays += 1;
  }
  return { screens, firstTry, activeDays, accuracy: accuracyOf(screens, firstTry) };
}

/**
 * One payload from `retention_week`, normalised for rendering.
 *
 * The database already fills the gaps and clamps the window; this re-derives both from the `day` it
 * sent, so a payload with a short series (or none at all, on a fresh account) still renders a week.
 */
export function weekView(payload, { days = TREND_DAYS } = {}) {
  const data = payload && typeof payload === "object" ? payload : {};
  const day = isDay(data.day) ? data.day : null;
  const series = trendSeries(Array.isArray(data.series) ? data.series : [], { days, today: day });
  const totals = trendTotals(series);
  return {
    day: series.at(-1)?.day ?? null,
    days: series.length,
    series,
    ...totals,
    empty: totals.screens === 0,
    pointsToday: count(data.pointsToday),
    pointsTotal: count(data.pointsTotal),
    streak: {
      current: count(data.streakCurrent),
      longest: count(data.streakLongest),
      lastDay: isDay(data.streakLastDay) ? data.streakLastDay : null,
    },
  };
}

/**
 * Sparkline geometry: one point per day that was studied, spread evenly left to right.
 *
 * A day with nothing in it is skipped rather than plotted at zero, so the line reads as "what happened"
 * and not as a dip. Coordinates are rounded to two decimals so a test can assert them exactly.
 */
export function sparkPoints(series, { width = 168, height = 40, pad = 4 } = {}) {
  const days = Array.isArray(series) ? series : [];
  const span = Math.max(days.length - 1, 1);
  const innerWidth = Math.max(Number(width) - Number(pad) * 2, 1);
  const innerHeight = Math.max(Number(height) - Number(pad) * 2, 1);
  const points = [];
  for (const [index, day] of days.entries()) {
    if (!day || day.accuracy === null || day.accuracy === undefined) continue;
    const x = Number(pad) + (innerWidth * index) / span;
    const y = Number(pad) + innerHeight * (1 - Math.min(Math.max(Number(day.accuracy), 0), 100) / 100);
    points.push({ x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, day: day.day });
  }
  return points;
}

/** The `d` an inline `<path>` needs, from the points above. Empty when nothing was studied. */
export function sparkPath(points) {
  const list = Array.isArray(points) ? points.filter((point) => Number.isFinite(point?.x) && Number.isFinite(point?.y)) : [];
  if (list.length === 0) return "";
  return list.map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`).join(" ");
}
