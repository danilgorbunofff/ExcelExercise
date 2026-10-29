/**
 * Captures what the shipped grader says today for every reviewed formula.
 *
 * This is not a correctness suite — `tests/fixtures.test.js` owns that. It is a
 * byte-level record of the grader's verdicts, messages and hints, so a refactor
 * that is supposed to change nothing can be proven to have changed nothing.
 * Phase 0 of the reference-parity plan moves the grader into `packages/grader`
 * and relies on this file as its evidence.
 *
 * Hostile input (`tests/corpus.js`) is deliberately excluded: its only contract
 * is "returns an outcome instead of throwing", which the fixture suite already
 * asserts, and its verdicts are not semantic promises, so recording them would
 * only add churn.
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

import { normalizeLesson, screenAt } from "../../packages/content/schema.js";
import { grade } from "../../packages/grader/index.js";
import { AUDIT } from "../audit.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const EXERCISES = join(ROOT, "legacy", "content", "exercises");

export const SNAPSHOT_PATH = join(ROOT, "tests", "golden", "snapshot.json");

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

// A non-finite verdict would serialise to `null` and silently lose the fact that
// it was not a number, so tag it instead.
const jsonSafe = (value) => {
  if (value === undefined) return null;
  if (typeof value === "number" && !Number.isFinite(value)) return String(value);
  if (typeof value === "bigint") return String(value);
  return value;
};

const byInput = (a, b) => (a.input < b.input ? -1 : a.input > b.input ? 1 : 0);

const settle = (screen, input) => {
  const result = grade(screen, input);
  const entry = {
    input,
    ok: result.ok,
    rule: result.rule,
    code: jsonSafe(result.code),
    position: jsonSafe(result.position),
    value: jsonSafe(result.value),
    expected: jsonSafe(result.expected),
    message: result.message,
    hint: result.hint,
  };

  // A verdict holding something JSON drops on write (undefined, a function) would
  // be recorded as if the grader had said something else. Fail loudly instead.
  if (!isDeepStrictEqual(JSON.parse(JSON.stringify(entry)), entry)) {
    throw new Error(`grader verdict for "${input}" does not survive a JSON round trip`);
  }
  return entry;
};

const lessonFiles = readdirSync(EXERCISES)
  .filter((name) => name.endsWith(".json"))
  .sort();

/** The snapshot object. Pure: same repo state in, same object out. */
export function capture() {
  const lessons = {};

  for (const file of lessonFiles) {
    const id = file.replace(/\.json$/, "");
    // The screen, not the file: `grade` reads one drill, and a v2 lesson keeps its drill and its
    // fixtures inside `screens[]`. Loading through the schema means this capture follows the same
    // shape the renderer grades, so a migration cannot make the snapshot disagree with the site.
    const screen = screenAt(normalizeLesson(readJson(join(EXERCISES, file)), file), 0);
    if (!screen?.fixtures) {
      throw new Error(`content/exercises/${file} carries no fixtures on its first screen; cannot capture ${id}`);
    }
    const fixture = { accepted: screen.fixtures.accept, rejected: screen.fixtures.reject };
    const audit = AUDIT[id];
    if (!audit) throw new Error(`tests/audit.js has no row for ${id}`);

    lessons[id] = {
      accepted: fixture.accepted.map((input) => settle(screen, input)).sort(byInput),
      rejected: fixture.rejected.map((entry) => settle(screen, typeof entry === "string" ? entry : entry.formula)).sort(byInput),
      audit: [audit.reference, ...audit.wrong].map((input) => settle(screen, input)).sort(byInput),
    };
  }

  return { schemaVersion: 1, lessons };
}

/**
 * Byte-stable serialisation: one verdict per line, so a diff of this file reads
 * as a list of changed verdicts rather than as moved JSON punctuation.
 */
export function serialize(snapshot) {
  const sections = ["accepted", "rejected", "audit"];
  const ids = Object.keys(snapshot.lessons);
  const lines = ["{", `  "schemaVersion": ${snapshot.schemaVersion},`, '  "lessons": {'];

  ids.forEach((id, idIndex) => {
    lines.push(`    ${JSON.stringify(id)}: {`);
    sections.forEach((section, sectionIndex) => {
      const entries = snapshot.lessons[id][section];
      lines.push(`      ${JSON.stringify(section)}: [`);
      entries.forEach((entry, entryIndex) => {
        lines.push(`        ${JSON.stringify(entry)}${entryIndex < entries.length - 1 ? "," : ""}`);
      });
      lines.push(`      ]${sectionIndex < sections.length - 1 ? "," : ""}`);
    });
    lines.push(`    }${idIndex < ids.length - 1 ? "," : ""}`);
  });

  lines.push("  }", "}");
  return `${lines.join("\n")}\n`;
}
