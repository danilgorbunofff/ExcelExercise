/**
 * The client's non-DOM half: progress, trial, gating, normalisation, and the guard on
 * the payload shape. Drill rendering is verified in the browser, not here — what is
 * worth asserting in Node is everything that can silently corrupt stored state.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { grade } from "../packages/grader/index.js";

import {
  PROGRESS_KEY,
  TRIAL_KEY,
  TRIAL_DAYS,
  attemptsFor,
  canGrade,
  caretLine,
  completedCount,
  emptyProgress,
  gateFor,
  isComplete,
  normaliseFormula,
  parsePayload,
  parseProgress,
  parseTrial,
  registerAttempt,
  registerCompletion,
  serializeProgress,
  startTrial,
  trialActive,
  trialDaysLeft,
  validEmail,
} from "../legacy/src/client/state.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DAY = 24 * 60 * 60 * 1000;

describe("progress storage", () => {
  it("treats every kind of junk as an empty progress", () => {
    for (const junk of ["", "null", "[]", "42", '"text"', "{", '{"done":[]}', '{"done":{"a":1}}']) {
      const progress = parseProgress(junk);
      assert.deepEqual(progress, emptyProgress(), `junk ${JSON.stringify(junk)} should be empty`);
    }
  });

  it("round-trips what it writes", () => {
    let progress = registerAttempt(emptyProgress(), "01-sum-basics");
    progress = registerCompletion(progress, "01-sum-basics", { at: "2026-10-28T10:00:00.000Z" });
    const restored = parseProgress(serializeProgress(progress));
    assert.deepEqual(restored, progress);
    assert.equal(completedCount(restored), 1);
    assert.equal(isComplete(restored, "01-sum-basics"), true);
    assert.equal(attemptsFor(restored, "01-sum-basics"), 1);
  });

  it("counts a failed check without recording a completion", () => {
    const progress = registerAttempt(emptyProgress(), "02-sum-ranges");
    assert.equal(completedCount(progress), 0);
    assert.equal(attemptsFor(progress, "02-sum-ranges"), 1);
    assert.equal(attemptsFor(progress, "unknown"), 0);
  });

  it("moves attempts into the completion and stops counting them twice", () => {
    let progress = emptyProgress();
    for (let i = 0; i < 3; i += 1) progress = registerAttempt(progress, "03-sum-column");
    progress = registerCompletion(progress, "03-sum-column", { at: "2026-10-28T10:00:00.000Z" });
    assert.equal(attemptsFor(progress, "03-sum-column"), 3);
    assert.equal(progress.tries["03-sum-column"], undefined);
    assert.equal(progress.done["03-sum-column"].tries, 3);
  });

  it("keeps the first completion date and the helped flag when solved again", () => {
    let progress = registerCompletion(emptyProgress(), "04-sum-two", {
      at: "2026-10-28T10:00:00.000Z",
      helped: true,
    });
    progress = registerCompletion(progress, "04-sum-two", { at: "2026-11-02T10:00:00.000Z", helped: false });
    assert.equal(progress.done["04-sum-two"].at, "2026-10-28T10:00:00.000Z");
    assert.equal(progress.done["04-sum-two"].helped, true);
    assert.equal(progress.done["04-sum-two"].tries, 1);
  });

  it("drops ids and entries that are not usable", () => {
    const longId = "x".repeat(200);
    const stored = JSON.stringify({
      v: 1,
      done: {
        "": { at: "2026-10-28T10:00:00.000Z" },
        [longId]: { at: "2026-10-28T10:00:00.000Z" },
        "bad-date": { at: "not a date" },
        "good": { at: "2026-10-28T10:00:00.000Z", tries: 0, helped: "yes" },
      },
      tries: { "kept": 2, "zero": 0, "text": "3" },
    });
    const progress = parseProgress(stored);
    assert.deepEqual(Object.keys(progress.done), ["good"]);
    assert.deepEqual(progress.done.good, { at: "2026-10-28T10:00:00.000Z", tries: 1, helped: false });
    assert.deepEqual(progress.tries, { kept: 2 });
  });

  it("uses the documented storage keys", () => {
    assert.equal(PROGRESS_KEY, "es.progress");
    assert.equal(TRIAL_KEY, "es.trial");
  });
});

describe("trial", () => {
  const start = new Date("2026-10-28T10:00:00.000Z");

  it("is inactive until it is started", () => {
    assert.equal(trialActive(null), false);
    assert.equal(trialDaysLeft(null), 0);
    assert.equal(gateFor({ free: false }, null), "paywall");
    assert.equal(gateFor({ free: true }, null), "open");
  });

  it("runs for seven days and then stops", () => {
    const trial = startTrial(start);
    assert.equal(trialActive(trial, start), true);
    assert.equal(trialActive(trial, new Date(start.getTime() + (TRIAL_DAYS - 1) * DAY)), true);
    assert.equal(trialActive(trial, new Date(start.getTime() + TRIAL_DAYS * DAY)), false);
    assert.equal(gateFor({ free: false }, trial, new Date(start.getTime() + TRIAL_DAYS * DAY)), "paywall");
  });

  it("rounds the remaining days up so the last day is not '0'", () => {
    const trial = startTrial(start);
    assert.equal(trialDaysLeft(trial, start), 7);
    assert.equal(trialDaysLeft(trial, new Date(start.getTime() + 6.5 * DAY)), 1);
    assert.equal(trialDaysLeft(trial, new Date(start.getTime() + 8 * DAY)), 0);
  });

  it("ignores a trial started in the future or with a broken date", () => {
    assert.equal(trialActive(startTrial(new Date(start.getTime() + DAY)), start), false);
    assert.equal(parseTrial('{"startedAt":"yesterday"}'), null);
    assert.equal(parseTrial('{"startedAt":5}'), null);
    assert.equal(parseTrial("{}"), null);
    assert.equal(parseTrial(""), null);
  });

  it("opens a trial record for the current time", () => {
    assert.deepEqual(startTrial(start), { startedAt: "2026-10-28T10:00:00.000Z" });
    assert.deepEqual(parseTrial(JSON.stringify(startTrial(start))), { startedAt: "2026-10-28T10:00:00.000Z" });
  });
});

describe("formula input", () => {
  it("strips zero-width characters and surrounding whitespace from a paste", () => {
    assert.equal(normaliseFormula("\uFEFF=SUM(\u200BB2:B4)\u200D "), "=SUM(B2:B4)");
    assert.equal(normaliseFormula("  =SUM(B2:B4)  "), "=SUM(B2:B4)");
    assert.equal(normaliseFormula("=SUM(B2:B4)\n"), "=SUM(B2:B4)");
  });

  it("keeps the leading = that the grader accepts", () => {
    assert.equal(normaliseFormula("=A1"), "=A1");
    assert.equal(normaliseFormula(""), "");
    assert.equal(normaliseFormula(null), "");
    assert.equal(normaliseFormula(undefined), "");
  });

  it("draws the caret under the token the grader blamed", () => {
    assert.equal(caretLine("=1+", 3), "=1+\n   ^");
    assert.equal(caretLine("=SUM(B2:B4))", 11), "=SUM(B2:B4))\n           ^");
    assert.equal(caretLine("=SUM(A1", 1), "=SUM(A1\n ^");
  });

  it("lines the caret up with the character the real grader blames", () => {
    const exercise = JSON.parse(readFileSync(join(ROOT, "legacy/content/exercises/01-sum-basics.json"), "utf8"));
    const cases = [
      ["=SUM(B2:B4))", 11], // the surplus ")"
      ["=SUM(", 1], // the function name that never closes
      ["=1+", 3], // one past the end: "unexpected the end of the formula"
    ];
    for (const [typed, column] of cases) {
      const result = grade(exercise, typed);
      const [text, marker] = caretLine(typed, result.position).split("\n");
      assert.equal(text, typed, `${typed}: the caret block must show what was typed`);
      assert.equal(marker.indexOf("^"), column, `${typed}: caret is not on the blamed character`);
    }
  });

  it("declines to draw a caret without a usable position", () => {
    for (const position of [null, undefined, 0, -2, 1.5, "3"]) {
      assert.equal(caretLine("=1+", position), "");
    }
  });

  it("accepts plausible addresses only", () => {
    assert.equal(validEmail("someone@company.com"), true);
    assert.equal(validEmail("  someone@company.co.uk  "), true);
    for (const bad of ["", "someone", "someone@", "@company.com", "someone@company", "a@b.c", "a b@c.com"]) {
      assert.equal(validEmail(bad), false, `${bad} should be rejected`);
    }
    assert.equal(validEmail(`${"a".repeat(250)}@company.com`), false);
  });
});

describe("payload guard", () => {
  const valid = {
    id: "01-sum-basics",
    answerCell: "B5",
    prompt: "Add the three months in B2:B4.",
    grid: { startCell: "A1", rows: [[1]] },
    expect: { value: 3580 },
    track: { free: true },
  };

  it("accepts the shape the page inlines", () => {
    assert.deepEqual(parsePayload(JSON.stringify(valid)), valid);
  });

  it("names the missing field instead of failing later", () => {
    for (const key of ["id", "answerCell", "prompt"]) {
      const broken = { ...valid, [key]: undefined };
      assert.throws(() => parsePayload(JSON.stringify(broken)), new RegExp(`missing ${key}`));
    }
    assert.throws(() => parsePayload(JSON.stringify({ ...valid, grid: {} })), /grid\.rows/);
    assert.throws(() => parsePayload(JSON.stringify({ ...valid, expect: {} })), /expect\.value/);
    assert.throws(() => parsePayload(JSON.stringify({ ...valid, track: {} })), /track\.free/);
    assert.throws(() => parsePayload("{"), /not JSON/);
    assert.throws(() => parsePayload("[]"), /must be an object/);
  });
});

describe("checking the bar", () => {
  const answerCell = "B5";

  it("grades only an editable answer cell", () => {
    assert.equal(canGrade({ selected: answerCell, answerCell, disabled: false }), true);
    // A data cell's value in the bar is read-only: grading it would spend an attempt
    // and answer "not accepted" to something the learner cannot edit.
    assert.equal(canGrade({ selected: "B2", answerCell, disabled: true }), false);
    assert.equal(canGrade({ selected: "B2", answerCell, disabled: false }), false);
    assert.equal(canGrade({ selected: answerCell, answerCell, disabled: true }), false);
  });

  it("refuses anything that is not a selected cell", () => {
    for (const args of [undefined, {}, { selected: null, answerCell }, { selected: "", answerCell }]) {
      assert.equal(canGrade(args), false, `${JSON.stringify(args)} must not grade`);
    }
  });
});

/** Comments are allowed to name the thing we ban; code is not. */
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

describe("drill.js source", () => {
  const source = readFileSync(join(ROOT, "legacy/src/client/drill.js"), "utf8");
  const stateSource = readFileSync(join(ROOT, "legacy/src/client/state.js"), "utf8");
  const code = stripComments(source);
  const stateCode = stripComments(stateSource);

  it("imports the real grader rather than a copy of the rules", () => {
    assert.match(code, /from "\.\.\/grader\/index\.js"/);
    assert.match(code, /\bgrade\(payload, raw\)/);
  });

  it("never turns content or learner input into markup", () => {
    for (const danger of ["innerHTML", "outerHTML", "insertAdjacentHTML", "document.write", "eval(", "new Function"]) {
      assert.equal(code.includes(danger), false, `drill.js must not use ${danger}`);
      assert.equal(stateCode.includes(danger), false, `state.js must not use ${danger}`);
    }
    assert.match(code, /textContent/);
  });

  it("keeps the grader call guarded so a throw cannot strand the learner", () => {
    assert.match(code, /try \{\s*result = grade\(payload, raw\);\s*\} catch/);
  });

  it("keeps state.js free of browser globals so Node can test it", () => {
    for (const global of ["document.", "window.", "localStorage"]) {
      assert.equal(stateCode.includes(global), false, `state.js must not reference ${global}`);
    }
  });

  it("emits the nine funnel events the phase document lists", () => {
    for (const event of [
      "drill_view",
      "drill_start",
      "drill_check",
      "drill_hint",
      "drill_solution",
      "drill_complete",
      "paywall_view",
      "paywall_email",
      "trial_start",
    ]) {
      assert.match(code, new RegExp(`track\\("${event}"`), `${event} is never emitted`);
    }
  });

  it("never puts a cell value in the formula bar", () => {
    // `solved ? display(expect.value)` was the bug: the bar then held 3580, Check
    // graded it, and a completed lesson answered "Not accepted".
    assert.doesNotMatch(code, /ui\.input\.value = solved \? display\(/);
    assert.match(code, /function barText\(/);
    assert.match(code, /ui\.input\.value = barText\(\)/);
  });

  it("asks the shared predicate before grading", () => {
    assert.match(code, /if \(!canGrade\(\{ selected, answerCell: payload\.answerCell, disabled: ui\.input\.disabled \}\)\) return;/);
  });

  it("announces exhaustion once, on the third miss", () => {
    assert.equal(code.match(/drill_exhausted/g).length, 1, "one emission site, so a retry does not re-count");
    assert.doesNotMatch(code, />= MAX_ATTEMPTS\) \{\s*if \(ui\.showAnswer\) ui\.showAnswer\.hidden = false;/);
  });

  it("restores the reveal for a lesson that was already exhausted", () => {
    assert.match(code, /attemptsFor\(progress, lessonId\) >= MAX_ATTEMPTS\) ui\.showAnswer\.hidden = false;/);
  });

  it("keeps the typed address out of the event buffer", () => {
    // The form says nothing is sent anywhere; an address sitting in the event queue
    // would be the one field an analytics hook could forward. The extra
    // drill_exhausted event is intentional (it marks the third miss).
    assert.doesNotMatch(code, /track\("paywall_email"[^)]*email[^)]*\)/);
    assert.doesNotMatch(code, /track\("paywall_email"[^)]*input\.value/);
  });
});
