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

import { KNOWN_FUNCTIONS, normaliseAnswer, parseRef } from "../grader/index.js";
import { chordText, parseChord, parsePress } from "../keys/index.js";

export const LEVELS = { 1: "Beginner", 2: "Intermediate", 3: "Advanced" };

export const SCHEMA_VERSION = 2;

/** Every screen type the plan defines, and every one of them renders and grades. */
export const SCREEN_TYPES = ["formula", "chord", "sequence", "picture", "workbook"];

/** The grader applies these and silently skips anything else, so the loader must reject the rest. */
const RULE_TYPES = new Set(["matchType"]);

/** A picture screen is read, not typed into: the image is the data and `answers` is the grading. */
const PICTURE_FIELDS = ["image", "alt", "answers"];

/** The one field only a workbook screen renders: the spreadsheet it hands the learner to open. */
const WORKBOOK_ONLY_FIELDS = ["sheet"];

/** The inverse: fields a picture screen has no use for, and a formula screen's grader cannot read. */
const FORMULA_FIELDS = ["grid", "answerCell", "expect", "require", "forbid", "requireRef", "rules", "fixtures"];

/** The two key screens' own fields, which neither a formula screen nor a picture screen can render. */
const KEY_FIELDS = ["keys", "steps"];

/**
 * Where a picture screen's image may live. The build copies `content/images/` flat onto
 * `/assets/img/`, so a path with a directory in it, or a URL, would render a broken image.
 */
const IMAGE_PATH = /^images\/[a-z0-9]+(-[a-z0-9]+)*\.(svg|png)$/;

/** The fields a screen owns. v2 files may not also carry them at the top level — see `normalizeLesson`. */
const SCREEN_FIELDS = [
  "prompt",
  "grid",
  "answerCell",
  "expect",
  "require",
  "forbid",
  "requireRef",
  "rules",
  "hints",
  "fixtures",
  "image",
  "alt",
  "answers",
  "keys",
  "steps",
  "reference",
  "sheet",
];

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
  // Checked here rather than in each validator: every other type would render, drop the sheet and
  // leave the author wondering why the file they wrote never shipped.
  if (screen.type !== "workbook") {
    for (const field of WORKBOOK_ONLY_FIELDS) {
      if (screen[field] !== undefined) {
        failAt(where, `${label}${field} belongs to a workbook screen — a ${screen.type ?? "formula"} screen is rendered from its own fields`);
      }
    }
  }
  if (screen.type === "picture") validatePictureScreen(screen, label, where);
  else if (screen.type === "workbook") validateWorkbookScreen(screen, label, where);
  else if (screen.type === "chord") validateChordScreen(screen, label, where);
  else if (screen.type === "sequence") validateSequenceScreen(screen, label, where);
  else validateFormulaScreen(screen, label, where);
}

/**
 * A picture screen: an image this repository ships, a line of alt text for the learner who cannot
 * see it, and the spellings of the answer it asks for. There is no grid, no answer cell and no
 * rules — the image is the whole prompt and `answers` is the whole grade.
 */
function validatePictureScreen(screen, label, where) {
  for (const field of FORMULA_FIELDS) {
    if (screen[field] !== undefined) {
      failAt(where, `${label}${field} belongs to a formula screen — a picture screen is graded by its answers alone`);
    }
  }
  for (const field of KEY_FIELDS) {
    if (screen[field] !== undefined) {
      failAt(where, `${label}${field} belongs to a chord or sequence screen — a picture screen is graded by its answers alone`);
    }
  }
  if (screen.reference !== undefined) {
    failAt(
      where,
      `${label}reference is a formula screen's reveal — a picture screen reveals the first answer it accepts`,
    );
  }

  const image = requireText(screen.image, `${label}image`, where, { max: 120 });
  if (!IMAGE_PATH.test(image)) {
    failAt(where, `${label}image "${image}" must be a path like images/name.svg inside content/, not a URL`);
  }
  requireText(screen.alt, `${label}alt`, where, { max: 240 });

  if (!Array.isArray(screen.answers) || screen.answers.length === 0) {
    failAt(where, `${label}answers must be a non-empty array`);
  }
  checkAnswers(screen.answers, label, where);

  checkAnswerHints(screen, label, where, "picture screen");
}

/**
 * The spellings of one answer, which a list-graded screen looks up rather than evaluates. Two
 * spellings that normalise to the same string are one answer and one dead entry, so that is a
 * failure here instead of a grade the learner can never earn twice.
 */
function checkAnswers(answers, label, where) {
  const seen = new Map();
  answers.forEach((answer, index) => {
    const text = requireText(answer, `${label}answers[${index}]`, where, { max: 80 });
    const key = normaliseAnswer(text);
    const previous = seen.get(key);
    if (previous !== undefined) {
      failAt(where, `${label}answers[${index}] repeats answers[${previous}] once normalised — one of them is dead`);
    }
    seen.set(key, index);
  });
}

/**
 * A workbook screen: a spreadsheet the lesson ships and a question about one of its cells. The
 * learner opens the file — or reads the preview the page renders from the same rows — and answers in
 * words, so `answers` is the whole grade exactly as it is for a picture screen.
 */
function validateWorkbookScreen(screen, label, where) {
  for (const field of FORMULA_FIELDS) {
    if (screen[field] !== undefined) {
      failAt(where, `${label}${field} belongs to a formula screen — a workbook screen is graded by its answers alone`);
    }
  }
  for (const field of ["image", "alt"]) {
    if (screen[field] !== undefined) {
      failAt(where, `${label}${field} belongs to a picture screen — a workbook screen ships a file`);
    }
  }
  for (const field of KEY_FIELDS) {
    if (screen[field] !== undefined) {
      failAt(where, `${label}${field} belongs to a chord or sequence screen — a workbook screen is graded by its answers alone`);
    }
  }
  if (screen.reference !== undefined) {
    failAt(
      where,
      `${label}reference is a formula screen's reveal — a workbook screen reveals the first answer it accepts`,
    );
  }

  const { sheet } = screen;
  if (!sheet || typeof sheet !== "object" || Array.isArray(sheet)) {
    failAt(where, `${label}sheet must be an object with a name, a startCell and rows`);
  }
  // Excel's own limit: a longer name is a file Excel offers to repair.
  requireText(sheet.name, `${label}sheet.name`, where, { max: 31 });
  const start = requireCell(sheet.startCell, `${label}sheet.startCell`, where);

  if (!Array.isArray(sheet.rows) || sheet.rows.length === 0) {
    failAt(where, `${label}sheet.rows must be a non-empty array`);
  }
  const width = Array.isArray(sheet.rows[0]) ? sheet.rows[0].length : 0;
  if (width === 0) failAt(where, `${label}sheet.rows[0] must be a non-empty array`);
  sheet.rows.forEach((row, rowIndex) => {
    if (!Array.isArray(row)) failAt(where, `${label}sheet.rows[${rowIndex}] must be an array`);
    if (row.length !== width) {
      failAt(where, `${label}sheet.rows[${rowIndex}] has ${row.length} cells, expected ${width}`);
    }
    row.forEach((cell, colIndex) => {
      if (cell === null) return;
      if (typeof cell === "number") {
        if (!Number.isFinite(cell)) failAt(where, `${label}sheet.rows[${rowIndex}][${colIndex}] is not a finite number`);
        return;
      }
      if (typeof cell !== "string") {
        failAt(
          where,
          `${label}sheet.rows[${rowIndex}][${colIndex}] must be text, a number or null for a blank cell`,
        );
      }
    });
  });
  // Nothing else checks that the sheet stays inside the columns a spreadsheet has; a cell written
  // past the last column would be addressed XFD+1 and the file would not open.
  const lastCol = start.colIndex + width - 1;
  if (lastCol > 16383) {
    failAt(where, `${label}sheet.rows holds ${width} columns from ${sheet.startCell} — a sheet stops at XFD`);
  }

  if (!Array.isArray(screen.answers) || screen.answers.length === 0) {
    failAt(where, `${label}answers must be a non-empty array`);
  }
  checkAnswers(screen.answers, label, where);

  checkAnswerHints(screen, label, where, "workbook screen");
}

/**
 * A screen graded by a list rather than by rules — a picture's accepted answers, a chord's accepted
 * key combinations — is right or wrong. "value" is the only failure it can report, so a hint filed
 * under any other rule id would never be shown.
 */
function checkAnswerHints(screen, label, where, kind) {
  if (screen.hints === undefined) return;
  if (!isPlainObject(screen.hints)) failAt(where, `${label}hints must be an object`);
  for (const key of Object.keys(screen.hints)) {
    if (key !== "value") {
      failAt(where, `${label}hints.${key} is not a failure a ${kind} reports — use hints.value`);
    }
  }
  requireText(screen.hints.value, `${label}hints.value`, where, { max: 300 });
}

/**
 * The list of accepted presses for one screen: a chord's `keys`, a sequence's `steps`. Each entry is
 * parsed here, so a shortcut this player could never match is a build failure naming the string
 * instead of a screen whose answer nobody can type.
 */
function checkPressList(list, label, where, { parse, uniq, kind }) {
  if (!Array.isArray(list) || list.length === 0) failAt(where, `${label} must be a non-empty array`);
  const seen = new Map();
  return list.map((entry, index) => {
    const text = requireText(entry, `${label}[${index}]`, where, { max: 60 });
    let press;
    try {
      press = parse(text);
    } catch (error) {
      failAt(where, `${label}[${index}] ${error.message}`);
    }
    const key = [press.solo ? "press" : "chord", ...press.mods, press.key].join("+");
    const previous = seen.get(key);
    if (previous !== undefined) {
      failAt(where, `${label}[${index}] repeats ${label}[${previous}] — one of them is dead`);
    }
    seen.set(key, index);
    return text;
  });
}

/**
 * A chord screen: one shortcut, asked for in words and answered on the keyboard. There is no grid
 * and no rules — `keys` is the whole grade, the first entry is the answer the reveal shows, and any
 * other entry is another spelling of the same shortcut.
 */
function validateChordScreen(screen, label, where) {
  for (const field of FORMULA_FIELDS) {
    if (screen[field] !== undefined) {
      failAt(where, `${label}${field} belongs to a formula screen — a chord screen is graded by its keys alone`);
    }
  }
  for (const field of ["image", "alt", "answers"]) {
    if (screen[field] !== undefined) {
      failAt(where, `${label}${field} belongs to a picture screen — a chord screen asks for a shortcut`);
    }
  }
  if (screen.steps !== undefined) failAt(where, `${label}steps belongs to a sequence screen — a chord screen asks for one press`);
  if (screen.reference !== undefined) {
    failAt(where, `${label}reference is a formula screen's reveal — a chord screen reveals its first key combination`);
  }
  checkPressList(screen.keys, `${label}keys`, where, { parse: parseChord });
  checkAnswerHints(screen, label, where, "chord screen");
}

/**
 * A sequence screen: the presses in order, which is how Excel's own shortcuts work — `Alt`, `H`, `O`
 * opens the ribbon's number format. A step may be a modifier on its own, so it is parsed as a press
 * rather than as a chord.
 */
function validateSequenceScreen(screen, label, where) {
  for (const field of FORMULA_FIELDS) {
    if (screen[field] !== undefined) {
      failAt(where, `${label}${field} belongs to a formula screen — a sequence screen is graded by its steps alone`);
    }
  }
  for (const field of ["image", "alt", "answers"]) {
    if (screen[field] !== undefined) {
      failAt(where, `${label}${field} belongs to a picture screen — a sequence screen asks for key presses`);
    }
  }
  if (screen.keys !== undefined) failAt(where, `${label}keys belongs to a chord screen — a sequence screen lists its steps`);
  if (screen.reference !== undefined) {
    failAt(where, `${label}reference is a formula screen's reveal — a sequence screen reveals its presses`);
  }
  checkPressList(screen.steps, `${label}steps`, where, { parse: parsePress });
  checkAnswerHints(screen, label, where, "sequence screen");
}

/** The drill the site has always had: a grid, a target cell, rules, and formulas to grade. */
function validateFormulaScreen(screen, label, where) {
  for (const field of PICTURE_FIELDS) {
    if (screen[field] !== undefined) {
      failAt(where, `${label}${field} belongs to a picture screen — a formula screen is graded by its grid`);
    }
  }
  for (const field of KEY_FIELDS) {
    if (screen[field] !== undefined) {
      failAt(where, `${label}${field} belongs to a chord or sequence screen — a formula screen is graded by its grid`);
    }
  }

  // A multi-screen lesson teaches a different formula on each screen, so the screen may carry its own
  // reference. Single-screen lessons leave it off and the lesson-level `docs.reference` is the answer.
  if (screen.reference !== undefined) {
    const reference = requireText(screen.reference, `${label}reference`, where, { max: 200 });
    if (!reference.startsWith("=")) failAt(where, `${label}reference must be a formula starting with =`);
  }

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

  // The authoring gate wants 6 + 6; the loader only needs to know that a fixture is a formula. A
  // rejection may also be written `{ formula, rule, why }` — the gate reads `rule` to catch a fixture
  // filed under a rule the grader disagrees with, and the two shapes are otherwise one list.
  if (screen.fixtures !== undefined) {
    if (!isPlainObject(screen.fixtures)) failAt(where, `${label}fixtures must be an object`);
    for (const field of ["accept", "reject"]) {
      const list = screen.fixtures[field];
      if (!Array.isArray(list)) failAt(where, `${label}fixtures.${field} must be an array`);
      list.forEach((entry, index) => {
        const fixture = isPlainObject(entry) ? entry.formula : entry;
        requireText(fixture, `${label}fixtures.${field}[${index}]`, where, { max: 200 });
      });
    }
  }
}

/**
 * What `docs.reference` has to be, decided from the screens before they are validated so the two
 * problems are reported in the order an author fixes them. A malformed `screens` array, a type this
 * loop does not know, and the v1 flat drill all keep the stricter formula rule: a broken file should
 * hear about the formula rather than the friendlier shortcut rule, and an unknown type should hear
 * about itself instead of about its docs.
 */
function referenceKind(raw, version) {
  if (version === 1 || !Array.isArray(raw.screens)) return "formula";
  // An unknown type is read as a formula screen: its own error is the one to report.
  const types = raw.screens.map((screen) => (SCREEN_TYPES.includes(screen?.type) ? screen.type : "formula"));
  if (types.includes("formula")) return "formula";
  // A shortcut lesson works no formula either, but its reference is the shortcut the player prints.
  if (types.some((type) => type === "chord" || type === "sequence")) return "shortcut";
  return "unconstrained";
}

/**
 * The docs block. Its "worked example" is the formula a lesson works, so `docs.reference` is one on
 * any lesson with a formula screen. A shortcuts lesson has no formula to work — its reference is the
 * shortcut itself — and a lesson of pictures or workbooks alone works nothing, so its reference is
 * unconstrained: demanding a formula on any of them would be a fiction the page never renders.
 */
function validateDocs(docs, where, { reference }) {
  if (!docs || typeof docs !== "object") failAt(where, "docs is required");
  requireText(docs.syntax, "docs.syntax", where, { max: 120 });
  requireText(docs.explain, "docs.explain", where);
  requireText(docs.atWork, "docs.atWork", where);
  requireText(docs.outcome, "docs.outcome", where, { max: 120 });
  requireText(docs.teaches, "docs.teaches", where, { max: 80 });
  requireText(docs.reference, "docs.reference", where, { max: 120 });
  requireText(docs.dataset, "docs.dataset", where, { max: 60 });
  if (reference === "formula") {
    if (!docs.reference.startsWith("=")) failAt(where, "docs.reference must be a formula starting with =");
  } else if (reference === "shortcut") {
    try {
      parsePress(docs.reference);
    } catch (error) {
      failAt(where, `docs.reference ${error.message} — this lesson has no formula screen, so it names a shortcut`);
    }
  }
  if (!Array.isArray(docs.errors) || docs.errors.length === 0) failAt(where, "docs.errors must be a non-empty array");
  docs.errors.forEach((entry, index) => {
    if (!entry || typeof entry !== "object") failAt(where, `docs.errors[${index}] must be an object`);
    requireText(entry.code, `docs.errors[${index}].code`, where, { max: 40 });
    requireText(entry.text, `docs.errors[${index}].text`, where);
  });
}

/** The fields a screen owns, in the order a payload or a diff reads best. */
function pickScreen(screen, id, type) {
  const common = {
    id,
    type,
    prompt: screen.prompt.trim(),
    hints: screen.hints ?? {},
  };

  if (type === "picture" || type === "workbook") {
    const answers = screen.answers.map((answer) => answer.trim());
    const shared = {
      answers,
      // Every solved message and the reveal read `expect.value`, so the first accepted answer is
      // published there: one field means one shape for the player, whatever the screen type.
      expect: { value: answers[0] },
    };
    // A workbook screen also carries the sheet it ships, because the file the build writes and the
    // preview the page renders are both made from these rows.
    return type === "picture"
      ? { ...common, image: screen.image.trim(), alt: screen.alt.trim(), ...shared }
      : { ...common, sheet: screen.sheet, ...shared };
  }

  if (type === "chord" || type === "sequence") {
    const list = (type === "chord" ? screen.keys : screen.steps).map((entry) => entry.trim());
    const parse = type === "chord" ? parseChord : parsePress;
    // The reveal is one string on every screen type, so it is written here, once, and the client
    // re-renders it for the keyboard in front of the learner.
    const spoken = list.map((entry) => chordText(parse(entry))).join(type === "chord" ? " or " : " then ");
    return { ...common, [type === "chord" ? "keys" : "steps"]: list, expect: { value: spoken } };
  }

  return {
    ...common,
    reference: screen.reference,
    grid: screen.grid,
    answerCell: screen.answerCell,
    expect: screen.expect,
    require: screen.require,
    forbid: screen.forbid ?? [],
    requireRef: screen.requireRef,
    rules: screen.rules ?? [],
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
  validateDocs(raw.docs, where, { reference: referenceKind(raw, version) });

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
      validateScreen(screen, label, where, 2);
      return pickScreen(screen, screenId, screen.type);
    });
    // The reveal has to show *this* screen's answer; with one screen the lesson reference is that
    // answer, so only a multi-screen lesson has to repeat itself per screen.
    if (screens.length > 1) {
      screens.forEach((screen, index) => {
        // A list-graded screen's reveal is the answer it accepts, so it carries no reference to lose.
        if (screen.type !== "formula") return;
        if (screen.reference === undefined) {
          failExercise(
            file,
            `screens[${index}].reference is required once a lesson has more than one screen — the reveal would otherwise show the wrong formula`,
          );
        }
      });
    }
  }

  return { id, slug, level: raw.level, title: raw.title.trim(), docs: raw.docs, schemaVersion: version, screens };
}

/** The screen a single-screen surface renders. Phase 2's player passes an index. */
export function screenAt(lesson, index = 0) {
  return lesson.screens[index] ?? null;
}

/**
 * The formula the reveal shows for a screen. A lesson that teaches several formulas writes one per
 * screen; a single-screen lesson keeps its answer in `docs.reference`, where it has always lived.
 */
export function referenceOf(lesson, screen) {
  return screen?.reference ?? lesson.docs.reference;
}

/**
 * What the reveal shows for a screen: a formula screen's formula, a picture screen's accepted
 * answer. The player prints this one string, so a reveal never asks which type it is looking at.
 */
export function revealOf(lesson, screen) {
  if (!screen) return lesson.docs.reference;
  // A formula screen reveals its formula; every list-graded screen — picture, chord, sequence —
  // reveals the first answer it accepts, which `pickScreen` already folded into `expect.value`.
  return screen.type === "formula" ? referenceOf(lesson, screen) : screen.expect.value;
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
