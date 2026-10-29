#!/usr/bin/env node
/**
 * `npm run catalog:reference` — what the reference site covers, next to what our catalog covers.
 *
 * Research only, and deliberately not part of `npm run check`: `reference/` is gitignored, so CI has
 * nothing to read. The titles printed here are the reference's; the script never copies its prose.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REFERENCE = join(ROOT, "reference", "excelexercises-mirror", "levelInfo.js");
const CATALOG = join(ROOT, "legacy", "content", "track.json");

/**
 * Reference category → the group that replaces it. `[]` means we deliberately do not cover it:
 * keyboard shortcuts and click-paths cannot be graded by a formula engine, and the dashboard project
 * is a workbook walkthrough rather than a drill.
 */
const MAP = {
  "Intro Lessons": ["intro"],
  "SUM Functions": ["sum"],
  "COUNT Functions": ["count"],
  "Statistical Functions": ["statistical"],
  "Logical Functions": ["logical"],
  "Lookup Functions": ["lookup"],
  "Index Match Lookup": ["index-match"],
  "Text Search Functions": ["text-search"],
  "Text Manipulation Functions": ["text-change"],
  "Date Functions": ["date"],
  "Array Formulas": ["arrays"],
  "Combined Skills": ["modeling", "capstone"],
  "Other Excel Skills": ["rounding", "errors", "aggregate"],
  "Intro to Shortcuts": [],
  "Cell Selection Shortcuts": [],
  Tables: [],
  "Wine Dashboard Project": [],
};

/** Reads the array literal without evaluating the file: one row per line, strings only. */
function readReference(source) {
  const start = source.indexOf("let lessonArray = [");
  if (start < 0) throw new Error("levelInfo.js has no lessonArray — the mirror is not the shape this script knows");
  const block = source.slice(start, source.indexOf("\n]", start) + 2);
  const lessons = [];
  let holes = 0;
  let unread = 0;
  for (const line of block.split("\n")) {
    if (!/^\s*\[/.test(line)) continue;
    const strings = [...line.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((match) => match[1]);
    if (strings.length >= 3) lessons.push({ title: strings[0], category: strings[2] });
    // A hole is written `[], //4`: an empty row that still carries the comma. Anything else is a row
    // this reader does not understand, and dropping it silently would shrink the inventory that
    // decides coverage — so it is counted and reported instead.
    else if (/^\s*\[\s*\]\s*,?/.test(line)) holes += 1;
    else unread += 1;
  }
  if (unread > 0) {
    throw new Error(`levelInfo.js: ${unread} row(s) are neither a lesson nor an empty slot — the mirror changed shape`);
  }
  if (lessons.length === 0) throw new Error("levelInfo.js: no lessons parsed — the mirror changed shape");
  return { lessons, holes };
}

function tally(items, key) {
  const counts = new Map();
  for (const item of items) counts.set(item[key], (counts.get(item[key]) ?? 0) + 1);
  return counts;
}

function main() {
  if (!existsSync(REFERENCE)) {
    console.log("reference/excelexercises-mirror/levelInfo.js is not here — nothing to compare.");
    console.log("It is a local research mirror and deliberately untracked, so this is not a failure.");
    return;
  }
  const catalog = JSON.parse(readFileSync(CATALOG, "utf8"));
  const { lessons, holes } = readReference(readFileSync(REFERENCE, "utf8"));
  const reference = tally(lessons, "category");
  const ours = tally(catalog.lessons, "group");
  const oursPublished = tally(catalog.lessons.filter((entry) => entry.id), "group");

  console.log(`reference: ${lessons.length} lessons in ${reference.size} categories, ${holes} empty slots`);
  console.log(`catalog:   ${catalog.lessons.length} slots in ${catalog.groups.length} groups, ${catalog.lessons.filter((e) => e.id).length} published\n`);

  const width = Math.max(...[...reference.keys()].map((name) => name.length));
  for (const [category, count] of reference) {
    const groups = MAP[category];
    const label = groups === undefined ? "UNMAPPED" : groups.length === 0 ? "(not covered)" : groups.join("+");
    const total = groups?.reduce((sum, group) => sum + (ours.get(group) ?? 0), 0) ?? 0;
    const live = groups?.reduce((sum, group) => sum + (oursPublished.get(group) ?? 0), 0) ?? 0;
    console.log(`  ${category.padEnd(width)}  ref ${String(count).padStart(2)}  →  ${label.padEnd(20)} ours ${String(total).padStart(2)} (${live} published)`);
  }

  const unmapped = [...reference.keys()].filter((category) => MAP[category] === undefined);
  if (unmapped.length > 0) console.log(`\n! no mapping for: ${unmapped.join(", ")}`);
  const uncovered = catalog.groups.filter((group) => !Object.values(MAP).some((groups) => groups.includes(group.id)));
  if (uncovered.length > 0) console.log(`! our groups with no reference category: ${uncovered.map((group) => group.id).join(", ")}`);
  console.log("\nThe reference's titles and prose stay in reference/ — only its coverage is a checklist.");
}

try {
  main();
} catch (error) {
  console.error(`✖ ${error.message}`);
  process.exitCode = 1;
}
