/**
 * The daily challenge, decided in JavaScript and stored in `0011_daily_challenge.sql`.
 *
 * Three questions live here, and each has to be answerable without a database:
 *
 *   1. *which five topics?* — weighted towards the groups the cohort has actually drilled in the last
 *      week, and deterministic for a day, so two request handlers that race at midnight compute the
 *      same challenge and one of them simply loses the insert;
 *   2. *which ten screens?* — spread one per lesson before a second from any lesson, so a run is five
 *      topics rather than one lesson five times;
 *   3. *was the answer right?* — with the same grader the drills use. The verdict is the server's, and
 *      the run page never receives `expect`, `answers` or `reference`, so a browser cannot look up the
 *      answer it is about to be asked for.
 *
 * The database owns the parts that have to be atomic: one challenge per day, one attempt per learner,
 * one verdict per screen. This module owns the parts that have to be deterministic and testable.
 */
import { grade, gradeAnswer } from "../../packages/grader/index.js";
import { revealOf } from "../../packages/content/index.js";

/** Ten screens, five topics: the shape the phase plan names. */
export const CHALLENGE_SIZE = 10;
export const CHALLENGE_TOPICS = 5;

/** The run's clock. Fifteen minutes, matching `challenge_finish`'s default cap. */
export const CHALLENGE_CAP_SECONDS = 15 * 60;
export const CHALLENGE_CAP_MS = CHALLENGE_CAP_SECONDS * 1000;

/** How far back the topic weighting looks. A week is long enough to follow a cohort, short enough to
 *  forget a group that was drilled once and abandoned. */
export const ACTIVITY_WINDOW_DAYS = 7;

/**
 * Screens a timed run can ask for.
 *
 * A formula screen is one typed answer; a picture screen is one typed answer about a sheet the runner
 * can show. Chord, sequence and workbook screens need a browser surface the runner does not have, and
 * asking a learner to answer one faster than they would in a lesson would test the runner, not Excel.
 * 146 of the 149 authored screens are eligible, which is why the restriction costs nothing today.
 */
export function eligibleScreen(screen) {
  return screen != null && (screen.type === "formula" || screen.type === "picture");
}

/** `lessonId#screenId` — the stored form of a chosen screen, and readable in a psql session. */
export function screenKey(lessonId, screenId) {
  return `${lessonId}#${screenId}`;
}

export function parseScreenKey(key) {
  const text = String(key ?? "");
  const at = text.indexOf("#");
  if (at <= 0 || at === text.length - 1) return null;
  return { lessonId: text.slice(0, at), screenId: text.slice(at + 1) };
}

/**
 * A 32-bit seed from a string, so a day is a day.
 *
 * The same day must produce the same challenge in every process, and the simplest way to get that is
 * to let the day be the seed rather than to store the draw. `xmur3` is the usual mixing function: cheap,
 * stable across versions, and good enough that consecutive days do not look adjacent.
 */
export function hashSeed(text) {
  let h = 1779033703 ^ String(text ?? "").length;
  for (let i = 0; i < String(text ?? "").length; i += 1) {
    h = Math.imul(h ^ String(text ?? "").charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

/** A small deterministic generator (`mulberry32`) returning numbers in `[0, 1)`. */
export function seededRandom(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The published lessons of a group, in curriculum order. */
function lessonsByGroup(index) {
  const groups = new Map();
  for (const entry of index) {
    const group = entry.group ?? "other";
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(entry);
  }
  return groups;
}

/**
 * One weight per group: the screens the cohort attempted in its lessons this week, plus one.
 *
 * The `+1` is what keeps a group nobody has touched from dropping out of the draw entirely — a daily
 * challenge that only ever asks about the two busiest groups is a challenge with two topics.
 */
export function groupWeights(index, activity) {
  const perLesson = new Map();
  for (const row of Array.isArray(activity) ? activity : []) {
    const id = row?.lesson_id;
    if (typeof id === "string") perLesson.set(id, (perLesson.get(id) ?? 0) + Number(row.screens ?? 0));
  }

  const weights = new Map();
  for (const [group, entries] of lessonsByGroup(index)) {
    let total = 1;
    for (const entry of entries) total += perLesson.get(entry.exercise.id) ?? 0;
    weights.set(group, total);
  }
  return weights;
}

/**
 * Draw `count` topics without replacement, in proportion to the weights.
 *
 * Weighted sampling without replacement is a cumulative draw and a removal, repeated: pick a point in
 * the remaining total, walk the survivors, drop the one that was hit. Nondeterministic input (a caller
 * passing `Math.random`) stays available for a future "surprise me", but the default is the day.
 */
export function sampleTopics({ index, activity, day, count = CHALLENGE_TOPICS, random } = {}) {
  const weights = groupWeights(index, activity);
  const remaining = [...weights.entries()].map(([id, weight]) => ({ id, weight: Math.max(weight, 0) || 1 }));
  const next = random ?? seededRandom(hashSeed(`topics:${day}`));

  const picked = [];
  // The bound is read once: `remaining` shrinks as topics are drawn, and comparing against its live
  // length would stop at half the requested count.
  const limit = Math.min(count, remaining.length);
  while (picked.length < limit) {
    const total = remaining.reduce((sum, candidate) => sum + candidate.weight, 0);
    let point = next() * total;
    let at = remaining.length - 1;
    for (let i = 0; i < remaining.length; i += 1) {
      point -= remaining[i].weight;
      if (point < 0) {
        at = i;
        break;
      }
    }
    picked.push(remaining[at].id);
    remaining.splice(at, 1);
  }
  return picked;
}

/**
 * Ten screens across the chosen topics.
 *
 * Lessons in a topic are ordered by their position in the track (so the challenge follows the
 * curriculum), then each lesson's eligible screens are shuffled by `day#lesson`. Taking one screen from
 * every lesson before taking a second from any of them is what makes a run feel like five topics: the
 * naive shuffle returns four screens from the lesson with the most screens and one each from the rest.
 */
export function pickScreens({ index, topics, day, count = CHALLENGE_SIZE } = {}) {
  const chosen = new Set(Array.isArray(topics) ? topics : []);
  const lessons = index.filter((entry) => chosen.has(entry.group) && entry.exercise.screens.some(eligibleScreen));

  const shuffle = (list, seed) => {
    const shuffled = [...list];
    const rng = seededRandom(seed);
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };

  const order = shuffle(lessons, hashSeed(`lessons:${day}`));
  const pools = order.map((entry) =>
    shuffle(
      entry.exercise.screens.filter(eligibleScreen),
      hashSeed(`pool:${day}:${entry.exercise.id}`),
    ),
  );

  const keys = [];
  for (let round = 0; keys.length < count; round += 1) {
    let took = false;
    for (let i = 0; i < pools.length && keys.length < count; i += 1) {
      const screen = pools[i][round];
      if (screen) {
        keys.push(screenKey(order[i].exercise.id, screen.id));
        took = true;
      }
    }
    // Every pool is exhausted: the request is larger than the catalog, and an endless loop is worse
    // than a short challenge.
    if (!took) break;
  }

  if (keys.length === 0) return [];
  return keys;
}

/** Everything the day needs, computed: which topics, which screens. */
export function challengeSpec({ index, activity, day, size = CHALLENGE_SIZE, topics = CHALLENGE_TOPICS } = {}) {
  const drawn = sampleTopics({ index, activity, day, count: topics });
  const screens = pickScreens({ index, topics: drawn, day, count: size });
  // A draw that finds fewer eligible lessons than it needs still has to choose its topics from the
  // groups it could actually ask about — otherwise a group of picture-only lessons would take a slot.
  if (screens.length === 0) {
    return { topics: [], screens: [] };
  }
  return { topics: drawn, screens };
}

/**
 * What the run page is allowed to see.
 *
 * A screen minus its answer: no `expect`, no `answers`, no `reference`, no hints. The progression is a
 * timed run, so the hint panel has nothing to offer during it, and the reveal comes back with the
 * verdict from the server.
 */
export function screenPayload({ lessonId, lesson, screen }) {
  const payload = {
    key: screenKey(lessonId, screen.id),
    lessonId,
    lessonTitle: lesson?.title ?? "",
    type: screen.type,
    prompt: screen.prompt ?? "",
  };
  if (screen.grid) payload.grid = screen.grid;
  if (screen.answerCell) payload.answerCell = screen.answerCell;
  if (screen.image) payload.image = `/assets/img/${screen.image.split("/").pop()}`;
  if (screen.alt) payload.alt = screen.alt;
  if (screen.unit) payload.unit = screen.unit;
  return payload;
}

/** The chosen keys, resolved against today's content, in the stored order. */
export function decodeScreens(index, keys) {
  const byLesson = new Map(index.map((entry) => [entry.exercise.id, entry]));
  const out = [];
  for (const key of Array.isArray(keys) ? keys : []) {
    const parsed = parseScreenKey(key);
    if (!parsed) continue;
    const entry = byLesson.get(parsed.lessonId);
    const screen = entry?.exercise.screens.find((candidate) => candidate.id === parsed.screenId);
    if (!entry || !screen) continue; // content moved on; the run is shorter, not broken
    out.push({ lessonId: parsed.lessonId, lesson: entry.exercise, screen });
  }
  return out;
}

/**
 * The server's verdict for one answer.
 *
 * Never throws: a grader that rejects a formula it cannot read is an answer that is wrong, not a
 * request that failed. The `expected` field is what the run page shows once the screen is closed —
 * after the verdict, never before.
 */
export function gradeScreen(lesson, screen, value) {
  const said = typeof value === "string" ? value : "";
  const expected = revealOf(lesson, screen);
  if (said.trim() === "") {
    return { ok: false, rule: "empty", message: "Nothing was typed for this screen.", expected };
  }

  try {
    const result = screen.type === "formula" ? grade(screen, said) : gradeAnswer(screen, said);
    return {
      ok: result.ok === true,
      rule: result.rule ?? (result.ok ? "correct" : "value"),
      message: result.message ?? "",
      expected,
    };
  } catch (error) {
    return {
      ok: false,
      rule: "internal",
      message: String(error?.message ?? "the grader could not read that answer"),
      expected,
    };
  }
}

/** The day's run in the shape the page renders, from the `challenge_begin` answer. */
export function shapeAttempt(row) {
  const attempt = row && typeof row === "object" ? row : {};
  const accuracy = attempt.accuracy === null || attempt.accuracy === undefined ? null : Number(attempt.accuracy);
  return {
    id: attempt.id ?? null,
    startedAt: attempt.started_at ?? null,
    finishedAt: attempt.finished_at ?? null,
    answered: Number(attempt.answered ?? 0),
    correct: Number(attempt.correct ?? 0),
    accuracy,
    ms: attempt.ms === null || attempt.ms === undefined ? null : Number(attempt.ms),
    created: attempt.created === true,
  };
}

/** The day's activity rows, for the weighting. A failure is "no activity", not a broken challenge. */
export async function loadActivity(client, { since }) {
  const { data, error } = await client.rpc("challenge_activity", { p_since: since.toISOString() });
  if (error) return [];
  return Array.isArray(data) ? data : [];
}

/**
 * The day's challenge, created if this is the first request for it.
 *
 * @returns {Promise<{day: string, topics: string[], screens: {lessonId: string, lesson: object, screen: object}[],
 *                    error: string|null}>}
 */
export async function ensureChallenge(client, { day, index, activity }) {
  const spec = challengeSpec({ index, activity, day });
  if (spec.screens.length === 0) {
    return { day, topics: [], screens: [], error: "no_screens_available" };
  }

  const { data, error } = await client.rpc("challenge_ensure", {
    p_day: day,
    p_topics: spec.topics,
    p_screens: spec.screens,
  });
  if (error) return { day, topics: [], screens: [], error: error.message };

  const row = Array.isArray(data) ? data[0] : data;
  const stored = Array.isArray(row?.screens) ? row.screens : spec.screens;
  return {
    day,
    topics: Array.isArray(row?.topics) ? row.topics : spec.topics,
    screens: decodeScreens(index, stored),
    error: null,
  };
}

/** Begin or resume the learner's run. */
export async function beginRun(client, { day, userId }) {
  const { data, error } = await client.rpc("challenge_begin", { p_day: day, p_user: userId });
  if (error) return { ok: false, error: error.message, attempt: null };
  return { ok: true, error: null, attempt: shapeAttempt(Array.isArray(data) ? data[0] : data) };
}

/** Record the server's verdict for one screen. */
export async function recordAnswer(client, { day, userId, screenId, ok }) {
  const { data, error } = await client.rpc("challenge_answer", {
    p_day: day,
    p_user: userId,
    p_screen: screenId,
    p_ok: ok === true,
  });
  if (error) return { ok: false, error: error.message };
  const row = Array.isArray(data) ? data[0] : data;
  return { ...row, ok: row?.ok === true };
}

/** Close the run; idempotent, so a double-submit cannot rewrite the score. */
export async function finishRun(client, { day, userId, size = CHALLENGE_SIZE }) {
  const { data, error } = await client.rpc("challenge_finish", {
    p_day: day,
    p_user: userId,
    p_size: size,
    p_cap_seconds: CHALLENGE_CAP_SECONDS,
  });
  if (error) return { ok: false, error: error.message, accuracy: null, ms: null };
  const row = Array.isArray(data) ? data[0] : data;
  return {
    ok: row?.ok === true,
    error: row?.ok === true ? null : (row?.error ?? "finish_failed"),
    accuracy: row?.accuracy === undefined || row?.accuracy === null ? null : Number(row.accuracy),
    ms: row?.ms === undefined || row?.ms === null ? null : Number(row.ms),
    answered: Number(row?.answered ?? 0),
    correct: Number(row?.correct ?? 0),
  };
}

/** The day's board: top `limit`, plus the viewer's own line wherever it is. */
export async function loadRank(client, { day, userId, limit = 10 }) {
  const { data, error } = await client.rpc("challenge_rank", { p_day: day, p_user: userId, p_limit: limit });
  if (error) return { rows: [], myRank: null, error: error.message };
  const rows = (Array.isArray(data) ? data : data ? [data] : []).map((row) => ({
    rank: row.rank === null || row.rank === undefined ? null : Number(row.rank),
    username: String(row.username ?? ""),
    accuracy: Number(row.accuracy ?? 0),
    ms: Number(row.ms ?? 0),
    isMe: row.is_me === true,
  }));
  return { rows, myRank: rows.find((row) => row.isMe)?.rank ?? null, error: null };
}

/** Milliseconds left in the run, never negative. */
export function msLeft(startedAt, { now = Date.now(), cap = CHALLENGE_CAP_MS } = {}) {
  const started = startedAt ? new Date(startedAt).getTime() : Number.NaN;
  if (!Number.isFinite(started)) return cap;
  return Math.max(0, cap - (now - started));
}
