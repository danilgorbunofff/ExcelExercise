import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { SNAPSHOT_PATH, capture, serialize } from "./golden/capture.mjs";

// A missing snapshot must fail as a named test, not as a module-load ENOENT that
// hides which check broke.
const MISSING = `tests/golden/snapshot.json is missing — run \`npm run golden:update\` and review the diff`;
const committed = existsSync(SNAPSHOT_PATH) ? readFileSync(SNAPSHOT_PATH, "utf8") : "";

/** First differing line, with a little context, so a failure names the change. */
function explain(actual, expected) {
  const a = actual.split("\n");
  const b = expected.split("\n");
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    if (a[i] !== b[i]) {
      const from = Math.max(0, i - 2);
      return [
        `first difference at line ${i + 1}:`,
        ...b.slice(from, i + 3).map((line) => `  committed: ${line}`),
        ...a.slice(from, i + 3).map((line) => `  actual:    ${line}`),
      ].join("\n");
    }
  }
  return "snapshots differ only in length";
}

describe("golden: grader verdicts", () => {
  it("matches the committed snapshot byte for byte", () => {
    assert.ok(committed, MISSING);
    const actual = serialize(capture());
    assert.equal(actual, committed, explain(actual, committed));
  });

  it("records a verdict for every fixture and audit formula", () => {
    assert.ok(committed, MISSING);
    const snapshot = JSON.parse(committed);
    const lessons = Object.values(snapshot.lessons);

    assert.ok(lessons.length >= 10, `only ${lessons.length} lessons captured`);
    for (const [id, lesson] of Object.entries(snapshot.lessons)) {
      const total = lesson.accepted.length + lesson.rejected.length + lesson.audit.length;
      assert.ok(total > 0, `${id} captured no verdicts`);

      for (const entry of lesson.accepted) {
        assert.equal(entry.ok, true, `${id}: accepted formula "${entry.input}" no longer grades as correct`);
      }
      for (const entry of lesson.rejected) {
        assert.equal(entry.ok, false, `${id}: rejected formula "${entry.input}" now grades as correct`);
      }
    }
  });
});
