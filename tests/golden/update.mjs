/**
 * Regenerates tests/golden/snapshot.json.
 *
 * Run this only when a grader change is intended, and review the diff like a
 * code change: every line of it is a verdict a learner will see. The per-verdict
 * summary printed here is what to review — a regeneration that rewrites the
 * whole file for one intended verdict is reviewable only if that one stands out.
 *
 *   npm run golden:update
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";

import { SNAPSHOT_PATH, capture, serialize } from "./capture.mjs";

const SECTIONS = ["accepted", "rejected", "audit"];
const SHOWN = 10;

const index = (snapshot) => {
  const verdicts = new Map();
  for (const [lessonId, lesson] of Object.entries(snapshot.lessons ?? {})) {
    for (const section of SECTIONS) {
      for (const entry of lesson[section] ?? []) {
        verdicts.set(`${lessonId} ${section} ${entry.input}`, entry);
      }
    }
  }
  return verdicts;
};

const previous = existsSync(SNAPSHOT_PATH)
  ? index(JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8")))
  : null;

const snapshot = capture();
writeFileSync(SNAPSHOT_PATH, serialize(snapshot));

const current = index(snapshot);
console.log(
  `wrote ${SNAPSHOT_PATH} — ${Object.keys(snapshot.lessons).length} lessons, ${current.size} verdicts`,
);

if (!previous) {
  console.log("no previous snapshot to compare against");
  process.exit(0);
}

const changes = [];
for (const [key, entry] of current) {
  if (!previous.has(key)) changes.push(["+", key]);
  else if (JSON.stringify(previous.get(key)) !== JSON.stringify(entry)) changes.push(["~", key]);
}
for (const key of previous.keys()) if (!current.has(key)) changes.push(["-", key]);

if (changes.length === 0) {
  console.log("unchanged since the previous snapshot");
  process.exit(0);
}

const tally = (mark) => changes.filter(([only]) => only === mark).length;
console.log(
  `${tally("~")} changed, ${tally("+")} added, ${tally("-")} removed since the previous snapshot:`,
);
for (const [mark, key] of changes.slice(0, SHOWN)) {
  const at = key.indexOf(" ");
  console.log(`  ${mark} ${key.slice(0, at)}  ${key.slice(at + 1)}`);
}
if (changes.length > SHOWN) console.log(`  … and ${changes.length - SHOWN} more`);
