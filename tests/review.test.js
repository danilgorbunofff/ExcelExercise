/**
 * The review's own checker — `scripts/review.mjs`.
 *
 * The completeness review marks rows **Proven** and names a witness, and the whole value of that
 * document is that the witness is real. A checker that accepts anything would make the review look
 * proved forever, so each rule below is tested against the case it exists for: a witness line that is
 * blank, a witness file the runner never reported, a witness inside a test that failed, and a db spec
 * nobody wired into the gate.
 */
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  GATES,
  artifactProblem,
  dbSpecGaps,
  gateProblem,
  parseEvidence,
  parseJUnit,
  parsePlaywright,
  provenRows,
  testBlocks,
  witnessProblem,
} from "../scripts/review.mjs";

const ROOT = join(import.meta.dirname, "..");
const PHASES = join(ROOT, "docs", "plans", "parity");
const phaseDocs = readdirSync(PHASES).filter((name) => /^phase-\d+.*\.md$/.test(name));
const rows = phaseDocs.flatMap((name) => parseEvidence(readFileSync(join(PHASES, name), "utf8"), join(PHASES, name)));

describe("the evidence tables", () => {
  it("reads every acceptance row out of the eleven phase documents", () => {
    assert.equal(phaseDocs.length, 11);
    assert.ok(rows.length > 100, `only ${rows.length} rows found`);
    for (const row of rows) {
      assert.match(row.id, /^p\d+-\d+$/, `${row.file}: "${row.id}"`);
      assert.ok(row.criterion.length > 0, `${row.id}: no criterion`);
    }
    assert.equal(new Set(rows.map((row) => row.id)).size, rows.length, "an id is used twice");
  });

  it("keeps the rows that are not proven out of the witness check, and only those", () => {
    const proved = provenRows(rows);
    assert.ok(proved.length > 0);
    for (const row of proved) assert.equal(row.verdict, "Proven");
    assert.ok(rows.some((row) => row.verdict !== "Proven"), "nothing is honest about being unproven");
  });

  it("gives every proven row a witness the review can check", () => {
    for (const row of provenRows(rows)) {
      const total = row.paths.length + row.gates.length + row.artifacts.length;
      assert.ok(total > 0, `${row.id} is Proven with no witness this review can check`);
      for (const name of row.gates) assert.ok(GATES[name], `${row.id}: "${name}" is not a gate the review runs`);
      for (const name of row.artifacts) {
        assert.ok(readFileSync(join(ROOT, name), "utf8").length > 0, `${row.id}: artifact ${name} is empty`);
      }
    }
  });

  it("refuses a proven row that names a bare file instead of a witness", () => {
    for (const row of provenRows(rows)) {
      if (row.paths.length + row.gates.length + row.artifacts.length === 0) continue;
      const bare = [...row.witness.matchAll(/`([^`]+\.(?:js|mjs|json|md|yml|html))`/g)]
        .map((match) => match[1])
        .filter((token) => !token.startsWith("artifact:"));
      assert.deepEqual(bare, [], `${row.id} names ${bare.join(", ")} with no line and no witness prefix`);
    }
  });

  it("points every path witness at a line inside a test", () => {
    for (const row of provenRows(rows)) {
      for (const path of row.paths) {
        const source = readFileSync(join(ROOT, path.file), "utf8");
        const blocks = testBlocks(source);
        assert.ok(
          blocks.some((block) => path.line >= block.start && path.line < block.end),
          `${row.id}: ${path.file}:${path.line} is not inside a test`,
        );
      }
    }
  });
});

describe("witnessProblem", () => {
  const unit = new Set([join(ROOT, "tests", "content-lint.test.js")]);
  const tests = [{ file: "e2e/routes.spec.js", line: 26, end: 33, passed: true }];

  it("accepts a unit witness on a line inside a test the runner reported", () => {
    assert.equal(witnessProblem({ file: "tests/content-lint.test.js", line: 94 }, { unit, tests }), null);
  });

  it("refuses a line that is not inside a test, even in a file that ran", () => {
    assert.match(witnessProblem({ file: "tests/content-lint.test.js", line: 1 }, { unit, tests }), /not inside a test/);
  });

  it("refuses a file the unit run never reported", () => {
    assert.match(witnessProblem({ file: "tests/content-lint.test.js", line: 94 }, { unit: new Set(), tests }), /did not run this file/);
  });

  it("refuses a file that does not exist, whatever the line says", () => {
    assert.match(witnessProblem({ file: "tests/nope.test.js", line: 1 }, { unit, tests }), /does not exist/);
  });

  it("accepts a browser witness inside the test that ran, and refuses one in the gap after it", () => {
    assert.equal(witnessProblem({ file: "e2e/routes.spec.js", line: 31 }, { unit: new Set(), tests }), null);
    assert.match(witnessProblem({ file: "e2e/routes.spec.js", line: 40 }, { unit: new Set(), tests }), /not inside any browser test/);
  });

  it("refuses a browser witness inside a test that failed", () => {
    const failed = [{ file: "e2e/routes.spec.js", line: 26, end: 40, passed: false }];
    assert.match(witnessProblem({ file: "e2e/routes.spec.js", line: 31 }, { unit, tests: failed }), /did not pass/);
  });

  it("matches the spec names Playwright writes, shortened or prefixed with ../", () => {
    const named = [
      { file: "article.spec.js", line: 16, end: 28, passed: true },
      { file: "../e2e-static/static-drill.spec.js", line: 115, end: 200, passed: true },
    ];
    assert.equal(witnessProblem({ file: "e2e/article.spec.js", line: 20 }, { unit, tests: named }), null);
    assert.equal(witnessProblem({ file: "e2e-static/static-drill.spec.js", line: 120 }, { unit, tests: named }), null);
  });
});

describe("the run reports", () => {
  it("reads the files a JUnit report names, and nothing twice", () => {
    const files = parseJUnit(
      '<testcase name="a" file="/repo/tests/a.test.js"/><testcase name="b" file="/repo/tests/b.test.js"/>' +
        '<testcase name="c" file="/repo/tests/a.test.js"/>',
    );
    assert.deepEqual([...files].sort(), ["/repo/tests/a.test.js", "/repo/tests/b.test.js"]);
  });

  it("turns a Playwright report into intervals, one per test, in file order", () => {
    const report = {
      suites: [
        {
          specs: [
            { title: "first", file: "a.spec.js", line: 10, tests: [{ results: [{ status: "passed" }] }] },
            { title: "second", file: "a.spec.js", line: 20, tests: [{ results: [{ status: "failed" }] }] },
          ],
          suites: [
            { specs: [{ title: "third", file: "a.spec.js", line: 30, tests: [{ results: [{ status: "passed" }] }] }], suites: [] },
          ],
        },
      ],
    };
    const tests = parsePlaywright(JSON.stringify(report));
    assert.deepEqual(
      tests.map(({ title, line, end, passed }) => ({ title, line, end, passed })),
      [
        { title: "first", line: 10, end: 20, passed: true },
        { title: "second", line: 20, end: 30, passed: false },
        { title: "third", line: 30, end: Number.MAX_SAFE_INTEGER, passed: true },
      ],
    );
  });
});

describe("the db gate's list", () => {
  it("finds a spec in the directory that the script does not name", () => {
    const dir = mkdtempSync(join(tmpdir(), "review-db-"));
    try {
      mkdirSync(join(dir, "db"));
      writeFileSync(join(dir, "db", "a.spec.js"), "");
      writeFileSync(join(dir, "db", "b.spec.js"), "");
      writeFileSync(join(dir, "db", "c.test.js"), "");
      const { specs, missing } = dbSpecGaps({ dir: join(dir, "db"), script: "node --test tests/db/a.spec.js" });
      assert.deepEqual(specs, ["tests/db/a.spec.js", "tests/db/b.spec.js"]);
      assert.deepEqual(missing, ["tests/db/b.spec.js"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("names every spec the repository actually has", () => {
    const script = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).scripts["db:check"];
    const { specs, missing } = dbSpecGaps({ script });
    assert.ok(specs.length >= 12, `only ${specs.length} db specs found`);
    assert.deepEqual(missing, [], "a db spec exists that no gate runs");
  });
});

describe("gateProblem", () => {
  const ran = new Map([
    ["content", { ok: true }],
    ["browser", { ok: true }],
    ["db", { ok: true, skipped: true }],
    ["origin", { ok: false }],
  ]);

  it("accepts a gate this run passed", () => {
    assert.equal(gateProblem("content:check", { ran }), null);
    assert.equal(gateProblem("e2e", { ran }), null);
  });

  it("refuses a gate that is unknown, absent, skipped or red", () => {
    assert.match(gateProblem("deploy:check", { ran }), /not a gate this review runs/);
    assert.match(gateProblem("budget", { ran }), /did not run/);
    assert.match(gateProblem("db:check", { ran }), /skipped/);
    assert.match(gateProblem("origin:check", { ran }), /failed/);
  });

  it("maps every gate it knows to a step the runner actually has", () => {
    const ids = new Set(readFileSync(join(ROOT, "scripts", "review.mjs"), "utf8").matchAll(/id: "([a-z]+)"/g).map((match) => match[1]));
    for (const step of Object.values(GATES)) assert.ok(ids.has(step), `gate maps to "${step}", which is not a step`);
  });
});

describe("artifactProblem", () => {
  it("accepts a file that is there and refuses one that is not", () => {
    assert.equal(artifactProblem("package.json"), null);
    assert.match(artifactProblem("docs/no-such-guide.md"), /does not exist/);
  });
});
