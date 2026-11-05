/**
 * The funnel report, pinned.
 *
 * `scripts/content-report.mjs` is the only thing that turns the log into the five numbers phase 7
 * judges the content by, so the tests here are about the numbers rather than the formatting: the
 * committed fixture has a passing rate, a refusal and a count in it, and the pinned output is
 * `expected.txt`. A change to a threshold or to a denominator has to update that file, which is a
 * diff a reviewer can read.
 *
 * The second test is the one that keeps the report honest about its own window: the default is seven
 * days, and an event from eight days ago must not be in a rate that says it covers a week.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = join(ROOT, "scripts/content-report.mjs");
const FIXTURES = join(ROOT, "scripts/fixtures/content-report");

function run(args) {
  const result = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8" });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

describe("content report", () => {
  it("prints the pinned scorecard for the committed log", () => {
    const { status, stdout, stderr } = run(["--fixture"]);
    assert.equal(stderr, "");
    assert.equal(status, 0);
    assert.equal(stdout, readFileSync(join(FIXTURES, "expected.txt"), "utf8"));
  });

  it("prints a denominator beside every rate it is willing to state", () => {
    const lines = readFileSync(join(FIXTURES, "expected.txt"), "utf8").split("\n");
    const rates = lines.filter((line) => /\d+\.\d% \(\d+\/\d+\)/.test(line));
    assert.equal(rates.length, 2, "the fixture carries exactly two readable rates");
    for (const line of rates) assert.match(line, /\(\d+\/\d+\)/, `no denominator beside a rate: ${line}`);

    // And the third rate is not stated at all, because 12 events is not evidence.
    assert.match(lines.join("\n"), /offer submit rate\s+1\/12\s+>= 3%\s+insufficient data/);
  });

  it("refuses a rate whose denominator is under a hundred", () => {
    const dir = mkdtempSync(join(tmpdir(), "es-report-"));
    try {
      const log = join(dir, "events.jsonl");
      const now = Date.now();
      const at = (offset) => new Date(now - offset).toISOString();
      const lines = [];
      for (let i = 0; i < 30; i += 1) lines.push(JSON.stringify({ event: "content_rendered", at: at(60_000), surface: "lesson", slug: "sum-basics" }));
      for (let i = 0; i < 20; i += 1) lines.push(JSON.stringify({ event: "drill_started", at: at(60_000), surface: "lesson", slug: "sum-basics" }));
      writeFileSync(log, `${lines.join("\n")}\n`);

      const { status, stdout } = run(["--log", log]);
      assert.equal(status, 0);
      assert.match(stdout, /exercise start rate\s+20\/30\s+>= 25%\s+insufficient data/);
      assert.ok(!stdout.includes("66.7%"), "a rate was printed from 30 events");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("leaves events older than the window out of it", () => {
    const dir = mkdtempSync(join(tmpdir(), "es-report-"));
    try {
      const log = join(dir, "events.jsonl");
      const day = 86_400_000;
      const lines = [
        ...Array.from({ length: 104 }, () =>
          JSON.stringify({ event: "content_rendered", at: new Date(Date.now() - day).toISOString(), surface: "lesson", slug: "sum-basics" }),
        ),
        ...Array.from({ length: 104 }, () =>
          JSON.stringify({ event: "drill_started", at: new Date(Date.now() - day).toISOString(), surface: "lesson", slug: "sum-basics" }),
        ),
        // Eight days old: outside the default seven-day window, so it must not move the numerator.
        ...Array.from({ length: 104 }, () =>
          JSON.stringify({ event: "drill_started", at: new Date(Date.now() - 8 * day).toISOString(), surface: "lesson", slug: "sum-basics" }),
        ),
      ];
      writeFileSync(log, `${lines.join("\n")}\n`);

      const { stdout } = run(["--log", log]);
      assert.match(stdout, /exercise start rate\s+100\.0% \(104\/104\)/);
      assert.match(stdout, /log: 312 lines, 208 in window, 0 skipped/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("says which argument it could not read", () => {
    const { status, stderr } = run(["--log", join(tmpdir(), "no-such-log.jsonl")]);
    assert.equal(status, 2);
    assert.match(stderr, /content-report: ENOENT/);
  });

  it("answers in JSON for a dashboard", () => {
    const { status, stdout } = run(["--fixture", "--json"]);
    assert.equal(status, 0);
    const report = JSON.parse(stdout);
    assert.equal(report.metrics.length, 5);
    assert.equal(report.metrics.find((metric) => metric.label === "exercise start rate").verdict, "pass");
    assert.equal(report.metrics.find((metric) => metric.label === "offer submit rate").verdict, "insufficient data");
  });
});
