/**
 * Lesson schema v2, plus the v1 shape it still has to read.
 *
 * A v2 lesson carries `screens[]`. A v1 lesson carries the same fields flat, because it was written
 * when a lesson *was* one screen. Both leave this module as `screens[]`, so the renderer and the
 * phase-2 player only ever see one shape: the compatibility window costs a branch here, not a second
 * code path in every consumer.
 *
 * Validation is a render gate, not an authoring gate. Anything that would make a page render a drill
 * nobody can pass belongs here; anything that makes a lesson *bad* (fixtures, prompt length, dead
 * links) belongs in `content-lint`, so a half-written lesson can still be previewed.
 */

import { KNOWN_FUNCTIONS, parseRef } from "../grader/index.js";

export const LEVELS = { 1: "Beginner", 2: "Intermediate", 3: "Advanced" };

export const SCHEMA_VERSION = 2;

/** Every screen type the plan defines. Only these can be graded today; phase 2 adds the rest. */
export const SCREEN_TYPES = ["formula", "chord", "sequence", "picture", "workbook"];
const IMPLEMENTED = new Set(["formula"]);

/** The grader applies these and silently skips anything else, so the loader must reject the rest. */
const RULE_TYPES = new Set(["matchType"]);

/** The fields a screen owns. v2 files may not also carry them at the top level — see `normalizeLesson`. */
const SCREEN_FIELDS = ["prompt", "grid", "answerCell", "expect", "require", "forbid", "requireRef", "rules", "hints", "fixtures"];

/** v1 prompts are laid out for a 160-character line; v2 screens may run to the plan's 220. */
const PROMPT_LIMIT = { 1: 160, 2: 220 };

/**
 * The only place `content/` is prefixed onto a message. Every helper here takes a path relative to the
 * content root (`exercises/01-sum-basics.json`, `track.json`), so no caller has to remember whether it
 * already carries the prefix.
 */
export function failAt(where, problem) {
  throw new Error(`content/${where}: ${problem}`);
}

function failExercise(file, problem) {
  failAt(`exercises/${file}`, problem);
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function requireText(value, label, where, { max = Infinity, multiline = false } = {}) {
  if (typeof value !== "string" || value.trim() === "") failAt(where, `${label} must be a non-empty string`);
  if (!multiline && value.includes("\n")) failAt(where, `${label} must be a single line`);
  if (value.length > max) failAt(where, `${label} is ${value.length} characters, limit is ${max}`);
  return value.trim();
}

function requireCell(value, label, where) {
  const text = requireText(value, label, where);
  const address = parseRef(text);
  if (!address) failAt(where, `${label} "${text}" is not a cell address`);
  // The renderer compares raw strings, so "b5" would validate and then match no cell.
  if (text !== address.key) failAt(where, `${label} "${text}" must be written "${address.key}"`);
  return address;
}

/** A rule names a function; a typo there makes a drill unpassable (or a forbid toothless). */
function requireFunction(rule, label, where) {
  const func = requireText(rule.func, `${label}.func`, where);
  if (!KNOWN_FUNCTIONS.has(func.toUpperCase())) {
    failAt(where, `${label}.func "${func}" is not a function the grader knows`);
  }
}

function validateRules(rules, field, where, check) {
  if (rules === undefined) return;
  if (!Array.isArray(rules)) failAt(where, `${field} must be an array`);
  rules.forEach((rule, index) => {
    const label = `${field}[${index}]`;
    if (!isPlainObject(rule)) failAt(where, `${label} must be an object`);
    requireText(rule.id, `${label}.id`, where);
    check(rule, label);
  });
}

/** Everything a screen needs before it can be rendered, graded and taught. */
function validateScreen(screen, label, where, version) {
  requireText(screen.prompt, `${label}prompt`, where, { max: PROMPT_LIMIT[version] });

  const { grid } = screen;
  if (!grid || !Array.isArray(grid.rows) || grid.rows.length === 0) {
    failAt(where, `${label}grid.rows must be a non-empty array`);
  }
  if (!Array.isArray(grid.rows[0]) || grid.rows[0].length === 0) {
    failAt(where, `${label}grid.rows[0] must be a non-empty array`);
  }
  const start = requireCell(grid.startCell, `${label}grid.startCell`, where);
  const width = grid.rows[0].length;
  grid.rows.forEach((row, index) => {
    if (!Array.isArray(row)) failAt(where, `${label}grid.rows[${index}] must be an array`);
    if (row.length !== width) failAt(where, `${label}grid.rows[${index}] has ${row.length} cells, expected ${width}`);
  });

  // Without this the page renders a drill with no target cell to fill in.
  const insideGrid = (address) =>
    address.row >= start.row &&
    address.row < start.row + grid.rows.length &&
    address.colIndex >= start.colIndex &&
    address.colIndex < start.colIndex + width;

  const outside = (label, text) =>
    failAt(
      where,
      `${label} "${text}" is outside the ${grid.rows.length}x${width} grid starting at ${grid.startCell}`,
    );

  const answer = requireCell(screen.answerCell, `${label}answerCell`, where);
  if (!insideGrid(answer)) outside(`${label}answerCell`, screen.answerCell);

  if (!screen.expect || !("value" in screen.expect)) failAt(where, `${label}expect.value is required`);
  if ("tolerance" in screen.expect && (!Number.isFinite(screen.expect.tolerance) || screen.expect.tolerance <= 0)) {
    failAt(where, `${label}expect.tolerance must be a positive number`);
  }

  if (screen.requireRef !== undefined) {
    const ref = requireCell(screen.requireRef, `${label}requireRef`, where);
    if (!insideGrid(ref)) outside(`${label}requireRef`, screen.requireRef);
  }

  if (!Array.isArray(screen.require) || screen.require.length === 0) {
    failAt(where, `${label}require must be a non-empty array`);
  }
  validateRules(screen.require, `${label}require`, where, (rule, ruleLabel) => {
    requireFunction(rule, ruleLabel, where);
    if (rule.minArgs !== undefined && (!Number.isInteger(rule.minArgs) || rule.minArgs < 1)) {
      failAt(where, `${ruleLabel}.minArgs must be a positive integer`);
    }
  });
  validateRules(screen.forbid, `${label}forbid`, where, (rule, ruleLabel) => requireFunction(rule, ruleLabel, where));
  validateRules(screen.rules, `${label}rules`, where, (rule, ruleLabel) => {
    if (!RULE_TYPES.has(rule.type)) {
      failAt(
        where,
        `${ruleLabel}.type ${JSON.stringify(rule.type)} is not a rule the grader applies (${[...RULE_TYPES].join(", ")})`,
      );
    }
    requireFunction(rule, ruleLabel, where);
    if (!Number.isInteger(rule.arg) || rule.arg < 1) failAt(where, `${ruleLabel}.arg must be a positive integer`);
    if (!Array.isArray(rule.values) || rule.values.length === 0) {
      failAt(where, `${ruleLabel}.values must be a non-empty array`);
    }
  });

  // The authoring gate wants 6 + 6; the loader only needs to know that a fixture is a formula.
  if (screen.fixtures !== undefined) {
    if (!isPlainObject(screen.fixtures)) failAt(where, `${label}fixtures must be an object`);
    for (const field of ["accept", "reject"]) {
      const list = screen.fixtures[field];
      if (!Array.isArray(list)) failAt(where, `${label}fixtures.${field} must be an array`);
      list.forEach((formula, index) =>
        requireText(formula, `${label}fixtures.${field}[${index}]`, where, { max: 200 }),
      );
    }
  }
}

function validateDocs(docs, where) {
  if (!docs || typeof docs !== "object") failAt(where, "docs is required");
  requireText(docs.syntax, "docs.syntax", where, { max: 120 });
  requireText(docs.explain, "docs.explain", where);
  requireText(docs.atWork, "docs.atWork", where);
  requireText(docs.outcome, "docs.outcome", where, { max: 120 });
  requireText(docs.teaches, "docs.teaches", where, { max: 80 });
  requireText(docs.reference, "docs.reference", where, { max: 120 });
  requireText(docs.dataset, "docs.dataset", where, { max: 60 });
  if (!docs.reference.startsWith("=")) failAt(where, "docs.reference must be a formula starting with =");
  if (!Array.isArray(docs.errors) || docs.errors.length === 0) failAt(where, "docs.errors must be a non-empty array");
  docs.errors.forEach((entry, index) => {
    if (!entry || typeof entry !== "object") failAt(where, `docs.errors[${index}] must be an object`);
    requireText(entry.code, `docs.errors[${index}].code`, where, { max: 40 });
    requireText(entry.text, `docs.errors[${index}].text`, where);
  });
}

/** The fields a screen owns, in the order a payload or a diff reads best. */
function pickScreen(screen, id, type) {
  return {
    id,
    type,
    prompt: screen.prompt.trim(),
    grid: screen.grid,
    answerCell: screen.answerCell,
    expect: screen.expect,
    require: screen.require,
    forbid: screen.forbid ?? [],
    requireRef: screen.requireRef,
    rules: screen.rules ?? [],
    hints: screen.hints ?? {},
    fixtures: screen.fixtures,
  };
}

/**
 * Reads either version and returns the v2 shape:
 * `{ id, slug, level, title, docs, schemaVersion, screens: [...] }`.
 * Nothing per-screen survives at the top level, so there is no second copy to fall out of date.
 */
export function normalizeLesson(raw, file) {
  if (!isPlainObject(raw)) failExercise(file, "must be a JSON object");

  const where = `exercises/${file}`;
  const version = raw.schemaVersion ?? 1;
  if (version !== 1 && version !== SCHEMA_VERSION) {
    failExercise(file, `schemaVersion ${JSON.stringify(raw.schemaVersion)} is not 1 or ${SCHEMA_VERSION}`);
  }
  // Screens on a v1 lesson are read by nobody: the flat drill renders and the screens silently vanish.
  if (version !== SCHEMA_VERSION && raw.screens !== undefined) {
    failExercise(
      file,
      `screens require schemaVersion ${SCHEMA_VERSION} — as written this lesson renders its flat drill and the screens are ignored`,
    );
  }

  const id = requireText(raw.id, "id", where);
  const slug = requireText(raw.slug, "slug", where);
  if (id !== file.replace(/\.json$/, "")) failExercise(file, `id "${id}" must match the file name`);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) failExercise(file, `slug "${slug}" must be lowercase-kebab`);
  if (!LEVELS[raw.level]) {
    failExercise(file, `level must be 1, 2 or 3 (got ${JSON.stringify(raw.level)})`);
  }
  requireText(raw.title, "title", where, { max: 60 });
  validateDocs(raw.docs, where);

  let screens;
  if (version === 1) {
    // v1: the lesson is the screen. The label prefix stays empty so every existing message is unchanged.
    validateScreen(raw, "", where, 1);
    screens = [pickScreen(raw, "formula-1", "formula")];
  } else {
    for (const field of SCREEN_FIELDS) {
      if (raw[field] === undefined) continue;
      failExercise(file, `${field} belongs on a screen once schemaVersion ${SCHEMA_VERSION} is set — the copy here would never render`);
    }
    if (!Array.isArray(raw.screens) || raw.screens.length === 0) {
      failExercise(file, "screens must be a non-empty array (schemaVersion 2)");
    }
    const seen = new Set();
    screens = raw.screens.map((screen, index) => {
      const label = `screens[${index}].`;
      if (!isPlainObject(screen)) failAt(where, `screens[${index}] must be an object`);
      const screenId = requireText(screen.id, `${label}id`, where);
      if (seen.has(screenId)) failAt(where, `${label}id "${screenId}" is a duplicate`);
      seen.add(screenId);
      if (!SCREEN_TYPES.includes(screen.type)) {
        failAt(where, `${label}type ${JSON.stringify(screen.type)} is not one of ${SCREEN_TYPES.join(", ")}`);
      }
      if (!IMPLEMENTED.has(screen.type)) {
        failAt(where, `${label}type "${screen.type}" does not render yet — only ${[...IMPLEMENTED].join(", ")} screens can be graded today`);
      }
      validateScreen(screen, label, where, 2);
      return pickScreen(screen, screenId, screen.type);
    });
  }

  return { id, slug, level: raw.level, title: raw.title.trim(), docs: raw.docs, schemaVersion: version, screens };
}

/** The screen a single-screen surface renders. Phase 2's player passes an index. */
export function screenAt(lesson, index = 0) {
  return lesson.screens[index] ?? null;
}

/**
 * The track file: identity, the free-lesson gate, and the catalog.
 *
 * The catalog is an ordered list of every lesson the site intends to have — the published ones and the
 * ones still to be written. An entry with an `id` is an authored lesson and takes its title, slug and
 * level from that lesson's file, so those cannot disagree; an entry with a `title` and a `level` but no
 * `id` is a slot that is planned but not written yet. Order is the curriculum: published numbering is
 * derived from the authored entries' relative order, so inserting a planned slot never renumbers a
 * page, but publishing one does.
 */
export function normalizeTrack(raw, file) {
  const where = file;
  if (!isPlainObject(raw)) failAt(where, "must be a JSON object");

  const id = requireText(raw.id, "id", where);
  const title = requireText(raw.title, "title", where, { max: 60 });
  const promise = requireText(raw.promise, "promise", where, { max: 160 });

  if (!Array.isArray(raw.groups) || raw.groups.length === 0) failAt(where, "groups must be a non-empty array");
  const groups = [];
  const groupIds = new Set();
  raw.groups.forEach((group, index) => {
    const label = `groups[${index}]`;
    if (!isPlainObject(group)) failAt(where, `${label} must be an object`);
    const groupId = requireText(group.id, `${label}.id`, where);
    if (!/^[a-z][a-z0-9-]*$/.test(groupId)) failAt(where, `${label}.id "${groupId}" must be lowercase-kebab`);
    if (groupIds.has(groupId)) failAt(where, `${label}.id "${groupId}" is a duplicate`);
    groupIds.add(groupId);
    const groupTitle = requireText(group.title, `${label}.title`, where, { max: 60 });
    // Category intros are landing copy, so they run to paragraphs rather than to one line.
    const intro = group.intro === undefined
      ? null
      : requireText(group.intro, `${label}.intro`, where, { max: 1800, multiline: true });
    groups.push({ id: groupId, title: groupTitle, intro });
  });

  if (!Array.isArray(raw.lessons) || raw.lessons.length === 0) failAt(where, "lessons must be a non-empty array");
  const lessons = raw.lessons.map((entry, index) => {
    const label = `lessons[${index}]`;
    if (!isPlainObject(entry)) {
      failAt(where, `${label} must be an object — { id } for an authored lesson, { title, level } for a planned one`);
    }
    const group = requireText(entry.group, `${label}.group`, where);
    if (!groupIds.has(group)) failAt(where, `${label}.group "${group}" is not one of this track's groups`);
    if (entry.level !== undefined && entry.id !== undefined) {
      failAt(where, `${label}.level is read from the lesson file once the lesson exists — drop it here`);
    }
    if (entry.id !== undefined) {
      if (entry.title !== undefined) {
        failAt(where, `${label} has both an id and a title — an authored lesson takes its title from its file`);
      }
      return { id: requireText(entry.id, `${label}.id`, where), group, planned: false };
    }
    const plannedTitle = requireText(entry.title, `${label}.title`, where, { max: 60 });
    if (!LEVELS[entry.level]) {
      failAt(where, `${label}.level must be 1, 2 or 3 for a planned lesson (got ${JSON.stringify(entry.level)})`);
    }
    return { title: plannedTitle, level: entry.level, group, planned: true };
  });

  const authored = lessons.filter((lesson) => !lesson.planned).length;
  if (authored === 0) failAt(where, "lessons must include at least one authored entry — the index page has nothing to link");
  if (!Number.isInteger(raw.freeLessonCount) || raw.freeLessonCount < 1) {
    failAt(where, "freeLessonCount must be at least 1 — the opening drills are the free entry point");
  }
  if (raw.freeLessonCount > authored) {
    failAt(where, `freeLessonCount ${raw.freeLessonCount} exceeds the ${authored} authored lessons`);
  }
  for (const group of groups) {
    if (!lessons.some((lesson) => lesson.group === group.id)) {
      failAt(where, `group "${group.id}" has no lessons — that is a category page with nothing on it`);
    }
  }

  return { id, title, promise, freeLessonCount: raw.freeLessonCount, groups, lessons };
}
