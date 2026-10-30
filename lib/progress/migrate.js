/**
 * The signed-out learner's progress, read out of `localStorage` and turned into the one payload the
 * migration path accepts.
 *
 * Phase 2 kept a roll-up, not a stream: `{ v: 1, done: { <id>: { at, tries, helped } }, tries: { <id>: n } }`.
 * This module quotes what that record can support (a completion, its timestamp, whether help was used)
 * and refuses to invent what it cannot (screen visits, check counts, accuracy). The server validates
 * the same shape again — a browser is a client, not a witness.
 *
 * Pure and DOM-free, so `tests/progress-migrate.test.js` imports it instead of restating it.
 */
import { BATCH_ID } from "./derive.js";

/** One migration carries the whole track; the catalog has 88 slots, so 200 leaves room and bounds abuse. */
export const MAX_LESSONS = 200;

function isoOrNull(value) {
  if (typeof value !== "string" || value === "") return null;
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
}

function lessonId(value) {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/**
 * Read the `es.progress` record a browser kept before sign-in.
 * @param {unknown} record  the parsed record, not the JSON text
 * @returns {{ok: true, lessons: object[]} | {ok: false, error: string}}
 */
export function localLessons(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return { ok: false, error: "progress record must be an object" };
  }
  const done = record.done && typeof record.done === "object" && !Array.isArray(record.done) ? record.done : {};
  const tries = record.tries && typeof record.tries === "object" && !Array.isArray(record.tries) ? record.tries : {};

  const lessons = [];
  const seen = new Set();
  for (const [id, entry] of Object.entries(done)) {
    const key = lessonId(id);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    // A completion with an unreadable timestamp is still a completion; it just cannot claim a date.
    const completedAt = entry && typeof entry === "object" ? isoOrNull(entry.at) : null;
    lessons.push({ lesson_id: key, completed_at: completedAt, helped: entry?.helped === true, score: 0 });
  }
  for (const [id, count] of Object.entries(tries)) {
    const key = lessonId(id);
    if (!key || seen.has(key)) continue;
    // A lesson with misses and no completion is genuinely in progress; the count itself is not sent,
    // because `tries` counts checks and `attempts` counts screen visits.
    if (!Number.isFinite(count) || count <= 0) continue;
    seen.add(key);
    lessons.push({ lesson_id: key, completed_at: null, helped: false, score: 0 });
  }

  if (lessons.length > MAX_LESSONS) return { ok: false, error: `at most ${MAX_LESSONS} lessons per migration` };
  return { ok: true, lessons };
}

/**
 * The request body of a migration: the same idempotency key, a list instead of an event stream.
 * @returns {{ok: true, batchId: string, lessons: object[]} | {ok: false, error: string}}
 */
export function parseMigration(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "body must be an object" };
  }
  if (typeof body.batch_id !== "string" || !BATCH_ID.test(body.batch_id)) {
    return { ok: false, error: "batch_id must be a uuid" };
  }
  if (!Array.isArray(body.lessons)) return { ok: false, error: "lessons must be an array" };
  if (body.lessons.length === 0) return { ok: false, error: "lessons is empty" };
  if (body.lessons.length > MAX_LESSONS) {
    return { ok: false, error: `at most ${MAX_LESSONS} lessons per migration` };
  }

  const lessons = [];
  for (const item of body.lessons) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return { ok: false, error: "every lesson must be an object" };
    }
    const id = lessonId(item.lesson_id);
    if (!id) return { ok: false, error: "every lesson needs an id" };
    const completedAt = item.completed_at == null ? null : isoOrNull(item.completed_at);
    if (item.completed_at != null && completedAt === null) {
      return { ok: false, error: `lesson ${id} has an unreadable completed_at` };
    }
    const score = Number.isFinite(item.score) ? Math.min(100, Math.max(0, Math.round(item.score))) : 0;
    lessons.push({ lesson_id: id, completed_at: completedAt, helped: item.helped === true, score });
  }

  return { ok: true, batchId: body.batch_id, lessons };
}
