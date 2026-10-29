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

import { loadContent } from "../content/index.js";
import { SCHEMA_VERSION } from "../content/schema.js";
import { grade } from "../grader/index.js";

/** The phase-1 floor. Twelve is the number the plan asks for; six is the number CI refuses to go under. */
export const MIN_FIXTURES = 6;

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
    const formula = typeof entry === "string" ? entry : entry?.formula;
    if (typeof formula !== "string" || formula.trim() === "") {
      report.error(where, `${label}rejected fixtures must be strings or { formula } objects`);
      continue;
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
 * Catalog rules. A title that appears twice makes the index link to two lessons that read alike;
 * planned lessons are held to the same rule as published ones, because a slot that will collide once
 * authored collides now. Groups with published lessons owe an intro — the copy debt is reported until
 * category pages exist.
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
  // Step 6 writes the 16 intros; until then this stays a single warning rather than nine errors, and
  // it becomes an error the moment a category page renders a group. The test that owns that flip reads
  // the app tree, so adding such a page fails the suite until this line changes with it.
  const blank = track.groups
    .filter((group) => !group.intro && track.lessons.some((entry) => entry.group === group.id && published.has(entry.id)))
    .map((group) => group.id);
  if (blank.length > 0) {
    report.warning("content/track.json", `${blank.length} group${blank.length === 1 ? "" : "s"} with published lessons and no intro yet: ${blank.join(", ")}`);
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
