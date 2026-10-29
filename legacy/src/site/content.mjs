/**
 * Reads and validates the track. The build is the last gate before a page ships, so
 * anything malformed here is a hard failure with the offending file named — never a
 * page with a hole in it.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { parseRef } from "../grader/address.js";
import { KNOWN_FUNCTIONS } from "../grader/functions.js";

const LEVELS = { 1: "Beginner", 2: "Intermediate", 3: "Advanced" };

/** The grader applies these and silently skips anything else, so the build must reject the rest. */
const RULE_TYPES = new Set(["matchType"]);

export { LEVELS };

function fail(file, problem) {
  throw new Error(`content/${file}: ${problem}`);
}

function failExercise(file, problem) {
  fail(`exercises/${file}`, problem);
}

function readJson(path, label) {
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    throw new Error(`content/${label}: cannot read (${error.code ?? error.message})`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`content/${label}: invalid JSON (${error.message})`);
  }
}

function requireText(value, label, where, { max = Infinity } = {}) {
  if (typeof value !== "string" || value.trim() === "") fail(where, `${label} must be a non-empty string`);
  if (value.includes("\n")) fail(where, `${label} must be a single line`);
  if (value.length > max) fail(where, `${label} is ${value.length} characters, limit is ${max}`);
  return value.trim();
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireCell(value, label, where) {
  const text = requireText(value, label, where);
  const address = parseRef(text);
  if (!address) fail(where, `${label} "${text}" is not a cell address`);
  // The renderer compares raw strings, so "b5" would validate and then match no cell.
  if (text !== address.key) fail(where, `${label} "${text}" must be written "${address.key}"`);
  return address;
}

/** A rule names a function; a typo there makes a drill unpassable (or a forbid toothless). */
function requireFunction(rule, label, where) {
  const func = requireText(rule.func, `${label}.func`, where);
  if (!KNOWN_FUNCTIONS.has(func.toUpperCase())) {
    fail(where, `${label}.func "${func}" is not a function the grader knows`);
  }
}

function validateRules(rules, field, where, check) {
  if (rules === undefined) return;
  if (!Array.isArray(rules)) fail(where, `${field} must be an array`);
  rules.forEach((rule, index) => {
    const label = `${field}[${index}]`;
    if (!isPlainObject(rule)) fail(where, `${label} must be an object`);
    requireText(rule.id, `${label}.id`, where);
    check(rule, label);
  });
}

function validateExercise(exercise, file) {
  if (exercise === null || typeof exercise !== "object") failExercise(file, "must be a JSON object");

  const where = `exercises/${file}`;

  const id = requireText(exercise.id, "id", where);
  const slug = requireText(exercise.slug, "slug", where);
  if (id !== file.replace(/\.json$/, "")) failExercise(file, `id "${id}" must match the file name`);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) failExercise(file, `slug "${slug}" must be lowercase-kebab`);
  if (!LEVELS[exercise.level]) failExercise(file, `level must be 1, 2 or 3 (got ${JSON.stringify(exercise.level)})`);

  requireText(exercise.title, "title", where, { max: 60 });
  requireText(exercise.prompt, "prompt", where, { max: 160 });

  const { grid } = exercise;
  if (!grid || !Array.isArray(grid.rows) || grid.rows.length === 0) failExercise(file, "grid.rows must be a non-empty array");
  if (!Array.isArray(grid.rows[0]) || grid.rows[0].length === 0) failExercise(file, "grid.rows[0] must be a non-empty array");
  const start = requireCell(grid.startCell, "grid.startCell", where);
  const width = grid.rows[0].length;
  grid.rows.forEach((row, index) => {
    if (!Array.isArray(row)) failExercise(file, `grid.rows[${index}] must be an array`);
    if (row.length !== width) failExercise(file, `grid.rows[${index}] has ${row.length} cells, expected ${width}`);
  });

  // Without this the page renders a drill with no target cell to fill in.
  const insideGrid = (address) =>
    address.row >= start.row &&
    address.row < start.row + grid.rows.length &&
    address.colIndex >= start.colIndex &&
    address.colIndex < start.colIndex + width;

  const outside = (label, text) =>
    failExercise(file, `${label} "${text}" is outside the ${grid.rows.length}x${width} grid starting at ${grid.startCell}`);

  const answer = requireCell(exercise.answerCell, "answerCell", where);
  if (!insideGrid(answer)) outside("answerCell", exercise.answerCell);

  if (!exercise.expect || !("value" in exercise.expect)) failExercise(file, "expect.value is required");
  if ("tolerance" in exercise.expect && (!Number.isFinite(exercise.expect.tolerance) || exercise.expect.tolerance <= 0)) {
    failExercise(file, "expect.tolerance must be a positive number");
  }

  if (exercise.requireRef !== undefined) {
    const ref = requireCell(exercise.requireRef, "requireRef", where);
    if (!insideGrid(ref)) outside("requireRef", exercise.requireRef);
  }

  if (!Array.isArray(exercise.require) || exercise.require.length === 0) failExercise(file, "require must be a non-empty array");
  validateRules(exercise.require, "require", where, (rule, label) => {
    requireFunction(rule, label, where);
    if (rule.minArgs !== undefined && (!Number.isInteger(rule.minArgs) || rule.minArgs < 1)) {
      fail(where, `${label}.minArgs must be a positive integer`);
    }
  });
  validateRules(exercise.forbid, "forbid", where, (rule, label) => requireFunction(rule, label, where));
  validateRules(exercise.rules, "rules", where, (rule, label) => {
    if (!RULE_TYPES.has(rule.type)) {
      fail(where, `${label}.type ${JSON.stringify(rule.type)} is not a rule the grader applies (${[...RULE_TYPES].join(", ")})`);
    }
    requireFunction(rule, label, where);
    if (!Number.isInteger(rule.arg) || rule.arg < 1) fail(where, `${label}.arg must be a positive integer`);
    if (!Array.isArray(rule.values) || rule.values.length === 0) fail(where, `${label}.values must be a non-empty array`);
  });

  const docs = exercise.docs;
  if (!docs || typeof docs !== "object") failExercise(file, "docs is required");
  requireText(docs.syntax, "docs.syntax", where, { max: 120 });
  requireText(docs.explain, "docs.explain", where);
  requireText(docs.atWork, "docs.atWork", where);
  requireText(docs.outcome, "docs.outcome", where, { max: 120 });
  requireText(docs.teaches, "docs.teaches", where, { max: 80 });
  requireText(docs.reference, "docs.reference", where, { max: 120 });
  requireText(docs.dataset, "docs.dataset", where, { max: 60 });
  if (!docs.reference.startsWith("=")) failExercise(file, "docs.reference must be a formula starting with =");
  if (!Array.isArray(docs.errors) || docs.errors.length === 0) failExercise(file, "docs.errors must be a non-empty array");
  docs.errors.forEach((entry, index) => {
    if (!entry || typeof entry !== "object") failExercise(file, `docs.errors[${index}] must be an object`);
    requireText(entry.code, `docs.errors[${index}].code`, where, { max: 40 });
    requireText(entry.text, `docs.errors[${index}].text`, where);
  });

  return exercise;
}

export function loadContent(contentDir) {
  const track = readJson(join(contentDir, "track.json"), "track.json");
  requireText(track.id, "id", "track.json");
  requireText(track.title, "title", "track.json", { max: 60 });
  requireText(track.promise, "promise", "track.json", { max: 160 });
  if (!Number.isInteger(track.freeLessonCount) || track.freeLessonCount < 1) {
    fail("track.json", "freeLessonCount must be at least 1 — the opening drills are the free entry point");
  }
  if (!Array.isArray(track.lessons) || track.lessons.length === 0) fail("track.json", "lessons must be a non-empty array");

  const dir = join(contentDir, "exercises");
  const files = readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort();

  const exercises = files.map((file) => validateExercise(readJson(join(dir, file), `exercises/${file}`), file));

  const byId = new Map();
  const bySlug = new Map();
  for (const exercise of exercises) {
    if (byId.has(exercise.id)) fail(`exercises/${exercise.id}.json`, `duplicate id`);
    if (bySlug.has(exercise.slug)) fail(`exercises/${exercise.id}.json`, `duplicate slug "${exercise.slug}"`);
    byId.set(exercise.id, exercise);
    bySlug.set(exercise.slug, exercise);
  }

  for (const id of track.lessons) {
    if (!byId.has(id)) fail("track.json", `lessons lists "${id}" but content/exercises/${id}.json does not exist`);
  }
  for (const exercise of exercises) {
    if (!track.lessons.includes(exercise.id)) {
      fail(`exercises/${exercise.id}.json`, "is not listed in track.json lessons — it would never be linked");
    }
  }

  if (track.freeLessonCount > track.lessons.length) {
    fail("track.json", `freeLessonCount ${track.freeLessonCount} exceeds the ${track.lessons.length} lessons`);
  }

  const ordered = track.lessons.map((id) => byId.get(id));

  return {
    track,
    exercises: ordered,
    index: ordered.map((exercise, position) => {
      const number = position + 1;
      const last = position === ordered.length - 1;
      const prev = position > 0 ? ordered[position - 1] : null;
      return {
        exercise,
        number,
        level: LEVELS[exercise.level],
        free: number <= track.freeLessonCount,
        slug: exercise.slug,
        path: `/excel/${exercise.slug}`,
        prev,
        prevPath: prev ? `/excel/${prev.slug}` : "/",
        prevLabel: prev ? prev.title : "All drills",
        next: last ? null : ordered[position + 1],
        nextPath: last ? null : `/excel/${ordered[position + 1].slug}`,
      };
    }),
  };
}
