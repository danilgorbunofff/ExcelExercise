import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { KNOWN_FUNCTIONS, buildCells, grade, indexToCol, parseRef } from "../src/grader/index.js";
import { AUDIT } from "./audit.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONTENT = join(ROOT, "content");
const EXERCISES = join(CONTENT, "exercises");

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

const track = readJson(join(CONTENT, "track.json"));
const files = readdirSync(EXERCISES).filter((name) => name.endsWith(".json")).sort();
const lessons = files.map((name) => ({ name, exercise: readJson(join(EXERCISES, name)) }));

/** Addresses covered by the grid rectangle, row-major from startCell. */
function gridAddresses(exercise) {
  const origin = parseRef(exercise.grid.startCell);
  const out = [];
  exercise.grid.rows.forEach((row, r) => {
    row.forEach((_, c) => {
      const col = indexToCol(origin.colIndex + c);
      out.push(`${col}${origin.row + r}`);
    });
  });
  return out;
}

/** Rule ids grade() can report for this exercise, hint keys must cover them. */
function emittableRules(exercise) {
  return [
    "syntax",
    "value",
    "error",
    "require-ref",
    ...exercise.require.map((rule) => rule.id),
    ...exercise.forbid.map((rule) => rule.id),
    ...exercise.rules.map((rule) => rule.id),
  ];
}

function declaredFunctions(exercise) {
  return [
    ...exercise.require.map((rule) => rule.func),
    ...exercise.forbid.map((rule) => rule.func),
    ...exercise.rules.map((rule) => rule.func),
  ];
}

describe("content: track", () => {
  it("lists every exercise file exactly once, in file order", () => {
    assert.deepEqual(track.lessons, lessons.map(({ exercise }) => exercise.id));
    assert.equal(new Set(track.lessons).size, track.lessons.length);
  });

  it("keeps the paywall inside the track", () => {
    assert.ok(Number.isInteger(track.freeLessonCount));
    assert.ok(track.freeLessonCount > 0 && track.freeLessonCount < track.lessons.length);
  });

  it("carries the copy the funnel needs", () => {
    assert.ok(track.title.trim().length > 0);
    assert.ok(track.promise.trim().length > 0);
  });
});

describe("content: exercise schema", () => {
  it("has ten lessons, named after their ids", () => {
    assert.equal(lessons.length, 10);
    for (const { name, exercise } of lessons) {
      assert.equal(name, `${exercise.id}.json`, `${name} disagrees with id ${exercise.id}`);
      assert.equal(exercise.slug, exercise.id.slice(3), "slug should be the id without its number");
      assert.ok([1, 2, 3].includes(exercise.level), `${exercise.id} has a bad level`);
      assert.ok(exercise.title.trim() && exercise.prompt.trim());
    }
  });

  it("loads every grid through buildCells without throwing", () => {
    for (const { exercise } of lessons) {
      const cells = buildCells(exercise);
      assert.ok(Object.keys(cells).length > 0, `${exercise.id} has an empty grid`);
    }
  });

  it("puts a blank answer cell inside the grid", () => {
    for (const { exercise } of lessons) {
      const cells = buildCells(exercise);
      assert.ok(
        gridAddresses(exercise).includes(exercise.answerCell),
        `${exercise.id}: answerCell ${exercise.answerCell} is outside the grid`,
      );
      assert.equal(cells[exercise.answerCell] ?? null, null, `${exercise.id}: answer cell must start blank`);
    }
  });

  it("uses only functions phase 1 implements", () => {
    for (const { exercise } of lessons) {
      for (const func of declaredFunctions(exercise)) {
        assert.ok(KNOWN_FUNCTIONS.has(func), `${exercise.id} declares unimplemented ${func}`);
      }
    }
  });

  it("points requireRef at a cell that really holds data", () => {
    for (const { exercise } of lessons) {
      const cells = buildCells(exercise);
      assert.ok(exercise.requireRef, `${exercise.id} has no requireRef`);
      const value = cells[exercise.requireRef];
      assert.ok(value !== null && value !== undefined, `${exercise.id}: ${exercise.requireRef} is blank`);
    }
  });

  it("gives every rule the grader can emit its own hint", () => {
    for (const { exercise } of lessons) {
      const keys = new Set(Object.keys(exercise.hints));
      // hintFor() accepts either spelling of the requireRef key.
      const has = (rule) =>
        keys.has(rule) || (rule === "require-ref" && (keys.has("requireRef") || keys.has("require-ref")));
      for (const rule of emittableRules(exercise)) {
        assert.ok(has(rule), `${exercise.id} has no hint for the "${rule}" rule`);
      }
    }
  });

  it("ships docs that read like a page, not a placeholder", () => {
    for (const { exercise } of lessons) {
      const docs = exercise.docs ?? {};
      const words = [docs.syntax, docs.explain, docs.atWork, ...(docs.errors ?? []).map((e) => e.text)]
        .filter(Boolean)
        .join(" ")
        .split(/\s+/)
        .filter(Boolean);
      assert.ok(words.length >= 150, `${exercise.id} docs are only ${words.length} words`);
      assert.ok((docs.errors ?? []).length >= 2, `${exercise.id} needs at least two named errors`);
      assert.ok(docs.explain && docs.explain.trim() && docs.atWork && docs.atWork.trim());
      assert.ok(docs.outcome && docs.outcome.trim(), `${exercise.id} has no one-line outcome`);
      assert.ok(docs.outcome.length <= 120 && !/[\r\n]/.test(docs.outcome),
        `${exercise.id} outcome must be a single line under 120 characters`);
      assert.ok(docs.teaches && docs.teaches.trim(), `${exercise.id} has no teaches label for the page metadata`);
    }
  });
});

describe("content: reference answers", () => {
  it("has a hand-computed audit row for every lesson", () => {
    for (const { exercise } of lessons) {
      assert.ok(AUDIT[exercise.id], `${exercise.id} has no audit row`);
    }
    assert.equal(Object.keys(AUDIT).length, lessons.length);
  });

  it("expects exactly the hand-computed value", () => {
    for (const { exercise } of lessons) {
      const audit = AUDIT[exercise.id];
      assert.equal(typeof exercise.expect.value, typeof audit.expected, `${exercise.id} value type`);
      assert.equal(exercise.expect.value, audit.expected, `${exercise.id} expect.value drifted from the audit`);
    }
  });

  it("keeps the published reference answer in step with the audit", () => {
    for (const { exercise } of lessons) {
      const audit = AUDIT[exercise.id];
      assert.equal(exercise.docs.reference, audit.reference, `${exercise.id} docs.reference drifted from the audit`);
      assert.equal(grade(exercise, exercise.docs.reference).ok, true, `${exercise.id} publishes a reference answer the grader rejects`);
    }
  });

  it("grades the reference answer as correct", () => {
    for (const { exercise } of lessons) {
      const result = grade(exercise, AUDIT[exercise.id].reference);
      assert.equal(result.ok, true, `${exercise.id} rejected its own reference answer (${result.rule})`);
      assert.equal(result.value, AUDIT[exercise.id].expected, `${exercise.id} computed a different value`);
      assert.equal(result.expected, AUDIT[exercise.id].expected);
      assert.equal(result.hint, "");
    }
  });

  it("rejects three plausible wrong answers per lesson", () => {
    for (const { exercise } of lessons) {
      for (const formula of AUDIT[exercise.id].wrong) {
        const result = grade(exercise, formula);
        assert.equal(result.ok, false, `${exercise.id} accepted the wrong answer ${formula}`);
        assert.ok(result.hint.length > 0, `${exercise.id} gave no hint for ${formula}`);
      }
    }
  });

  it("never tells a learner to add a function the formula already uses", () => {
    const exercise = (prefix) => lessons.find((entry) => entry.exercise.id.startsWith(prefix)).exercise;

    // Lessons 6 and 10 name a missing function in their per-rule `message`, so the arity
    // branch has to fall back to its own wording: SUM and IFERROR are right here.
    const sumShort = grade(exercise("06"), "=ROUND(SUM(),2)");
    assert.equal(sumShort.rule, "func-sum");
    assert.doesNotMatch(sumShort.message, /wrap the range in SUM/);
    assert.match(sumShort.message, /at least 1 argument here/);

    const iferrorShort = grade(exercise("10"), "=IFERROR(1)");
    assert.equal(iferrorShort.rule, "func-iferror");
    assert.doesNotMatch(iferrorShort.message, /wrap the calculation in IFERROR/);
    assert.match(iferrorShort.message, /at least 2 arguments here/);
  });

  it("keeps the message shape stable for every outcome", () => {
    for (const { exercise } of lessons) {
      for (const formula of [AUDIT[exercise.id].reference, ...AUDIT[exercise.id].wrong, "=SUM("]) {
        const result = grade(exercise, formula);
        assert.deepEqual(Object.keys(result).sort(), [
          "code",
          "expected",
          "hint",
          "message",
          "ok",
          "position",
          "rule",
          "value",
        ]);
      }
    }
  });
});

describe("content: error copy", () => {
  it("writes an error hint that is not the wrong-answer hint", () => {
    for (const { exercise } of lessons) {
      const error = exercise.hints.error;
      assert.ok(error && error.trim(), `${exercise.id} has no hints.error`);
      assert.notEqual(error, exercise.hints.value, `${exercise.id} recycles the value hint for errors`);
    }
  });

  it("reaches the error hint when a correct formula breaks at run time", () => {
    // The reference answer satisfies every rule, so appending `+1/0` can only
    // fail during evaluation: the learner must get the error copy, not the
    // generic "that is not the answer" fallback.
    for (const { exercise } of lessons) {
      const result = grade(exercise, `${AUDIT[exercise.id].reference}+1/0`);
      assert.equal(result.ok, false, `${exercise.id} accepted a broken formula`);
      assert.equal(result.rule, "error", `${exercise.id} reported "${result.rule}" instead of error`);
      assert.ok(result.code, `${exercise.id} reported an error with no code`);
      assert.equal(result.hint, exercise.hints.error, `${exercise.id} fell back to another hint`);
    }
  });
});
