/**
 * Everything the drill knows that is not the grader: what the learner has finished,
 * whether a trial is running, and how a pasted formula is cleaned up. It is free of
 * DOM access on purpose — the browser wiring lives in drill.js, so this file can be
 * tested under `node --test` with a fake storage object.
 */

export const PROGRESS_KEY = "es.progress";
export const TRIAL_KEY = "es.trial";
export const TRIAL_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;
const ZERO_WIDTH = /[\u200B-\u200D\u2060\uFEFF]/g;

export function emptyProgress() {
  return { v: 1, done: {}, tries: {} };
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isLessonId(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 64;
}

/**
 * Storage is user-editable and shared with older builds, so anything unrecognised
 * becomes an empty progress rather than a crash on the next line.
 */
export function parseProgress(text) {
  if (typeof text !== "string" || text === "") return emptyProgress();
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    return emptyProgress();
  }
  if (!isPlainObject(raw)) return emptyProgress();

  const progress = emptyProgress();
  for (const [id, entry] of Object.entries(isPlainObject(raw.done) ? raw.done : {})) {
    if (!isLessonId(id) || !isPlainObject(entry)) continue;
    const at = typeof entry.at === "string" && !Number.isNaN(Date.parse(entry.at)) ? entry.at : null;
    if (!at) continue;
    progress.done[id] = {
      at,
      tries: Number.isInteger(entry.tries) && entry.tries > 0 ? entry.tries : 1,
      helped: entry.helped === true,
    };
  }
  for (const [id, tries] of Object.entries(isPlainObject(raw.tries) ? raw.tries : {})) {
    if (!isLessonId(id)) continue;
    if (Number.isInteger(tries) && tries > 0) progress.tries[id] = tries;
  }
  return progress;
}

export function serializeProgress(progress) {
  return JSON.stringify({
    v: 1,
    done: progress.done,
    tries: progress.tries,
  });
}

export function completedCount(progress) {
  return Object.keys(progress.done).length;
}

export function isComplete(progress, id) {
  return Object.hasOwn(progress.done, id);
}

/** Attempts for one lesson: recorded tries plus the tries frozen in the completion. */
export function attemptsFor(progress, id) {
  const done = progress.done[id];
  return (progress.tries[id] ?? 0) + (done ? done.tries : 0);
}

/** A failed check: pure, returns a new progress object. */
export function registerAttempt(progress, id) {
  return {
    ...progress,
    tries: { ...progress.tries, [id]: (progress.tries[id] ?? 0) + 1 },
  };
}

/**
 * A solved lesson. Completing twice keeps the first timestamp and keeps the lesson
 * counted as helped if it ever was: the certificate placeholder says "completed with
 * help" and that must not be reversible by re-solving.
 */
export function registerCompletion(progress, id, { at, helped = false } = {}) {
  const when = typeof at === "string" && !Number.isNaN(Date.parse(at)) ? at : new Date(0).toISOString();
  const previous = progress.done[id];
  const tries = progress.tries[id] ?? 0;
  const { [id]: _dropped, ...restTries } = progress.tries;
  return {
    ...progress,
    done: {
      ...progress.done,
      [id]: {
        at: previous ? previous.at : when,
        tries: Math.max(previous ? previous.tries : 0, tries) || 1,
        helped: helped || Boolean(previous && previous.helped),
      },
    },
    tries: restTries,
  };
}

export function parseTrial(text) {
  if (typeof text !== "string" || text === "") return null;
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isPlainObject(raw)) return null;
  const startedAt = typeof raw.startedAt === "string" ? Date.parse(raw.startedAt) : Number.NaN;
  if (Number.isNaN(startedAt)) return null;
  return { startedAt: new Date(startedAt).toISOString() };
}

export function startTrial(now = new Date()) {
  return { startedAt: new Date(now).toISOString() };
}

export function trialActive(trial, now = new Date()) {
  if (!trial) return false;
  const started = Date.parse(trial.startedAt);
  const current = new Date(now).getTime();
  if (Number.isNaN(started)) return false;
  return current >= started && current - started < TRIAL_DAYS * DAY_MS;
}

/** Whole days left, rounded up, so "1 day left" is true for the last 24 hours. */
export function trialDaysLeft(trial, now = new Date()) {
  if (!trialActive(trial, now)) return 0;
  const elapsed = new Date(now).getTime() - Date.parse(trial.startedAt);
  return Math.ceil((TRIAL_DAYS * DAY_MS - elapsed) / DAY_MS);
}

/** `open` or `paywall`, from the content flag and the local trial record. */
export function gateFor({ free }, trial, now = new Date()) {
  return free || trialActive(trial, now) ? "open" : "paywall";
}

/**
 * A paste arrives with the leading `=`, sometimes a leading apostrophe from Excel,
 * and often invisible characters from a web page. Grading wants the formula only.
 */
export function normaliseFormula(raw) {
  return String(raw ?? "")
    .replace(ZERO_WIDTH, "")
    .replace(/[\r\n\t]+/g, " ")
    .trim();
}

/**
 * Whether a Check may grade the bar. Selecting a data cell fills the bar with that
 * cell's value and disables it, so grading then would spend an attempt on a read-only
 * value; the button is disabled in the same breath, but the guard lives here so a
 * stray Enter or a scripted click cannot get past it.
 */
export function canGrade({ selected, answerCell, disabled } = {}) {
  return disabled !== true && typeof selected === "string" && selected === answerCell;
}

/**
 * The line under a syntax message: their formula with a caret under the failing token.
 * The grader's `position` is 1-based, and it refers to the string the grader saw, so
 * the caller must pass the same normalised text it graded.
 */
export function caretLine(raw, position) {
  const text = String(raw ?? "");
  if (!Number.isInteger(position) || position < 1) return "";
  // grade() drops one leading "=" before parsing, so its positions count from the
  // formula body; shift them back into the string the learner actually sees.
  const lead = text.startsWith("=") ? 1 : 0;
  const offset = Math.min(position - 1 + lead, text.length);
  const padding = text.slice(0, offset).replace(/[^\t]/g, " ");
  return `${text}\n${padding}^`;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validEmail(text) {
  const value = String(text ?? "").trim();
  return value.length <= 254 && EMAIL.test(value);
}

/** Parse the inlined payload. A broken payload is a page bug, not a learner error. */
export function parsePayload(text) {
  let payload;
  try {
    payload = JSON.parse(text);
  } catch (error) {
    throw new Error(`exercise payload is not JSON: ${error.message}`);
  }
  if (!isPlainObject(payload)) throw new Error("exercise payload must be an object");
  if (typeof payload.id !== "string" || payload.id === "") {
    throw new Error("exercise payload is missing id");
  }
  if (!Array.isArray(payload.screens) || payload.screens.length === 0) {
    throw new Error("exercise payload must carry at least one screen");
  }
  payload.screens.forEach((screen, index) => {
    const where = `exercise payload screen ${index + 1}`;
    if (!isPlainObject(screen)) throw new Error(`${where} must be an object`);
    for (const key of ["prompt", "type"]) {
      if (typeof screen[key] !== "string" || screen[key] === "") {
        throw new Error(`${where} is missing ${key}`);
      }
    }
    // Each type is graded from its own field, so the grid and the target cell a type has no use for
    // are required only of the types that grade from them: a picture from `answers`, a shortcut from
    // its presses.
    if (screen.type === "picture") {
      if (!Array.isArray(screen.answers) || screen.answers.length === 0) {
        throw new Error(`${where} is missing answers`);
      }
    } else if (screen.type === "chord" || screen.type === "sequence") {
      const field = screen.type === "chord" ? "keys" : "steps";
      if (!Array.isArray(screen[field]) || screen[field].length === 0) {
        throw new Error(`${where} is missing ${field}`);
      }
    } else {
      if (typeof screen.answerCell !== "string" || screen.answerCell === "") {
        throw new Error(`${where} is missing answerCell`);
      }
      if (!isPlainObject(screen.grid) || !Array.isArray(screen.grid.rows)) {
        throw new Error(`${where} is missing grid.rows`);
      }
    }
    if (!isPlainObject(screen.expect) || screen.expect.value === undefined) {
      throw new Error(`${where} is missing expect.value`);
    }
  });
  if (!isPlainObject(payload.track) || typeof payload.track.free !== "boolean") {
    throw new Error("exercise payload is missing track.free");
  }
  return payload;
}
