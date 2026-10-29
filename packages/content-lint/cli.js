#!/usr/bin/env node
/**
 * `content-lint check` — the gate CI runs. `content-lint fixtures --lesson 6` — the table an author
 * reads while writing them.
 */

import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { MIN_FIXTURES, lintContent, replayFixtures } from "./index.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DEFAULT_CONTENT = join(ROOT, "legacy", "content");
const DEFAULT_FIXTURES = join(ROOT, "tests", "fixtures");

function parseArgs(argv) {
  const [command = "check", ...rest] = argv;
  const options = { command, content: DEFAULT_CONTENT, fixtures: DEFAULT_FIXTURES, lesson: null };
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === "--content") options.content = rest[++index];
    else if (arg === "--fixtures") options.fixtures = rest[++index];
    else if (arg === "--lesson") options.lesson = rest[++index];
    else throw new Error(`unknown argument "${arg}" — try check or fixtures`);
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

  console.error(`unknown command "${options.command}" — use check or fixtures`);
  return 2;
}

process.exitCode = main(process.argv.slice(2));
