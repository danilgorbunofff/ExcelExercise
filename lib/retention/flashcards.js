/**
 * Flashcards: the second pass over a lesson a learner has already finished.
 *
 * Two rules, and everything here is one of them:
 *
 *   1. *only completed lessons*. A card is a reminder of something a learner has already been through;
 *      showing the answer to a lesson they have not opened is a spoiler, not a study aid. The filter is
 *      not applied here — `buildDeck` in `cards.js` simply renders the ids it is given — because
 *      "completed" lives in two places (the browser's `es.progress` for a signed-out learner,
 *      `lesson_progress` for an account) and one of them is not visible to the server. `completedLessons`
 *      turns a parsed progress object into those ids, and the page passes nothing else.
 *   2. *spacing, not a score*. SM-2 lite: four grades, an ease factor, and an interval in whole days.
 *      It is deliberately not full SM-2 — there is no `q`/`n` bookkeeping and no failing matrix — because
 *      the state is per-browser `localStorage` until scheduling moves server-side, and a locally
 *      editable file should hold as little as it can get away with.
 *
 * The schedule is pure: `gradeCard` returns a new state, never mutates, and takes `now` as an argument,
 * so the tests can drive it a year forward without waiting.
 */

/** Per-browser schedule. Same `es.` prefix as `es.progress`, which is the other thing the browser keeps. */
export const DECK_KEY = "es.flashcards";
export const DECK_VERSION = 1;

/** One session's worth of cards. The deck itself is capped where it is built (`cards.js`). */
export const SESSION_CAP = 20;

export const GRADES = Object.freeze(["again", "hard", "good", "easy"]);

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_EASE = 1.3;
const MAX_EASE = 3.5;
const MAX_INTERVAL_DAYS = 365;
const START_EASE = 2.5;

const lastSegment = (path) => String(path).split("/").pop();

/** The lesson ids a parsed `es.progress` marks complete, newest first. */
export function completedLessons(progress) {
  const done = progress && typeof progress === "object" && progress.done ? progress.done : {};
  return Object.entries(done)
    .filter(([id, entry]) => typeof id === "string" && id !== "" && entry && typeof entry.at === "string")
    .sort((a, b) => String(b[1].at).localeCompare(String(a[1].at)))
    .map(([id]) => id);
}

/** A card nobody has graded: due immediately, so it is new rather than scheduled. */
export function newState() {
  return { ease: START_EASE, reps: 0, lapses: 0, interval: 0, due: 0, last: null, grade: null };
}

const clampEase = (ease) => Math.min(MAX_EASE, Math.max(MIN_EASE, ease));
const clampDays = (days) => Math.min(MAX_INTERVAL_DAYS, Math.max(0, Math.round(days)));

/**
 * The SM-2 lite transition.
 *
 * `again` keeps the card in the session (interval 0, so it is due again at once) and drops the ease; the
 * three passing grades grow the interval — 1 then 3 days, then multiplied by the ease, with `easy`
 * taking a bigger first step. An unknown grade is treated as `good`, because losing a schedule to a
 * typo is worse than assuming the learner meant "knew it".
 */
export function gradeCard(state, grade, now = Date.now()) {
  const current = state && typeof state === "object" && Number.isFinite(state.ease) ? state : newState();
  const ease = clampEase(current.ease);
  const reps = Number.isFinite(current.reps) ? current.reps : 0;
  const interval = Number.isFinite(current.interval) ? current.interval : 0;
  const lapses = Number.isFinite(current.lapses) ? current.lapses : 0;
  const said = GRADES.includes(grade) ? grade : "good";
  const at = Number.isFinite(now) ? now : Date.now();

  if (said === "again") {
    return {
      ease: clampEase(ease - 0.2),
      reps: 0,
      lapses: lapses + 1,
      interval: 0,
      due: at,
      last: at,
      grade: said,
    };
  }

  let nextEase = ease;
  let days;
  if (said === "hard") {
    nextEase = clampEase(ease - 0.15);
    days = clampDays(reps === 0 ? 1 : Math.max(1, interval * 1.2));
  } else if (said === "easy") {
    nextEase = clampEase(ease + 0.15);
    days = clampDays(reps === 0 ? 2 : Math.max(1, interval * nextEase * 1.3));
  } else {
    days = clampDays(reps === 0 ? 1 : reps === 1 ? 3 : Math.max(1, interval * nextEase));
  }

  return {
    ease: nextEase,
    reps: reps + 1,
    lapses,
    interval: days,
    due: at + days * DAY_MS,
    last: at,
    grade: said,
  };
}

/** What a grade would do to the interval, for the button label. */
export function previewDays(state, grade) {
  return gradeCard(state, grade, 0).interval;
}

export function isDue(state, now = Date.now()) {
  if (!state) return true;
  return !Number.isFinite(state.due) || state.due <= now;
}

/**
 * One session: what is due now (oldest first), then what has never been seen, in deck order.
 *
 * A card graded `again` comes back with `due = now`, so it is at the top of the *next* session rather
 * than looping inside this one. A learner gets the card again after a break, which is what a lapse
 * means; a card that repeats until it is right is a quiz, not a flashcard.
 */
export function queue(cards, schedules, now = Date.now(), { limit = SESSION_CAP } = {}) {
  const known = schedules && typeof schedules === "object" ? schedules : {};
  const due = [];
  const fresh = [];
  for (const card of Array.isArray(cards) ? cards : []) {
    const state = known[card.key];
    if (!state) fresh.push(card);
    else if (isDue(state, now)) due.push({ card, state });
  }
  due.sort((a, b) => (a.state.due ?? 0) - (b.state.due ?? 0));
  return [...due.map((entry) => entry.card), ...fresh].slice(0, limit);
}

/** How the deck stands: due reviews, unseen cards, and when the earliest scheduled card comes back. */
export function deckStatus(cards, schedules, now = Date.now()) {
  const known = schedules && typeof schedules === "object" ? schedules : {};
  let due = 0;
  let fresh = 0;
  let nextDue = null;
  for (const card of Array.isArray(cards) ? cards : []) {
    const state = known[card.key];
    if (!state) {
      fresh += 1;
      continue;
    }
    if (isDue(state, now)) due += 1;
    if (Number.isFinite(state.due) && state.due > now) {
      nextDue = nextDue === null ? state.due : Math.min(nextDue, state.due);
    }
  }
  return { due, fresh, total: Array.isArray(cards) ? cards.length : 0, nextDue };
}

function cleanState(state) {
  if (!state || typeof state !== "object" || Array.isArray(state)) return null;
  const ease = Number(state.ease);
  const interval = Number(state.interval);
  const due = Number(state.due);
  if (!Number.isFinite(due)) return null;
  return {
    ease: Number.isFinite(ease) ? clampEase(ease) : START_EASE,
    reps: Number.isFinite(Number(state.reps)) ? Math.max(0, Math.round(Number(state.reps))) : 0,
    lapses: Number.isFinite(Number(state.lapses)) ? Math.max(0, Math.round(Number(state.lapses))) : 0,
    interval: Number.isFinite(interval) ? clampDays(interval) : 0,
    due,
    last: Number.isFinite(Number(state.last)) ? Number(state.last) : null,
    grade: GRADES.includes(state.grade) ? state.grade : null,
  };
}

/** `localStorage` is editable and shared with older builds; anything unrecognised is an empty deck. */
export function parseDeck(text) {
  if (typeof text !== "string" || text === "") return { v: DECK_VERSION, cards: {} };
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    return { v: DECK_VERSION, cards: {} };
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { v: DECK_VERSION, cards: {} };
  const cards = {};
  const source = raw.cards && typeof raw.cards === "object" && !Array.isArray(raw.cards) ? raw.cards : {};
  for (const [key, value] of Object.entries(source)) {
    if (typeof key !== "string" || !key.includes("#")) continue;
    const state = cleanState(value);
    if (state) cards[key] = state;
  }
  return { v: DECK_VERSION, cards };
}

export function serializeDeck(deck) {
  const cards = deck && typeof deck === "object" && deck.cards ? deck.cards : {};
  return JSON.stringify({ v: DECK_VERSION, cards });
}
