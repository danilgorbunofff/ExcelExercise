#!/usr/bin/env node
/**
 * `content-lint check` — the gate CI runs. `content-lint fixtures --lesson 6` — the table an author
 * reads while writing them. `content-lint new --lesson 11 --group lookup` — a passing skeleton in
 * the next free slot. `content-lint preview --lesson 11` — the drill as its page will read.
 * `content-lint copy` — how the prose reads: banned phrases, sentence length, readability, duplicate
 * lessons. `content-lint articles` — the same, over the function notes, plus the seven-section
 * template, the 700–1,800 word band and the one to six drills each note borrows.
 * `content-lint formulas` — the same, over the problem pages: the four-section shape, the 500–1,200
 * word band, a graded drill each, and the sibling and note links the silo exists to make.
 * `content-lint shortcuts` — the same, over the six shortcut families: the one-table shape, the rows
 * that answer on every tab the page offers, and a practice drill that asks for keys.
 * `content-lint legal` — the promises `/privacy` and `/terms` make: no organisation, university,
 * cohort, referral or seat is for sale, and every section they owe a reader is there.
 * `content-lint site` — the same wording rules over the site's own copy: every page rendered through
 * its `prepare*` function, plus the React-only routes and the browser modules, which have no page to
 * read. `--write` stores the inventory a reviewer diffs; `--where` narrows the report to one module.
 * `content-lint variants` — the anti-hardcoding re-sends a screen could carry, with the answer the
 * reference formula gives on each; `--write` stores them.
 * `check --strict` runs all of them and fails on any blocking hit.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { LEVELS, MAX_VARIANTS, loadContent, screenAt } from "../content/index.js";
import {
  addressOf,
  buildCells,
  compareToExpected,
  evaluateFormula,
  expandRange,
  formatValue,
  indexToCol,
  parse,
  parseRef,
  walkAst,
} from "../grader/index.js";
import { lintArticles } from "./articles.js";
import { lintFormulas } from "./formulas.js";
import { lintShortcuts } from "./shortcuts.js";
import { lintCopy, loadRules } from "./copy.js";
import { lintLegal } from "./legal.js";
import { inventoryJson, lintSite } from "./site.js";
import { MIN_FIXTURES, lintContent, replayFixtures } from "./index.js";
import { siteConfig } from "../../legacy/src/site/config.mjs";
import { scaffoldLesson } from "./scaffold.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DEFAULT_CONTENT = join(ROOT, "legacy", "content");
const DEFAULT_FIXTURES = join(ROOT, "tests", "fixtures");

function parseArgs(argv) {
  const [command = "check", ...rest] = argv;
  const options = { command, content: DEFAULT_CONTENT, fixtures: DEFAULT_FIXTURES, lesson: null, group: null, strict: false, screen: null, write: false, where: null };
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === "--content") options.content = rest[++index];
    else if (arg === "--fixtures") options.fixtures = rest[++index];
    else if (arg === "--lesson") options.lesson = rest[++index];
    else if (arg === "--group") options.group = rest[++index];
    else if (arg === "--screen") options.screen = Number(rest[++index]);
    else if (arg === "--where") options.where = rest[++index];
    else if (arg === "--write") options.write = true;
    else if (arg === "--strict") options.strict = true;
    else throw new Error(`unknown argument "${arg}" — try check, fixtures, copy, site, articles, formulas, shortcuts, legal, variants, new or preview`);
  }
  if (options.screen !== null && (!Number.isInteger(options.screen) || options.screen < 0)) {
    throw new Error("--screen takes a screen number from 0");
  }
  return options;
}

/** The legal lint reads the same config and track the pages print, so it can never disagree with them. */
function legalReport(contentDir) {
  const { track } = loadContent(contentDir);
  return lintLegal({ config: siteConfig(process.env), track });
}

/** Matches `--lesson 6` against `06-round-markup` as well as the full id. */
function findLesson(lessons, needle) {
  const padded = needle.padStart(2, "0");
  return (
    lessons.find((lesson) => lesson.id === needle) ??
    lessons.find((lesson) => lesson.id.startsWith(`${padded}-`)) ??
    null
  );
}

function printCheck(report) {
  const { stats, errors, warnings } = report;
  console.log(
    `content: ${stats.lessons} of ${stats.lessons + stats.planned} catalogued lessons, ${stats.groups} groups, ` +
      `${stats.screens} screens, ${stats.accepted + stats.rejected} fixtures replayed`,
  );
  for (const { where, message } of warnings) console.log(`  ⚠ ${where ? `${where}: ` : ""}${message}`);
  for (const { where, message } of errors) console.log(`  ✖ ${where ? `${where}: ` : ""}${message}`);
  console.log(
    report.ok
      ? `✓ content passes — ${stats.accepted} accepted and ${stats.rejected} rejected formulas agree with the grader`
      : `✖ ${errors.length} error${errors.length === 1 ? "" : "s"} — content is not shippable`,
  );
}

/** The copy report: numbers first, then only the findings that need a decision. */
function printCopy(report, { strict, rules }) {
  const { stats, findings } = report;
  const pages = `${stats.pages} pages, ${stats.projects} projects`;
  console.log(
    `copy: ${stats.lessons} lessons, ${stats.groups} groups, ${pages} — ${stats.findings} finding${stats.findings === 1 ? "" : "s"} ` +
      `(${stats.errors} blocking), reading ease ${stats.ease.mean ?? "n/a"} (${rules.flesch.min}-${rules.flesch.max})`,
  );
  const pending = [
    stats.missingSeoTitle && `${stats.missingSeoTitle} without seo.title`,
    stats.missingSeoDescription && `${stats.missingSeoDescription} without seo.description`,
    stats.missingUpdated && `${stats.missingUpdated} without updated`,
  ].filter(Boolean);
  if (pending.length > 0) console.log(`  pending: ${pending.join(", ")}`);

  const order = Object.entries(stats.byRule).sort((a, b) => b[1] - a[1]);
  if (order.length > 0) console.log(`  by rule: ${order.map(([rule, count]) => `${rule} ${count}`).join(", ")}`);

  const shown = findings.filter((finding) => (strict ? finding.severity === "error" : true));
  const limit = strict ? shown.length : 40;
  for (const finding of shown.slice(0, limit)) {
    console.log(`  ${finding.severity === "error" ? "✖" : "⚠"} ${finding.where} ${finding.field}: ${finding.message}`);
    if (finding.excerpt) console.log(`      ${finding.excerpt}`);
  }
  if (shown.length > limit) console.log(`  ... ${shown.length - limit} more; run with --lesson to narrow`);

  const worst = report.lessons
    .filter((lesson) => lesson.ease !== null)
    .sort((a, b) => a.ease - b.ease)
    .slice(0, 5);
  if (worst.length > 0) console.log(`  hardest to read: ${worst.map((lesson) => `${lesson.id} ${lesson.ease}`).join(", ")}`);

  const blocking = findings.filter((finding) => finding.severity === "error").length;
  console.log(
    blocking === 0
      ? "✓ copy passes — no banned phrase, no decorative punctuation, no repeated lesson"
      : `${strict ? "✖" : "⚠"} ${blocking} blocking finding${blocking === 1 ? "" : "s"} — prose is not shippable yet`,
  );
  return blocking === 0 || !strict ? 0 : 1;
}

/** The legal report: the promises, then the findings a reader could be misled by. */
function printLegal(report, { strict }) {
  const { stats, findings } = report;
  console.log(
    `legal: ${stats.documents} documents, ${stats.sections} sections, ${stats.retention} retention rows — ` +
      `${stats.errors} blocking`,
  );
  const shown = findings.filter((finding) => (strict ? finding.severity === "error" : true));
  for (const finding of shown) {
    console.log(`  ${finding.severity === "error" ? "✖" : "⚠"} ${finding.where} ${finding.field}: ${finding.message}`);
  }
  console.log(
    stats.errors === 0
      ? "✓ legal passes — nothing is sold that this site does not sell, and every owed section is there"
      : `✖ ${stats.errors} blocking finding${stats.errors === 1 ? "" : "s"} — the privacy and terms pages are not shippable`,
  );
  return stats.errors === 0 || !strict ? 0 : 1;
}

/** The notes report: the count, the numbers, then the findings that need a decision. */
function printArticles(report, { strict }) {
  const { stats, findings } = report;
  console.log(
    `articles: ${stats.articles} notes, ${stats.meanWords} words on average — ${stats.findings} finding${stats.findings === 1 ? "" : "s"} ` +
      `(${stats.errors} blocking)`,
  );
  const order = Object.entries(stats.byRule).sort((a, b) => b[1] - a[1]);
  if (order.length > 0) console.log(`  by rule: ${order.map(([rule, count]) => `${rule} ${count}`).join(", ")}`);

  const shown = strict ? findings.filter((finding) => finding.severity === "error") : findings;
  for (const finding of shown) {
    console.log(`  ${finding.severity === "error" ? "✖" : "⚠"} ${finding.where} ${finding.field}: ${finding.message}`);
    if (finding.excerpt) console.log(`      ${finding.excerpt}`);
  }
  if (!strict && stats.errors > 0) {
    console.log(`  ${stats.errors} of these block the build; run with --strict to see only those`);
  }
  const blocking = findings.filter((finding) => finding.severity === "error").length;
  console.log(
    blocking === 0
      ? "✓ notes pass — every one parses, drills something that exists, and reads like a person wrote it"
      : `${strict ? "✖" : "⚠"} ${blocking} blocking finding${blocking === 1 ? "" : "s"} — notes are not shippable yet`,
  );
  return blocking === 0 || !strict ? 0 : 1;
}

/** The problem-page report: the count, the numbers, then the findings that need a decision. */
function printFormulas(report, { strict }) {
  const { stats, findings } = report;
  console.log(
    `formulas: ${stats.formulas} problem pages, ${stats.meanWords} words on average — ${stats.findings} finding${stats.findings === 1 ? "" : "s"} ` +
      `(${stats.errors} blocking)`,
  );
  const order = Object.entries(stats.byRule).sort((a, b) => b[1] - a[1]);
  if (order.length > 0) console.log(`  by rule: ${order.map(([rule, count]) => `${rule} ${count}`).join(", ")}`);

  const shown = strict ? findings.filter((finding) => finding.severity === "error") : findings;
  for (const finding of shown) {
    console.log(`  ${finding.severity === "error" ? "✖" : "⚠"} ${finding.where} ${finding.field}: ${finding.message}`);
    if (finding.excerpt) console.log(`      ${finding.excerpt}`);
  }
  if (!strict && stats.errors > 0) {
    console.log(`  ${stats.errors} of these block the build; run with --strict to see only those`);
  }
  const blocking = findings.filter((finding) => finding.severity === "error").length;
  console.log(
    blocking === 0
      ? "✓ problem pages pass — every one parses, drills something that exists, and links where it should"
      : `${strict ? "✖" : "⚠"} ${blocking} blocking finding${blocking === 1 ? "" : "s"} — problem pages are not shippable yet`,
  );
  return blocking === 0 || !strict ? 0 : 1;
}

/** The shortcut-page report: the rows on offer, the numbers, then the findings that need a decision. */
function printShortcuts(report, { strict }) {
  const { stats, findings } = report;
  console.log(
    `shortcuts: ${stats.shortcuts} families, ${stats.rows} rows — ${stats.findings} finding${stats.findings === 1 ? "" : "s"} ` +
      `(${stats.errors} blocking)`,
  );
  const order = Object.entries(stats.byRule).sort((a, b) => b[1] - a[1]);
  if (order.length > 0) console.log(`  by rule: ${order.map(([rule, count]) => `${rule} ${count}`).join(", ")}`);

  const shown = strict ? findings.filter((finding) => finding.severity === "error") : findings;
  for (const finding of shown) {
    console.log(`  ${finding.severity === "error" ? "✖" : "⚠"} ${finding.where} ${finding.field}: ${finding.message}`);
    if (finding.excerpt) console.log(`      ${finding.excerpt}`);
  }
  if (!strict && stats.errors > 0) {
    console.log(`  ${stats.errors} of these block the build; run with --strict to see only those`);
  }
  const blocking = findings.filter((finding) => finding.severity === "error").length;
  console.log(
    blocking === 0
      ? "✓ shortcut pages pass — every family parses, answers on every tab it offers, and ends on a drill"
      : `${strict ? "✖" : "⚠"} ${blocking} blocking finding${blocking === 1 ? "" : "s"} — shortcut pages are not shippable yet`,
  );
  return blocking === 0 || !strict ? 0 : 1;
}

function printFixtures(lesson, screens) {
  for (const [index, { rows }] of screens.entries()) {
    const label = screens.length > 1 ? `screen ${index} (${lesson.screens[index].id})` : lesson.id;
    console.log(`\n${label} — ${lesson.title}`);
    if (rows.length === 0) {
      console.log("  (no fixtures)");
      continue;
    }
    const width = Math.min(48, Math.max(...rows.map((row) => row.formula.length)));
    for (const { formula, expected, declared, result } of rows) {
      // `·` marks a rejection that behaves as declared: a `✓` next to a bad formula reads like praise.
      const mark = expected === "accept" ? (result.ok ? "✓" : "✖") : result.ok ? "✖" : "·";
      const note =
        expected === "accept"
          ? result.ok
            ? "accepted"
            : `accepted by content, rejected (${result.rule})`
          : result.ok
            ? "rejected by content, accepted by grader"
            : `rejected (${result.rule})${declared && declared !== result.rule ? `, filed as ${declared}` : ""}`;
      console.log(`  ${mark} ${formula.padEnd(width)}  ${note}`);
    }
    console.log(`  ${rows.length} fixtures — the floor is ${MIN_FIXTURES} accepted + ${MIN_FIXTURES} rejected`);
  }
}

function printScaffold(info) {
  console.log(`✓ created ${info.path} — "${info.title}" (${info.group}, ${LEVELS[info.level]})`);
  console.log(
    `  takes catalog slot ${info.slot}, published as lesson ${info.published} of ${info.publishedTotal}`,
  );
  if (info.published !== info.publishedTotal) {
    console.log(
      `  the ${info.publishedTotal - info.published} lesson(s) after it move up one in the published order — their URLs do not change`,
    );
  }
  console.log(`  the prompt and docs.explain still say "replace this scaffold" — the grid, the fixtures and the grading already work`);
  console.log(`  next: npm run content:preview -- --lesson ${info.number}`);
}

function cellText(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  return String(value);
}

function wrap(text, width) {
  const lines = [];
  let line = "";
  for (const word of String(text).split(/\s+/)) {
    if (line === "") line = word;
    else if (line.length + 1 + word.length <= width) line += ` ${word}`;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line !== "") lines.push(line);
  return lines.length > 0 ? lines : [""];
}

function printField(name, text) {
  const lines = wrap(text, 92);
  console.log(`   ${name.padEnd(11)} ${lines[0]}`);
  for (const line of lines.slice(1)) console.log(`   ${" ".repeat(11)} ${line}`);
}

/** The lesson as the page will read it: everything a reader sees, nothing the client draws later. */
function printPreview(content, lesson, number, fixturesDir) {
  const screen = screenAt(lesson);
  const slot = content.track.lessons.find((entry) => entry.id === lesson.id);
  const group = content.track.groups.find((entry) => entry.id === slot?.group);
  const free = content.track.freeLessons.includes(lesson.id);

  console.log(`\n${number}. ${lesson.title} — /learn/excel/${lesson.slug}`);
  console.log(`   ${LEVELS[lesson.level]} · ${group ? group.title : "no group"} · ${free ? "free" : "paid"}\n`);
  for (const line of wrap(screen.prompt, 92)) console.log(`   ${line}`);
  console.log("");

  const start = parseRef(screen.grid.startCell);
  const width = screen.grid.rows[0].length;
  const letters = Array.from({ length: width }, (_, offset) => indexToCol(start.colIndex + offset));
  const cells = screen.grid.rows.map((row, rowOffset) =>
    row.map((value, colOffset) =>
      addressOf(start.colIndex + colOffset, start.row + rowOffset) === screen.answerCell
        ? "[answer]"
        : cellText(value),
    ),
  );
  const colWidth = letters.map((letter, col) => Math.max(letter.length, ...cells.map((row) => row[col].length)));
  const rowWidth = String(start.row + cells.length - 1).length;
  console.log(`   ${" ".repeat(rowWidth + 1)}${letters.map((letter, col) => letter.padEnd(colWidth[col] + 2)).join("").trimEnd()}`);
  cells.forEach((row, offset) => {
    console.log(
      `   ${String(start.row + offset).padStart(rowWidth)} ${row.map((text, col) => text.padEnd(colWidth[col] + 2)).join("").trimEnd()}`,
    );
  });
  const lastCol = indexToCol(start.colIndex + width - 1);
  console.log(`\n   answer ${screen.answerCell} · grid ${screen.grid.startCell}:${lastCol}${start.row + cells.length - 1}`);

  console.log("\n   Docs");
  printField("syntax", lesson.docs.syntax);
  printField("teaches", lesson.docs.teaches);
  printField("dataset", lesson.docs.dataset);
  printField("outcome", lesson.docs.outcome);
  printField("reference", lesson.docs.reference);
  printField("explain", lesson.docs.explain);
  printField("at work", lesson.docs.atWork);
  for (const { code, text } of lesson.docs.errors) printField(code, text);

  const hints = Object.entries(screen.hints ?? {});
  if (hints.length > 0) {
    console.log("\n   Hints");
    for (const [rule, text] of hints) printField(rule, text);
  }

  printFixtures(lesson, replayFixtures(lesson, { fixturesDir }));
}

/** Twelve significant digits: enough that a derived answer reads like the one in `expect.value`. */
function tidy(value) {
  return typeof value === "number" && Number.isFinite(value) ? Number(value.toPrecision(12)) : value;
}

/** The input cells the reference formula reads, in reading order — the ones an edit can move. */
function referencedInputs(reference, screen, cells) {
  const found = new Map();
  const add = (address) => {
    if (!address || address === screen.answerCell || found.has(address)) return;
    const ref = parseRef(address);
    if (!ref) return;
    const value = cells[address] ?? null;
    if (typeof value === "number" && Number.isFinite(value)) {
      found.set(address, { address, value, row: ref.row, colIndex: ref.colIndex, kind: "number" });
    } else if (typeof value === "string" && value.trim() !== "") {
      found.set(address, { address, value, row: ref.row, colIndex: ref.colIndex, kind: "string" });
    }
  };
  walkAst(parse(reference), (node) => {
    if (node.type === "ref") add(node.key);
    else if (node.type === "range") {
      for (const row of expandRange(node.from.key, node.to.key, (key) => cells[key] ?? null).addresses) {
        for (const address of row) add(address);
      }
    }
  });
  return [...found.values()].sort((a, b) => a.row - b.row || a.colIndex - b.colIndex);
}

/** The edits worth trying on one input: numbers move, labels swap for another label in their column. */
function editsFor(input, cells, { topRow, headerRow }) {
  if (input.kind === "number") {
    const up = tidy(input.value + (Math.abs(input.value) >= 100 ? 100 : 1));
    return [
      { id: "up", to: up, say: `goes from ${formatValue(input.value)} to ${formatValue(up)}` },
      { id: "double", to: tidy(input.value * 2), say: `doubles from ${formatValue(input.value)}` },
    ];
  }
  const sibling = Object.entries(cells)
    .map(([address, value]) => ({ address, value, ref: parseRef(address) }))
    .filter((entry) => entry.ref && entry.ref.colIndex === input.colIndex)
    .filter((entry) => typeof entry.value === "string" && entry.value.trim() !== "" && entry.value !== input.value)
    // A header is not a value the table repeats, so swapping a label for one proves nothing.
    .filter((entry) => !(headerRow && entry.ref.row === topRow))
    .sort((a, b) => a.ref.row - b.ref.row)[0];
  if (!sibling) return [];
  return [{ id: "swap", to: sibling.value, say: `becomes "${sibling.value}"` }];
}

/**
 * Up to MAX_VARIANTS edits that each move the answer. Round-robin, because one edit per input is
 * what exposes a formula that hardcodes a value only a different cell would disturb.
 */
function deriveVariants(screen, reference) {
  const cells = buildCells(screen);
  const topRow = parseRef(screen.grid.startCell).row;
  const headerRow = screen.grid.rows.length > 1;
  const tolerance = screen.expect.tolerance ?? 1e-9;
  // Same clock the linter and the page use, or a TODAY() answer drifts from the one `check` computes.
  const clock = { today: screen.today };
  const inputs = referencedInputs(reference, screen, cells).map((input) => ({
    ...input,
    edits: editsFor(input, cells, { topRow, headerRow }),
  }));
  const depth = Math.max(0, ...inputs.map((input) => input.edits.length));

  const attempts = [];
  for (let round = 0; round < depth; round += 1) {
    for (const input of inputs) {
      const edit = input.edits[round];
      if (edit && edit.to !== input.value) attempts.push({ input, edit });
    }
  }

  // Every formula the corpus already accepts is ground truth: a re-send may not change its meaning.
  const accepted = (screen.fixtures?.accept ?? [])
    .map((entry) => (typeof entry === "string" ? entry : entry?.formula))
    .filter(Boolean);

  const variants = [];
  for (const { input, edit } of attempts) {
    if (variants.length >= MAX_VARIANTS) break;
    // One re-send per input: a second edit to the same cell repeats what the first already proves.
    if (variants.some((variant) => Object.hasOwn(variant.cells, input.address))) continue;
    const edited = { ...cells, [input.address]: edit.to };
    let produced;
    try {
      produced = evaluateFormula(reference, edited, clock);
    } catch {
      continue; // An edit the reference cannot survive teaches nothing; the lint refuses those by hand.
    }
    if (compareToExpected(produced, screen.expect.value, tolerance)) continue; // Inert: same answer.
    // A blank or text answer cannot be stored: `variants[].expect.value` is a number, text or boolean.
    const storable =
      (typeof produced === "number" && Number.isFinite(produced)) ||
      (typeof produced === "string" && produced.trim() !== "") ||
      typeof produced === "boolean";
    if (!storable) continue;
    // A reference that rounds differently from the accepted formulas, or spells a fallback another
    // way, would make this re-send reject a formula the corpus already ships as correct.
    const agrees = accepted.every((formula) => {
      try {
        return compareToExpected(evaluateFormula(formula, edited, clock), produced, tolerance);
      } catch {
        return false;
      }
    });
    if (!agrees) continue;
    variants.push({
      id: `${input.address.toLowerCase().replace(/\$/g, "")}-${edit.id}`,
      cells: { [input.address]: edit.to },
      expect: { value: tidy(produced) },
      why: `${input.address} ${edit.say}, so the answer has to move with it`,
    });
  }
  return variants;
}

/** The site report: the surfaces it read, then the findings that need a decision. */
function printSite(report, { strict, rules, where = null }) {
  const findings = where ? report.findings.filter((finding) => finding.where.includes(where)) : report.findings;
  const { stats } = report;
  const blocking = findings.filter((finding) => finding.severity === "error").length;
  console.log(
    `site: ${stats.pages} rendered pages, ${stats.modules} source modules — ${findings.length} finding${findings.length === 1 ? "" : "s"} ` +
      `(${blocking} blocking) over ${stats.words} words`,
  );
  if (where) console.log(`  narrowed to "${where}"`);

  const order = Object.entries(
    findings.reduce((counts, finding) => ({ ...counts, [finding.rule]: (counts[finding.rule] ?? 0) + 1 }), {}),
  ).sort((a, b) => b[1] - a[1]);
  if (order.length > 0) console.log(`  by rule: ${order.map(([rule, count]) => `${rule} ${count}`).join(", ")}`);

  const shown = strict ? findings.filter((finding) => finding.severity === "error") : findings;
  const limit = strict ? shown.length : 60;
  for (const finding of shown.slice(0, limit)) {
    console.log(`  ${finding.severity === "error" ? "✖" : "⚠"} ${finding.where} ${finding.field}: ${finding.message}`);
    if (finding.excerpt) console.log(`      ${finding.excerpt}`);
  }
  if (shown.length > limit) {
    console.log(`  ... ${shown.length - limit} more; run with${where ? " a narrower --where" : " --where <module>"}`);
  }

  console.log(
    blocking === 0
      ? "✓ site copy passes — no banned phrase, no decorative punctuation, no sentence that needs a second read"
      : `${strict ? "✖" : "⚠"} ${blocking} blocking finding${blocking === 1 ? "" : "s"} — the site's own copy is not shippable yet`,
  );
  return blocking === 0 || !strict ? 0 : 1;
}

/** Store the derived re-sends in the lesson file, leaving every other line of structure as it was. */
function writeVariants(path, screenIndex, variants) {
  const lesson = JSON.parse(readFileSync(path, "utf8"));
  lesson.screens[screenIndex].variants = variants;
  writeFileSync(path, `${JSON.stringify(lesson, null, 2)}\n`);
}

function printVariants(lesson, screen, index, variants, { written }) {
  console.log(`\n${lesson.id} · screen ${index} · reference ${screen.reference ?? lesson.docs.reference}`);
  console.log(`   answer ${screen.answerCell} · ${formatValue(screen.expect.value)}`);
  for (const variant of variants) {
    const cells = Object.entries(variant.cells)
      .map(([address, value]) => `${address} → ${formatValue(value)}`)
      .join(", ");
    console.log(`   ${variant.id}: ${cells} → ${formatValue(variant.expect.value)}`);
  }
  console.log(`   ${written ? "written" : "dry run"} — still by hand: one rejection filed under "hardcoded",`);
  console.log(`   and hints.hardcoded if the general line does not fit this screen.`);
}

function main(argv) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    console.error(error.message);
    return 2;
  }

  if (options.command === "check") {
    const report = lintContent(options.content, { fixturesDir: options.fixtures });
    printCheck(report);
    if (!options.strict) return report.ok ? 0 : 1;
    // `--strict` also ships the prose: a lesson can render and still be unshippable.
    const copy = lintCopy(options.content);
    const copyOk = printCopy(copy, { strict: true, rules: loadRules() }) === 0;
    // The notes are part of the prose the site ships, so `--strict` ships them too.
    const notesOk = printArticles(lintArticles(options.content), { strict: true }) === 0;
    // The problem silo is the other half of the same prose, and it is what the search traffic lands on.
    const problemsOk = printFormulas(lintFormulas(options.content), { strict: true }) === 0;
    // `/privacy` and `/terms` are prose too, and a false promise there is worse than a clumsy sentence.
    const legalOk = printLegal(legalReport(options.content), { strict: true }) === 0;
    return report.ok && copyOk && notesOk && problemsOk && legalOk ? 0 : 1;
  }

  if (options.command === "legal") {
    let report;
    try {
      report = legalReport(options.content);
    } catch (error) {
      console.error(error.message);
      return 1;
    }
    return printLegal(report, { strict: options.strict });
  }

  if (options.command === "articles") {
    let report;
    try {
      report = lintArticles(options.content);
    } catch (error) {
      console.error(error.message);
      return 1;
    }
    return printArticles(report, { strict: options.strict });
  }

  if (options.command === "formulas") {
    let report;
    try {
      report = lintFormulas(options.content);
    } catch (error) {
      console.error(error.message);
      return 1;
    }
    return printFormulas(report, { strict: options.strict });
  }

  if (options.command === "shortcuts") {
    let report;
    try {
      report = lintShortcuts(options.content);
    } catch (error) {
      console.error(error.message);
      return 1;
    }
    return printShortcuts(report, { strict: options.strict });
  }

  if (options.command === "copy") {
    let copy;
    try {
      copy = lintCopy(options.content);
    } catch (error) {
      console.error(error.message);
      return 1;
    }
    if (options.lesson) {
      const lesson = findLesson(copy.lessons, options.lesson);
      if (!lesson) {
        console.error(`no lesson matches "${options.lesson}"`);
        return 2;
      }
      const narrowed = copy.findings.filter((finding) => finding.where.includes(`${lesson.id}.json`));
      const byRule = {};
      for (const finding of narrowed) byRule[finding.rule] = (byRule[finding.rule] ?? 0) + 1;
      return printCopy(
        {
          ...copy,
          findings: narrowed,
          stats: {
            ...copy.stats,
            lessons: 1,
            findings: narrowed.length,
            errors: narrowed.filter((finding) => finding.severity === "error").length,
            byRule,
            ease: { min: lesson.ease, max: lesson.ease, mean: lesson.ease },
          },
        },
        { strict: options.strict, rules: loadRules() },
      );
    }
    return printCopy(copy, { strict: options.strict, rules: loadRules() });
  }

  if (options.command === "site") {
    let report;
    try {
      report = lintSite({ contentDir: options.content });
    } catch (error) {
      console.error(error.message);
      return 1;
    }
    if (options.write) {
      const path = join(ROOT, "tests", "golden", "site-copy.json");
      writeFileSync(path, inventoryJson(report.inventory));
      console.log(`site: inventory written to ${path} (${report.inventory.length} strings)`);
    }
    return printSite(report, { strict: options.strict, rules: loadRules(), where: options.where });
  }

  if (options.command === "fixtures") {
    const report = lintContent(options.content, { fixturesDir: options.fixtures });
    if (!report.ok) {
      // Fixture replay is only meaningful once the content loads; otherwise print why, not a table.
      printCheck(report);
      return 1;
    }
    const lesson = options.lesson ? findLesson(report.lessons, options.lesson) : report.lessons[0];
    if (!lesson) {
      console.error(`no lesson matches "${options.lesson}"`);
      return 2;
    }
    printFixtures(lesson, replayFixtures(lesson, { fixturesDir: options.fixtures }));
    return 0;
  }

  if (options.command === "new") {
    try {
      printScaffold(scaffoldLesson({ contentDir: options.content, lesson: options.lesson, group: options.group }));
    } catch (error) {
      console.error(error.message);
      return 2;
    }
    return 0;
  }

  if (options.command === "preview") {
    let content;
    try {
      content = loadContent(options.content);
    } catch (error) {
      console.error(error.message);
      return 1;
    }
    const lesson = options.lesson ? findLesson(content.exercises, options.lesson) : content.exercises[0];
    if (!lesson) {
      console.error(`no lesson matches "${options.lesson}"`);
      return 2;
    }
    printPreview(content, lesson, content.exercises.indexOf(lesson) + 1, options.fixtures);
    return 0;
  }

  if (options.command === "variants") {
    let content;
    try {
      content = loadContent(options.content);
    } catch (error) {
      console.error(error.message);
      return 1;
    }
    const lessons = options.lesson ? [findLesson(content.exercises, options.lesson)].filter(Boolean) : content.exercises;
    if (lessons.length === 0) {
      console.error(`no lesson matches "${options.lesson}"`);
      return 2;
    }

    let proposed = 0;
    let written = 0;
    for (const lesson of lessons) {
      if (options.write && lesson.schemaVersion === 1) {
        console.error(`${lesson.id} is schemaVersion 1 — re-sends need schemaVersion 2`);
        return 1;
      }
      for (const [index, screen] of lesson.screens.entries()) {
        if (screen.type !== "formula") continue;
        if (options.screen !== null && index !== options.screen) continue;
        // A sweep leaves authored re-sends alone; naming the lesson asks to look at them anyway.
        if (screen.variants && !options.lesson) continue;
        const variants = deriveVariants(screen, screen.reference ?? lesson.docs.reference);
        if (variants.length === 0) {
          console.log(`\n${lesson.id} · screen ${index} — nothing to propose`);
          continue;
        }
        proposed += variants.length;
        if (options.write) {
          writeVariants(join(options.content, "exercises", `${lesson.id}.json`), index, variants);
          written += 1;
        }
        printVariants(lesson, screen, index, variants, { written: options.write });
      }
    }

    if (proposed === 0) {
      console.log("nothing to derive: every formula screen already answers, or no edit survives");
      return 1;
    }
    if (options.write) {
      console.log(`\n${written} screen(s) rewritten — read the why strings, then run npm run content:check`);
    }
    return 0;
  }

  console.error(`unknown command "${options.command}" — use check, fixtures, copy, articles, formulas, shortcuts, legal, variants, new or preview`);
  return 2;
}

process.exitCode = main(process.argv.slice(2));
