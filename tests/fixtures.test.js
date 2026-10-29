import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { grade } from "../packages/grader/index.js";
import { AUDIT, auditRows } from "./audit.js";
import { HOSTILE, OUTCOME_KEYS } from "./corpus.js";
import { LESSONS as lessons } from "./lessons.js";

/** Each screen with its own fixtures: every screen is a drill a learner has to get through. */
const screens = lessons.flatMap(({ lesson, screens: views }) =>
  views.map(({ exercise, fixture, screen }, index) => ({
    label: views.length > 1 ? `${lesson.id} screen ${index + 1}` : lesson.id,
    exercise,
    fixture,
    screen,
    picture: screen.type === "picture",
    audit: auditRows(AUDIT[lesson.id])[index],
  })),
);

/** A picture screen is graded from typed answers, so the formula fixtures cover only the sheets. */
const covered = screens.filter((entry) => !entry.picture);

/** A rejection is `{ formula, rule, why }` in the shipped corpus; the schema also allows a bare string. */
const formulaOf = (rejection) => (typeof rejection === "string" ? rejection : rejection.formula);

const MEDIAN_FLOOR = 6;

describe("fixtures: shape", () => {
  it("carries both lists on every screen, with nothing empty", () => {
    assert.ok(lessons.length >= 10, `only ${lessons.length} lessons ship fixtures`);
    for (const { name, screen, fixture } of lessons) {
      assert.ok(screen.fixtures, `${name}: screen has no fixtures inline`);
      assert.ok(fixture.accepted.length > 0, `${name}: no accepted fixtures`);
      assert.ok(fixture.rejected.length > 0, `${name}: no rejected fixtures`);
    }
  });

  it("keeps formula fixtures off a picture screen", () => {
    for (const { label, screen } of screens.filter((entry) => entry.picture)) {
      assert.equal(screen.fixtures, undefined, `${label}: a picture screen has no formulas to fixture`);
    }
  });

  it(`holds at least ${MEDIAN_FLOOR} accepted and ${MEDIAN_FLOOR} rejected formulas per exercise`, () => {
    for (const { exercise, fixture } of covered) {
      assert.ok(
        fixture.accepted.length >= MEDIAN_FLOOR,
        `${exercise.id}: only ${fixture.accepted.length} accepted fixtures`,
      );
      assert.ok(
        fixture.rejected.length >= MEDIAN_FLOOR,
        `${exercise.id}: only ${fixture.rejected.length} rejected fixtures`,
      );
    }
  });

  it("documents every rejection with a rule the exercise can actually report and a reason", () => {
    for (const { exercise, fixture } of covered) {
      for (const rejection of fixture.rejected) {
        assert.equal(typeof rejection, "object", `${exercise.id}: every rejection carries its rule and reason`);
        assert.ok(rejection.formula?.trim(), `${exercise.id}: rejected entry without a formula`);
        assert.ok(
          Object.hasOwn(exercise.hints, rejection.rule),
          `${exercise.id}: "${rejection.formula}" claims rule "${rejection.rule}", which has no hint and so can never be reported`,
        );
        assert.ok(
          rejection.why?.length >= 15,
          `${exercise.id}: "${rejection.formula}" needs a why of at least 15 characters`,
        );
      }
    }
  });

  it("does not list the same formula as both accepted and rejected", () => {
    for (const { exercise, fixture } of covered) {
      const accepted = new Set(fixture.accepted);
      for (const rejection of fixture.rejected) {
        const formula = formulaOf(rejection);
        assert.ok(!accepted.has(formula), `${exercise.id}: "${formula}" is in both lists`);
      }
      assert.equal(new Set(fixture.accepted).size, fixture.accepted.length, `${exercise.id}: duplicate accepted entry`);
      const rejected = fixture.rejected.map(formulaOf);
      assert.equal(new Set(rejected).size, rejected.length, `${exercise.id}: duplicate rejected entry`);
    }
  });
});

describe("fixtures: accepted formulas grade correct", () => {
  for (const { exercise, fixture } of covered) {
    it(`${exercise.id}: ${fixture.accepted.length} accepted formulas are accepted`, () => {
      for (const formula of fixture.accepted) {
        const result = grade(exercise, formula);
        assert.equal(result.ok, true, `${exercise.id}: "${formula}" was rejected with "${result.message}"`);
      }
    });
  }

  it("includes the hand-computed reference answer for every exercise", () => {
    for (const { label, fixture, audit } of covered) {
      assert.ok(
        fixture.accepted.includes(audit.reference),
        `${label}: the reference answer from tests/audit.js is not in the accepted fixtures`,
      );
    }
  });
});

describe("fixtures: rejected formulas are rejected for the documented reason", () => {
  for (const { exercise, fixture } of covered) {
    it(`${exercise.id}: ${fixture.rejected.length} rejected formulas report the documented rule`, () => {
      for (const rejection of fixture.rejected) {
        const result = grade(exercise, formulaOf(rejection));
        assert.equal(result.ok, false, `${exercise.id}: "${rejection.formula}" was accepted`);
        assert.equal(
          result.rule,
          rejection.rule,
          `${exercise.id}: "${rejection.formula}" reported "${result.rule}" (${result.message}) but the fixture documents "${rejection.rule}" — ${rejection.why}`,
        );
      }
    });

    it(`${exercise.id}: rejections explain themselves and carry a hint`, () => {
      for (const rejection of fixture.rejected) {
        const result = grade(exercise, formulaOf(rejection));
        assert.ok(result.message.length > 15, `${exercise.id}: "${rejection.formula}" message is too short: "${result.message}"`);
        assert.doesNotMatch(result.message, /^incorrect\b/i, `${exercise.id}: "${rejection.formula}" gets a bare "Incorrect"`);
        assert.notEqual(result.hint.trim(), "", `${exercise.id}: "${rejection.formula}" (${result.rule}) has no hint`);
      }
    });
  }
});

describe("fixtures: coverage", () => {
  it("reaches every hint the exercise ships, so no copy is dead", () => {
    for (const { exercise, fixture } of covered) {
      const reached = new Set(fixture.rejected.map((rejection) => grade(exercise, formulaOf(rejection)).rule));
      for (const ruleId of Object.keys(exercise.hints)) {
        assert.ok(
          reached.has(ruleId),
          `${exercise.id}: hint "${ruleId}" is shipped but no fixture ever produces that rule`,
        );
      }
    }
  });

  it("distinguishes the value rule from the error rule everywhere", () => {
    for (const { exercise, fixture } of covered) {
      const rules = new Set(fixture.rejected.map((rejection) => rejection.rule));
      assert.ok(rules.has("value"), `${exercise.id}: no wrong-value fixture`);
      assert.ok(rules.has("syntax"), `${exercise.id}: no syntax fixture`);
      assert.ok(rules.has("require-ref"), `${exercise.id}: no require-ref fixture`);
    }
  });
});

describe("fixtures: hostile input", () => {
  for (const { exercise } of covered) {
    it(`${exercise.id}: survives the shared corpus without throwing`, () => {
      for (const formula of HOSTILE) {
        const result = grade(exercise, formula);
        assert.deepEqual(Object.keys(result).sort(), OUTCOME_KEYS, `${exercise.id}: bad outcome shape for "${formula}"`);
        assert.equal(typeof result.ok, "boolean");
        assert.equal(typeof result.message, "string");
        assert.ok(result.message.length > 0, `${exercise.id}: empty message for "${formula}"`);
      }
    });
  }
});

describe("fixtures: performance", () => {
  it("grades 1,000 answers quickly and prints a per-exercise summary", () => {
    const samples = covered.map(({ exercise, fixture }) => ({
      exercise,
      formulas: [...fixture.accepted, ...fixture.rejected.map(formulaOf)],
    }));
    const runs = 1000;
    const started = performance.now();
    let done = 0;
    while (done < runs) {
      for (const sample of samples) {
        for (const formula of sample.formulas) {
          grade(sample.exercise, formula);
          done += 1;
        }
      }
    }
    const elapsed = performance.now() - started;
    for (const sample of samples) {
      const per = sample.formulas.length;
      console.log(`${sample.exercise.id.padEnd(26)} ${String(per).padStart(3)} formulas`);
    }
    console.log(`graded ${done} answers in ${elapsed.toFixed(0)} ms (${((elapsed / done) * 1000).toFixed(0)} µs each)`);
    // The phase doc budgets "well under a second" for the whole sweep; 1000 ms is ~70x the
    // observed cost, tight enough that a real regression fails instead of hiding behind 5000.
    assert.ok(elapsed < 1000, `${done} gradings took ${elapsed.toFixed(0)} ms — the phase budget is well under a second`);
  });
});
