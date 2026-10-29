#!/usr/bin/env node
/**
 * `content-lint check` — the gate CI runs. `content-lint fixtures --lesson 6` — the table an author
 * reads while writing them. `content-lint new --lesson 11 --group lookup` — a passing skeleton in
 * the next free slot. `content-lint preview --lesson 11` — the drill as its page will read.
 */

import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { LEVELS, loadContent, screenAt } from "../content/index.js";
import { addressOf, indexToCol, parseRef } from "../grader/index.js";
import { MIN_FIXTURES, lintContent, replayFixtures } from "./index.js";
import { scaffoldLesson } from "./scaffold.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DEFAULT_CONTENT = join(ROOT, "legacy", "content");
const DEFAULT_FIXTURES = join(ROOT, "tests", "fixtures");

function parseArgs(argv) {
  const [command = "check", ...rest] = argv;
  const options = { command, content: DEFAULT_CONTENT, fixtures: DEFAULT_FIXTURES, lesson: null, group: null };
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === "--content") options.content = rest[++index];
    else if (arg === "--fixtures") options.fixtures = rest[++index];
    else if (arg === "--lesson") options.lesson = rest[++index];
    else if (arg === "--group") options.group = rest[++index];
    else throw new Error(`unknown argument "${arg}" — try check, fixtures, new or preview`);
  }
  return options;
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
  const free = number <= content.track.freeLessonCount;

  console.log(`\n${number}. ${lesson.title} — /learn/excel/${lesson.slug}`);
  console.log(`   ${LEVELS[lesson.level]} · ${group ? group.title : "no group"} · ${free ? "free" : "trial"}\n`);
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
    return report.ok ? 0 : 1;
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

  console.error(`unknown command "${options.command}" — use check, fixtures, new or preview`);
  return 2;
}

process.exitCode = main(process.argv.slice(2));
