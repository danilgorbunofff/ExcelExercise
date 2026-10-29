/**
 * The authoring gate.
 *
 * `content` decides whether a lesson can be *rendered*. This decides whether it can be *shipped*:
 * every screen has fixtures, every fixture agrees with the grader, every failure path the lesson
 * advertises is exercised, prompts are unique and short enough to read, and no link points at a
 * page that does not exist.
 *
 * It collects rather than throws, because an author wants the whole list — a schema error is a hard
 * stop (there is nothing to lint), a fixture mismatch is one line per bad formula.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { loadContent, revealOf } from "../content/index.js";
import { SCHEMA_VERSION } from "../content/schema.js";
import { grade, normaliseAnswer } from "../grader/index.js";
import { isReserved, parseChord, parsePress } from "../keys/index.js";

/** The phase-1 floor. Twelve is the number the plan asks for; six is the number CI refuses to go under. */
export const MIN_FIXTURES = 6;

/** `tests/fixtures.test.js` refuses a shorter reason, so the gate has to refuse it first. */
const MIN_WHY = 15;

/** Alt text shorter than this names the picture instead of describing it. */
const MIN_ALWAYS_TEXT = 15;

/** Past this many spellings of one answer, the list is a guess list rather than a grade. */
const MAX_ANSWERS = 6;

/** Rules the grader reports for behaviour every formula lesson can produce. */
const UNIVERSAL_RULES = ["syntax", "value", "error"];

/**
 * House style is one imperative sentence. The unit is sentences, not words: a capstone legitimately
 * names three techniques in one long sentence, while two short ones mean the drill does two things.
 */
const PROMPT_SENTENCES = 1;

/**
 * Every base a lesson page is published under. `/learn/excel` is the canonical one the Next app
 * serves; `/excel` is the static build's own, which `next.config.mjs` permanently redirects onto the
 * canonical one. Authored links may use either while both builds run, and this list has to shrink to
 * one when the legacy build is retired.
 */
export const LESSON_BASES = ["/learn/excel", "/excel"];

const LINK = /\]\((\/[^)\s]*)\)/g;

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Every rule id this screen claims it can report, so the fixtures have to reach all of them. */
function advertisedRules(screen) {
  const rules = new Set(UNIVERSAL_RULES);
  for (const rule of [...screen.require, ...screen.forbid, ...screen.rules]) rules.add(rule.id);
  if (screen.requireRef !== undefined) rules.add("require-ref");
  return rules;
}

/** Strings an author could have put a link in. `docs.reference` is a formula, so it never matches. */
function collectStrings(value, path, out) {
  if (typeof value === "string") {
    out.push([path, value]);
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => collectStrings(entry, `${path}[${index}]`, out));
    return out;
  }
  if (isPlainObject(value)) {
    for (const [key, entry] of Object.entries(value)) collectStrings(entry, `${path}.${key}`, out);
  }
  return out;
}

/**
 * The sidecar for a lesson: `null` when there is none, `false` when there is one that cannot be read.
 * The caller needs to tell those apart — a broken file already produced its own error and must not
 * also be reported as "this screen has no fixtures".
 */
function readSidecar(fixturesDir, lessonId, report) {
  if (!fixturesDir) return null;
  const path = join(fixturesDir, `${lessonId}.json`);
  if (!existsSync(path)) return null;
  try {
    return readJson(path);
  } catch (error) {
    report.error(`tests/fixtures/${lessonId}.json`, `is not readable JSON (${error.message})`);
    return false;
  }
}

/**
 * One screen's fixtures: shape, counts, then every formula through the grader.
 * `source` is `{ accepted, rejected }` with `rejected` entries `{ formula, rule?, why? }`.
 */
function checkFixtures(screen, source, { label, where, report, stats }) {
  const accepted = Array.isArray(source.accepted) ? source.accepted : null;
  const rejected = Array.isArray(source.rejected) ? source.rejected : null;
  if (!accepted) report.error(where, `${label}fixtures.accepted must be an array`);
  if (!rejected) report.error(where, `${label}fixtures.rejected must be an array`);
  if (!accepted || !rejected) return;

  if (accepted.length < MIN_FIXTURES) {
    report.error(where, `${label}has ${accepted.length} accepted fixtures, the floor is ${MIN_FIXTURES}`);
  }
  if (rejected.length < MIN_FIXTURES) {
    report.error(where, `${label}has ${rejected.length} rejected fixtures, the floor is ${MIN_FIXTURES}`);
  }

  const reached = new Set();

  for (const formula of accepted) {
    if (typeof formula !== "string" || formula.trim() === "") {
      report.error(where, `${label}accepted fixtures must be non-empty strings`);
      continue;
    }
    stats.accepted += 1;
    const result = runGrade(screen, formula, { label, where, report });
    if (!result) continue;
    if (!result.ok) {
      report.error(
        where,
        `${label}accepts "${formula}" but the grader rejects it (${result.rule}: ${result.message})`,
      );
    }
  }

  for (const entry of rejected) {
    const shaped = typeof entry === "object" && entry !== null;
    const formula = shaped ? entry.formula : entry;
    if (typeof formula !== "string" || formula.trim() === "") {
      report.error(where, `${label}rejected fixtures must be { formula, rule, why } objects`);
      continue;
    }
    // The shipped corpus is `{ formula, rule, why }`, and `npm test` rejects a bare string. Catching
    // it here keeps `content:check` from going green on fixtures the gate will refuse.
    if (!shaped || typeof entry.rule !== "string" || String(entry.why ?? "").trim().length < MIN_WHY) {
      report.error(
        where,
        `${label}"${formula}" needs { formula, rule, why } with a why of at least ${MIN_WHY} characters`,
      );
    }
    stats.rejected += 1;
    const result = runGrade(screen, formula, { label, where, report });
    if (!result) continue;
    if (result.ok) {
      report.error(where, `${label}rejects "${formula}" but the grader accepts it`);
      continue;
    }
    reached.add(result.rule);
    if (typeof entry === "object" && entry.rule !== undefined && entry.rule !== result.rule) {
      report.error(
        where,
        `${label}"${formula}" is filed under "${entry.rule}" but the grader reports "${result.rule}"`,
      );
    }
    if (result.hint.trim() === "") {
      report.warning(where, `${label}"${formula}" fails with "${result.rule}" and no hint, so nothing teaches the fix`);
    }
  }

  // A rule the lesson can report but no fixture ever triggers is documentation, not a tested path.
  for (const rule of advertisedRules(screen)) {
    if (!reached.has(rule)) {
      report.error(where, `${label}never exercises the "${rule}" failure, so that path ships untested`);
    }
  }
}

/** grade() only throws for inputs it considers programming errors; a lint run must report those, not die. */
function runGrade(screen, formula, { label, where, report }) {
  try {
    return grade(screen, formula);
  } catch (error) {
    report.error(where, `${label}"${formula}" made the grader throw: ${error.message}`);
    return null;
  }
}

function checkPrompt(screen, { label, where, report, seenPrompts }) {
  const prompt = screen.prompt;
  const key = prompt.toLowerCase().replace(/\s+/g, " ").trim();
  const previous = seenPrompts.get(key);
  if (previous) {
    report.error(where, `${label}prompt is a duplicate of the one in ${previous}`);
  } else {
    seenPrompts.set(key, `${where} ${label}`.trim());
  }
  const sentences = prompt.split(/[.!?](?:\s|$)/).filter((part) => part.trim() !== "").length;
  if (sentences > PROMPT_SENTENCES) {
    report.warning(where, `${label}prompt is ${sentences} sentences — one imperative sentence is the house style`);
  }
}

function checkLinks(value, prefix, { label, where, report, routes }) {
  for (const [path, text] of collectStrings(value, prefix, [])) {
    for (const match of text.matchAll(LINK)) {
      const target = match[1].split("#")[0];
      if (!routes.has(target)) {
        report.error(where, `${label}${path} links to "${target}", which is not a page that exists`);
      }
    }
  }
}

/**
 * The reveal and the docs example are per screen. A screen that repeats another screen's reference
 * shows the learner the same answer twice, and a lesson whose own `docs.reference` disagrees with
 * screen 1 contradicts what a single-screen surface still prints.
 */
function checkReferences(lesson, { file, report }) {
  const seen = new Map();
  lesson.screens.forEach((screen, index) => {
    // A shortcut or picture screen reveals the answer it accepts, not a formula, so it has no
    // reference to repeat and no claim on the docs example.
    if (screen.type !== "formula") return;
    const reference = screen.reference ?? lesson.docs.reference;
    const key = reference.replace(/\s+/g, "").toLowerCase();
    if (seen.has(key)) {
      report.error(
        file,
        `screens[${index}].reference repeats screens[${seen.get(key)}].reference — the reveal would show the same formula twice`,
      );
    } else {
      seen.set(key, index);
    }
  });
  // The docs example is a formula, so it is compared against the first formula screen — the one the
  // docs block is built from — no matter where a shortcut or picture screen sits in the lesson.
  const first = lesson.screens.findIndex((screen) => screen.type === "formula");
  if (lesson.screens.length > 1 && first === -1) {
    report.error(file, "has no formula screen — the lesson's docs.reference would never be shown");
  } else if (lesson.screens.length > 1) {
    const reference = lesson.screens[first].reference;
    if (reference !== lesson.docs.reference) {
      report.error(
        file,
        `docs.reference must match screens[${first}].reference ("${reference}") — it is the answer every single-screen surface prints`,
      );
    }
  }
}

/**
 * A picture screen ships an image and a list of accepted spellings, not fixtures and rules. The
 * checks that remain are the ones a learner can see: the file exists on disk, the alt text describes
 * it, and the answers are spellings of one fact rather than a pile of guesses.
 */
function checkPicture(screen, { label, where, report, contentDir }) {
  const file = join(contentDir, "images", screen.image.slice("images/".length));
  if (!existsSync(file)) {
    report.error(where, `${label}image "${screen.image}" does not exist — the build copies content/images/ onto /assets/img/`);
  }
  if (screen.alt.trim().length < MIN_ALWAYS_TEXT) {
    report.error(where, `${label}alt is ${screen.alt.trim().length} characters — describe what the image shows for a reader who cannot see it`);
  }
  if (screen.answers.length > MAX_ANSWERS) {
    report.error(where, `${label}answers lists ${screen.answers.length} spellings — beyond ${MAX_ANSWERS} grading stops being one fact`);
  }
  for (const [index, answer] of screen.answers.entries()) {
    if (normaliseAnswer(answer).length < 2) {
      report.error(where, `${label}answers[${index}] "${answer}" is too short to be a specific answer`);
    }
  }
  // Formula screens warn per rejected fixture when a rule ships no hint; a picture screen has no
  // fixtures to replay, so the same dead end is only visible here.
  if (typeof screen.hints?.value !== "string" || screen.hints.value.trim() === "") {
    report.warning(where, `${label}hints.value is missing, so a miss tells the learner nothing about where to look`);
  }
}

/**
 * A shortcut screen ships a list of presses and a hint, not fixtures and rules. What a learner can
 * trip over is the keyboard itself: a shortcut the browser keeps for itself never reaches the player,
 * and a screen with no hint leaves a wrong answer with nothing to learn from.
 */
function checkKeys(screen, { label, where, report }) {
  const field = screen.type === "chord" ? "keys" : "steps";
  const parse = screen.type === "chord" ? parseChord : parsePress;
  screen[field].forEach((entry, index) => {
    // The typed fallback still grades a reserved shortcut, which is why this is a warning: the
    // learner who types it is graded, the one who presses it watches the browser open a tab.
    const os = ["mac", "other"].find((candidate) => isReserved(parse(entry), { os: candidate }));
    if (os) {
      report.warning(
        where,
        `${label}${field}[${index}] "${entry}" is a ${os === "mac" ? "Mac" : "Windows"} browser shortcut — the player cannot intercept it, so it grades only what is typed`,
      );
    }
  });
  // Formula screens warn per rejected fixture when a rule ships no hint; a shortcut screen has no
  // fixtures to replay, so the same dead end is only visible here.
  if (typeof screen.hints?.value !== "string" || screen.hints.value.trim() === "") {
    report.warning(where, `${label}hints.value is missing, so a miss tells the learner nothing about which keys to press`);
  }
}

/**
 * Catalog rules. A title that appears twice makes the index link to two lessons that read alike;
 * planned lessons are held to the same rule as published ones, because a slot that will collide once
 * authored collides now. A group a learner can reach owes an intro, and a blank one fails the gate
 * rather than warns: it is landing copy, so its absence is a hole on the page, not a note in a log.
 */
function checkCatalog(track, lessons, report) {
  const published = new Set(lessons.map((lesson) => lesson.id));
  const titles = new Map(lessons.map((lesson) => [lesson.id, lesson.title]));
  const seen = new Map();
  track.lessons.forEach((entry, index) => {
    const title = entry.planned ? entry.title : titles.get(entry.id);
    const key = title.trim().toLowerCase();
    if (seen.has(key)) {
      report.error("content/track.json", `lessons[${index}] "${title}" repeats the title of lessons[${seen.get(key)}]`);
    } else {
      seen.set(key, index);
    }
  });
  // Only reachable groups owe copy: a group whose lessons are all still planned has nothing to
  // introduce yet, and demanding prose for it would make the catalog a draft fiction.
  const blank = track.groups
    .filter((group) => !group.intro && track.lessons.some((entry) => entry.group === group.id && published.has(entry.id)))
    .map((group) => group.id);
  if (blank.length > 0) {
    report.error("content/track.json", `${blank.length} group${blank.length === 1 ? "" : "s"} with published lessons and no intro: ${blank.join(", ")}`);
  }
}

/**
 * Lints a content directory. Returns a report; never throws for bad content.
 *
 * `fixturesDir` is where sidecar fixtures live (`tests/fixtures`). A v2 screen carries its fixtures
 * inline; a v1 lesson keeps them in the sidecar until it is migrated, and declaring both is an error
 * because then there are two answers to "which fixtures are real".
 */
export function lintContent(contentDir, { fixturesDir } = {}) {
  const errors = [];
  const warnings = [];
  const stats = { lessons: 0, screens: 0, accepted: 0, rejected: 0, groups: 0, planned: 0 };
  const report = {
    error: (where, message) => errors.push({ where, message }),
    warning: (where, message) => warnings.push({ where, message }),
  };

  let content;
  try {
    content = loadContent(contentDir);
  } catch (error) {
    report.error(null, error.message);
    return { ok: false, errors, warnings, stats, lessons: [] };
  }

  // Links resolve against what the site actually emits: the index and one page per lesson, under
  // both published bases. There is no bare `/learn/excel` page and no `/lessons` namespace, so a link
  // to either has to fail here rather than 404 in production.
  const routes = new Set(["/"]);
  for (const base of LESSON_BASES) {
    for (const lesson of content.exercises) routes.add(`${base}/${lesson.slug}`);
  }

  const seenPrompts = new Map();

  for (const lesson of content.exercises) {
    const file = `content/exercises/${lesson.id}.json`;
    stats.lessons += 1;
    stats.screens += lesson.screens.length;

    const sidecar = readSidecar(fixturesDir, lesson.id, report);
    const sidecarFixtures = isPlainObject(sidecar) ? sidecar : null;
    const sidecarFile = sidecarFixtures !== null || sidecar === false;

    lesson.screens.forEach((screen, index) => {
      const label = lesson.screens.length > 1 ? `screens[${index}].` : "";

      if (screen.type !== "formula") {
        // No fixtures, no rules, no reference: a picture screen is graded by its answer list and a
        // shortcut screen by the keys it lists, so the fixture checks below would each be a false
        // alarm. The prompt and link checks still apply to every screen.
        if (screen.type === "picture") checkPicture(screen, { label, where: file, report, contentDir });
        else checkKeys(screen, { label, where: file, report });
        checkPrompt(screen, { label, where: file, report, seenPrompts });
        checkLinks({ prompt: screen.prompt, hints: screen.hints }, "screen", { label, where: file, report, routes });
        return;
      }

      const inline = screen.fixtures;

      if (inline && sidecarFile) {
        report.error(
          file,
          `${label}declares fixtures inline and in tests/fixtures/${lesson.id}.json — keep one, or they will drift`,
        );
        return;
      }

      const source = inline
        ? { accepted: inline.accept, rejected: inline.reject }
        : index === 0
          ? sidecarFixtures
          : null;

      if (!source) {
        // A sidecar that failed to parse already has its own, more precise error.
        if (!(index === 0 && sidecarFile)) {
          report.error(file, `${label}has no fixtures — every screen ships ${MIN_FIXTURES} accepted and ${MIN_FIXTURES} rejected formulas`);
        }
      } else {
        checkFixtures(screen, source, { label, where: file, report, stats });
      }

      checkPrompt(screen, { label, where: file, report, seenPrompts });
      checkLinks({ prompt: screen.prompt, hints: screen.hints }, "screen", { label, where: file, report, routes });
    });

    checkLinks(lesson.docs, "docs", { label: "", where: file, report, routes });
    checkReferences(lesson, { file, report });

    if (lesson.schemaVersion === SCHEMA_VERSION && sidecarFile) {
      report.error(
        file,
        `is schemaVersion ${SCHEMA_VERSION} but its fixtures are still in tests/fixtures/${lesson.id}.json — move them onto the screens`,
      );
    }
  }

  checkCatalog(content.track, content.exercises, report);
  checkOrphans(fixturesDir, content.exercises, report);
  stats.groups = content.track.groups.length;
  stats.planned = content.track.lessons.filter((entry) => entry.planned).length;

  return { ok: errors.length === 0, errors, warnings, stats, lessons: content.exercises };
}

/**
 * A fixture file for a lesson that no longer exists is a lie about coverage. Membership is decided by
 * the lesson id, not by whether its fixtures parsed: a file that failed to read already has its own
 * error and is not an orphan.
 */
function checkOrphans(fixturesDir, lessons, report) {
  if (!fixturesDir || !existsSync(fixturesDir)) return;
  const known = new Set(lessons.map((lesson) => lesson.id));
  for (const name of readdirSync(fixturesDir).filter((entry) => entry.endsWith(".json")).sort()) {
    const id = name.replace(/\.json$/, "");
    if (!known.has(id)) report.error(`tests/fixtures/${name}`, "belongs to no lesson");
  }
}

/** One lesson's fixtures, replayed, for `content-lint fixtures`. */
export function replayFixtures(lesson, { fixturesDir } = {}) {
  const sidecar = fixturesDir ? readSidecar(fixturesDir, lesson.id, { error: () => {} }) : null;
  const sidecarFixtures = isPlainObject(sidecar) ? sidecar : null;
  return lesson.screens.map((screen, index) => {
    const inline = screen.fixtures;
    const source = inline
      ? { accepted: inline.accept, rejected: inline.reject }
      : index === 0
        ? sidecarFixtures
        : null;
    if (!source) return { screen, rows: [] };
    const rows = [];
    for (const formula of source.accepted ?? []) {
      if (typeof formula !== "string") continue;
      rows.push({ formula, expected: "accept", result: grade(screen, formula) });
    }
    for (const entry of source.rejected ?? []) {
      const formula = typeof entry === "string" ? entry : entry?.formula;
      if (typeof formula !== "string") continue;
      rows.push({ formula, expected: "reject", declared: entry?.rule, result: grade(screen, formula) });
    }
    return { screen, rows };
  });
}
