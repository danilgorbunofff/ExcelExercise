/**
 * Everything the exercise knows that is not the grader: what the learner has finished,
 * which exercises are free, and how a pasted formula is cleaned up. It is free of
 * DOM access on purpose — the browser wiring lives in drill.js, so this file can be
 * tested under `node --test` with a fake storage object.
 */

export const PROGRESS_KEY = "es.progress";
export const GRACE_KEY = "es.grace";

const ZERO_WIDTH = /[\u200B-\u200D\u2060\uFEFF]/g;

export function emptyProgress() {
  return { v: 1, done: {}, tries: {}, unlocked: false };
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
  progress.unlocked = raw.unlocked === true;
  return progress;
}

export function serializeProgress(progress) {
  return JSON.stringify({
    v: 1,
    done: progress.done,
    tries: progress.tries,
    unlocked: progress.unlocked === true,
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

/**
 * The free pass past the soft prompt, remembered per exercise. The exercise has no account to hang it on,
 * so it is a browser fact like progress: same store, same honour system.
 */
export function emptyGrace() {
  return { v: 1, used: [] };
}

export function parseGrace(text) {
  if (typeof text !== "string" || text === "") return emptyGrace();
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    return emptyGrace();
  }
  if (!isPlainObject(raw) || !Array.isArray(raw.used)) return emptyGrace();
  return { v: 1, used: raw.used.filter((id) => typeof id === "string" && id !== "") };
}

export function graceUsed(grace, id) {
  return Array.isArray(grace?.used) && grace.used.includes(id);
}

export function grantGrace(grace, id) {
  const used = Array.isArray(grace?.used) ? grace.used : [];
  return { v: 1, used: used.includes(id) ? [...used] : [...used, id] };
}

/**
 * The one door past the gate once the store is open, and the price it names.
 *
 * The wall sells the shortest term, not the cheapest per month: it has no room for the comparison, and
 * a reader who is curious should not be pushed into a year by the page they cannot leave. This file is
 * shipped to the browser and cannot import `site/offer.mjs`, so `DEFAULT_PLAN` and `PRICE` are checked
 * against these two values by `tests/paywall-offer.test.js` instead.
 */
export const CHECKOUT_ACTION = "/api/stripe/checkout?plan=monthly";
export const TRACK_PRICE = "$9.99 a month";

/**
 * What stands under a gated exercise: nothing, a buy button, or the pre-launch free unlock.
 *
 * Two facts decide it. An entitled reader is offered nothing. Otherwise the store decides: open,
 * and the only door is the checkout form; closed, and the only door is the free unlock. The
 * ordering matters — the free unlock cannot be offered alongside a price, because the reader finds
 * the free one first and the price stops meaning anything.
 *
 * `checkout` is a build fact passed down in the lesson payload, not something this file probes:
 * the static edition has no server to ask.
 */
export function paywallOffer({ entitled = false, checkout = false, price = TRACK_PRICE, action = CHECKOUT_ACTION } = {}) {
  if (entitled) return { kind: "open" };
  if (checkout) {
    return {
      kind: "buy",
      method: "post",
      action,
      label: `Unlock the track: ${price}`,
      note: "One month at a time, and every exercise is open while it runs. Cancel from your account page and the month you paid for runs to its end. Six months and a year cost less each month; both are on the pricing page.",
    };
  }
  return {
    kind: "unlock",
    label: "Unlock the whole track for this browser",
    note: "Free while the store is closed. It is remembered in this browser, not on an account.",
  };
}

/**
 * `open`, `prompt` or `paywall`, from the content flag and the position the prompt falls on.
 *
 * The free exercises are a curated list in `track.json`, so they are not a prefix and `free` is the only
 * thing that decides "open". `promptAt` is the catalog position of the one paid exercise `track.json`
 * nominates in `promptLesson`, not of the first paid exercise in order — the free set is scattered
 * across the track, and the prompt should fall where a reader is at their most curious, not wherever
 * the catalogue happens to stop being free. That one exercise opens on a click, once, so the boundary
 * is a question before it is a wall. `lib/paywall.js`
 * asks this same function before it serves a lesson, so the boundary is one rule rather than two that
 * drift.
 */
export function gateFor({ free, number, promptAt }) {
  if (free) return "open";
  if (Number.isInteger(promptAt) && number === promptAt) return "prompt";
  return "paywall";
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
    // are required only of the types that grade from them: a picture or a workbook from `answers`, a
    // shortcut from its presses.
    if (screen.type === "picture" || screen.type === "workbook") {
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
