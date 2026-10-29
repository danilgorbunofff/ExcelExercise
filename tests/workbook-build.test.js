/**
 * A whole build with a workbook lesson in it.
 *
 * The writer and the page are tested on their own; what is left is the seam between them — the build
 * has to emit `/assets/files/<name>.xlsx` for every workbook screen, count it, and refuse two screens
 * that would land on the same file. This builds a copy of the site from a temp root with one lesson
 * swapped, then verifies it the way the gate does; the shipped lesson that already carries a workbook
 * stays in the copy, so the file count below includes it.
 */
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";

import { build } from "../legacy/src/build.mjs";
import { verify } from "../legacy/src/verify.mjs";
import { shippedWorkbooks } from "./lessons.js";

const ROOT = join(import.meta.dirname, "..");
const LESSON = "01-sum-basics.json";
const ENV = { SITE_URL: "https://drills.example", SITE_BUILT_AT: "2026-10-28" };

/** A lesson whose single screen ships a workbook. */
function workbookLesson({ secondId = "book-price" } = {}) {
  const raw = JSON.parse(readFileSync(join(ROOT, "legacy/content/exercises", LESSON), "utf8"));
  const screen = {
    id: "book-total",
    type: "workbook",
    prompt: "Open the workbook. What does C4 total?",
    answers: ["7.5"],
    hints: { value: "C4 multiplies the units in column B by the price in C2." },
    sheet: {
      name: "Orders",
      startCell: "A1",
      rows: [
        ["Item", "Units", "Total"],
        ["Widget", 3, "=B2*2.5"],
        ["Total", null, "=SUM(C2:C3)"],
      ],
    },
  };
  return {
    ...raw,
    title: "Total a list you did not type",
    docs: { ...raw.docs, syntax: "=SUM(B2:B4)", reference: "Orders, C4" },
    screens: [screen, { ...screen, id: secondId, prompt: "What does C2 hold?" }],
  };
}

/** A temp root the build can run in: its own src, vendor, content, and the packages it copies in. */
function tempRoot() {
  const work = mkdtempSync(join(tmpdir(), "es-workbook-build-"));
  for (const dir of ["src", "vendor", "content"]) {
    cpSync(join(ROOT, "legacy", dir), join(work, "legacy", dir), { recursive: true });
  }
  cpSync(join(ROOT, "packages"), join(work, "packages"), { recursive: true });
  return work;
}

describe("a build with a workbook lesson", () => {
  let work;
  let out;
  let summary;

  before(() => {
    work = tempRoot();
    writeFileSync(join(work, "legacy/content/exercises", LESSON), `${JSON.stringify(workbookLesson(), null, 2)}\n`);
    out = join(work, "dist");
    summary = build({ root: join(work, "legacy"), out, env: ENV, quiet: true });
  });

  after(() => {
    rmSync(work, { recursive: true, force: true });
  });

  it("writes one file per workbook screen and counts them", () => {
    assert.equal(summary.files, 2 + shippedWorkbooks([LESSON]), "the summary does not count the workbooks");
    for (const name of ["sum-basics-book-total.xlsx", "sum-basics-book-price.xlsx"]) {
      const file = join(out, "assets/files", name);
      assert.ok(existsSync(file), `${name} was not written`);
      assert.equal(readFileSync(file).subarray(0, 4).toString("latin1"), "PK\x03\x04", `${name} is not a ZIP`);
    }
    const page = readFileSync(join(out, "excel/sum-basics.html"), "utf8");
    assert.ok(page.includes('href="/assets/files/sum-basics-book-total.xlsx"'), "the page does not link the file");
  });

  it("passes the post-build verifier", () => {
    assert.deepEqual(verify({ root: join(work, "legacy"), dist: out, env: ENV }).failures, []);
  });

  it("refuses two screens that would land on the same file", () => {
    // The name is derived, so `book total` and `book-total` are one file: silently keeping the first
    // would ship a download that answers a different question than the page asks.
    const second = tempRoot();
    try {
      const lesson = workbookLesson({ secondId: "book total" });
      writeFileSync(join(second, "legacy/content/exercises", LESSON), `${JSON.stringify(lesson, null, 2)}\n`);
      assert.throws(
        () => build({ root: join(second, "legacy"), out: join(second, "dist"), env: ENV, quiet: true }),
        /is written twice/,
      );
    } finally {
      rmSync(second, { recursive: true, force: true });
    }
  });
});
