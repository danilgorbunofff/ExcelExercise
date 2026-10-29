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

import { normalizeLesson } from "../../packages/content/schema.js";
import { grade, gradeAnswer } from "../../packages/grader/index.js";
import { AUDIT, auditRows } from "../audit.js";

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

/** A picture screen is graded from typed answers, so its verdicts come from gradeAnswer. */
const graderFor = (screen) => (screen.type === "picture" ? gradeAnswer : grade);

const settle = (screen, input) => {
  const result = graderFor(screen)(screen, input);
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
    const { screens } = normalizeLesson(readJson(join(EXERCISES, file)), file);
    const audits = auditRows(AUDIT[id]);
    if (!audits[0]) throw new Error(`tests/audit.js has no row for ${id}`);

    // One flat list per section across every screen: a single-screen lesson records exactly what it
    // recorded before, and a screen that arrives later can only add entries.
    const verdicts = { accepted: [], rejected: [], audit: [] };
    screens.forEach((screen, index) => {
      // A picture screen answers in typed text, so it ships no formula fixtures: the audit row
      // below is its whole vocabulary and still records the verdicts.
      const picture = screen.type === "picture";
      // A shortcut screen is graded by matching key presses, not by the formula grader, so it has no
      // verdict to record here. `tests/content.test.js` holds its presses to the audit row instead.
      if (screen.type === "chord" || screen.type === "sequence") return;
      // A workbook screen answers in words from a file the learner reads, so it has no formula
      // fixtures either — it ships only `answers`. Recording it here would mean this snapshot grew
      // with a screen whose verdicts belong to `tests/content.test.js`, and the snapshot is a byte
      // record of the formula grader, so it stays one.
      if (screen.type === "workbook") return;
      if (!picture && !screen.fixtures) {
        throw new Error(`content/exercises/${file} screen ${index + 1} carries no fixtures; cannot capture ${id}`);
      }
      const audit = audits[index];
      if (!audit) throw new Error(`tests/audit.js has no row for ${id} screen ${index + 1}`);
      if (!picture) {
        verdicts.accepted.push(...screen.fixtures.accept.map((input) => settle(screen, input)));
        verdicts.rejected.push(
          ...screen.fixtures.reject.map((entry) => settle(screen, typeof entry === "string" ? entry : entry.formula)),
        );
      }
      verdicts.audit.push(...[audit.reference, ...audit.wrong].map((input) => settle(screen, input)));
    });

    lessons[id] = {
      accepted: verdicts.accepted.sort(byInput),
      rejected: verdicts.rejected.sort(byInput),
      audit: verdicts.audit.sort(byInput),
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
