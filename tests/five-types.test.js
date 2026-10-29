/**
 * A seven-screen lesson that uses all five screen types.
 *
 * Phase 2's first acceptance criterion asks for exactly this. Each type now has a shipped home of its
 * own — the shortcuts on lesson 03, the workbook on the capstone — and each path is audited on its own
 * (`tests/workbook-build.test.js`, `tests/keys-page.test.js`), but none of those proves the five
 * coexist: one lesson, every type, built and then walked to 100. That is what this does.
 *
 * The walk grades each screen with the answer that lesson itself carries — `reference` on a formula,
 * `expect.value` on a shortcut, `answers[0]` on a picture — through the same modules the player
 * imports. The dispatch below mirrors `gradeScreen` in `legacy/src/client/drill.js`; what this asserts
 * is that a five-type lesson is buildable and that the loop terminates over one, not that the
 * dispatch is right (the browser specs cover that per type).
 */
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";

import { grade } from "../packages/grader/grade.js";
import { shippedWorkbooks } from "./lessons.js";
import { gradeAnswer } from "../packages/grader/answers.js";
import { matchesTyped, matchesTypedSteps, parseChord, parsePress } from "../packages/keys/index.js";
import { createSession, recordVerdict } from "../packages/session/index.js";
import { build } from "../legacy/src/build.mjs";
import { verify } from "../legacy/src/verify.mjs";

const ROOT = join(import.meta.dirname, "..");
const LESSON = "16-xlookup-search-from-the-bottom.json";
const ENV = { SITE_URL: "https://drills.example", SITE_BUILT_AT: "2026-10-28" };

const CHORD = {
  id: "chord-filters",
  type: "chord",
  prompt: "Turn on filters for the table without touching the mouse.",
  keys: ["ctrl+shift+l"],
  hints: { value: "Filters sit in the Data tab's ribbon group." },
};

const PASTE = {
  ...CHORD,
  id: "chord-paste",
  prompt: "Paste over the selection without retyping it.",
  keys: ["ctrl+shift+v"],
  hints: { value: "Shift is what makes a paste keep the values and not the formatting." },
};

const SEQUENCE = {
  id: "sequence-format",
  type: "sequence",
  prompt: "Reach the number-format menu from the ribbon's access keys.",
  steps: ["alt", "h", "n", "o"],
  hints: { value: "Alt opens the ribbon, then one letter per tab and per item." },
};

const WORKBOOK = {
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

/** Lesson 16 as a lesson of seven screens: two formulas, the shipped picture, a chord, a sequence and
 *  a workbook. The two shortcut screens never repeat a press, so neither the lint nor the reveal has to
 *  apologise for the second one. */
function fiveTypeLesson() {
  const raw = JSON.parse(readFileSync(join(ROOT, "legacy/content/exercises", LESSON), "utf8"));
  const [first, second, picture] = raw.screens;
  return {
    ...raw,
    title: "Every kind of screen in one lesson",
    screens: [first, CHORD, second, SEQUENCE, picture, WORKBOOK, PASTE],
  };
}

/** Does the screen accept what the lesson itself says the answer is? Mirrors `gradeScreen`, which is
 *  a two-way switch on purpose. The payload carries the reveal (`expect.value`) and, on a formula
 *  screen, the accepted formula (`reference`), so nothing here is authored a second time. */
function accepts(screen) {
  const told = screen.expect?.value ?? "";
  if (screen.type === "chord") return matchesTyped(told, parseChord(screen.keys[0]));
  if (screen.type === "sequence") return matchesTypedSteps(told, screen.steps.map((step) => parsePress(step)));
  if (screen.type === "formula") return grade(screen, screen.reference).ok;
  return gradeAnswer(screen, screen.answers?.[0] ?? told).ok;
}

describe("a lesson that uses all five screen types", () => {
  let work;
  let out;
  let summary;
  let screens;

  before(() => {
    work = mkdtempSync(join(tmpdir(), "es-five-types-"));
    for (const dir of ["src", "vendor", "content"]) {
      cpSync(join(ROOT, "legacy", dir), join(work, "legacy", dir), { recursive: true });
    }
    cpSync(join(ROOT, "packages"), join(work, "packages"), { recursive: true });
    writeFileSync(join(work, "legacy/content/exercises", LESSON), `${JSON.stringify(fiveTypeLesson(), null, 2)}\n`);

    out = join(work, "dist");
    summary = build({ root: join(work, "legacy"), out, env: ENV, quiet: true });

    const page = readFileSync(join(out, "excel/xlookup-search-from-the-bottom.html"), "utf8");
    const payload = page.match(/<script type="application\/json" id="exercise-data">([\s\S]*?)<\/script>/);
    assert.ok(payload, "the page ships no drill payload");
    screens = JSON.parse(payload[1]).screens;
  });

  after(() => {
    rmSync(work, { recursive: true, force: true });
  });

  it("builds, writes the workbook and passes the post-build verifier", () => {
    assert.equal(summary.files, 1 + shippedWorkbooks([LESSON]), "the summary does not count the workbook");
    assert.ok(existsSync(join(out, "assets/files/xlookup-search-from-the-bottom-book-total.xlsx")));
    assert.deepEqual(verify({ root: join(work, "legacy"), dist: out, env: ENV }).failures, []);
  });

  it("publishes all seven screens across all five types", () => {
    assert.equal(screens.length, 7, "a screen went missing between content and payload");
    assert.deepEqual(
      [...new Set(screens.map((screen) => screen.type))].sort(),
      ["chord", "formula", "picture", "sequence", "workbook"],
      "the payload does not carry all five types",
    );
    // A type only the server knows is a type the client cannot render: the page has each panel.
    const page = readFileSync(join(out, "excel/xlookup-search-from-the-bottom.html"), "utf8");
    assert.equal(page.match(/class="keys-panel[ "]/g)?.length ?? 0, 3, "one panel per shortcut screen");
    assert.equal(page.match(/class="picture-body"/g)?.length ?? 0, 1, "the picture has no panel");
    assert.equal(page.match(/class="workbook"/g)?.length ?? 0, 1, "the workbook has no panel");
    assert.ok(page.includes('class="workbook-link"'), "the workbook download is missing");
    assert.ok(page.includes('href="/assets/files/xlookup-search-from-the-bottom-book-total.xlsx"'), "the download points nowhere");
    assert.equal(page.match(/class="sheet"/g)?.length ?? 0, 2, "one sheet per formula screen");
  });

  it("reaches 100 and completes when every screen is answered", () => {
    // The player's own weighting (`drill.js`): one screen's worth of the cap, so the lesson finishes on
    // its last screen rather than three before it.
    let session = createSession({
      screens: screens.length,
      scoring: { correct: Math.ceil(100 / screens.length), incorrect: 0, cap: 100 },
    });
    const events = [];
    for (const [position, screen] of screens.entries()) {
      const result = recordVerdict(session, accepts(screen));
      assert.equal(
        result.events.some((event) => event.type === "check_correct"),
        true,
        `screen ${position + 1} (${screen.type}) rejected the answer the lesson carries`,
      );
      session = result.session;
      events.push(...result.events);
    }

    assert.equal(session.score, session.scoring.cap, "the lesson did not reach the cap");
    assert.equal(session.complete, true, "seven correct screens did not finish the lesson");
    assert.equal(events.filter((event) => event.type === "lesson_complete").length, 1, "lesson_complete fired once");
    assert.equal(events.filter((event) => event.type === "screen_complete").length, 7, "every screen completed");
  });
});
