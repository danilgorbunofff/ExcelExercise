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

import { loadLesson } from "./lessons.js";

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
    const { screen } = loadLesson("01-sum-basics.json");
    const cases = [
      ["=SUM(B2:B4))", 11], // the surplus ")"
      ["=SUM(", 1], // the function name that never closes
      ["=1+", 3], // one past the end: "unexpected the end of the formula"
    ];
    for (const [typed, column] of cases) {
      const result = grade(screen, typed);
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
  const screen = {
    type: "formula",
    prompt: "Add the three months in B2:B4.",
    answerCell: "B5",
    grid: { startCell: "A1", rows: [[1]] },
    expect: { value: 3580 },
  };
  const valid = {
    id: "01-sum-basics",
    screens: [screen],
    track: { free: true },
  };

  it("accepts the shape the page inlines", () => {
    assert.deepEqual(parsePayload(JSON.stringify(valid)), valid);
    const two = { ...valid, screens: [screen, { ...screen, answerCell: "B6" }] };
    assert.deepEqual(parsePayload(JSON.stringify(two)), two);
  });

  it("names the missing field instead of failing later", () => {
    assert.throws(() => parsePayload(JSON.stringify({ ...valid, id: undefined })), /missing id/);
    for (const key of ["answerCell", "prompt", "type"]) {
      const broken = { id: valid.id, screens: [{ ...screen, [key]: undefined }], track: valid.track };
      assert.throws(() => parsePayload(JSON.stringify(broken)), new RegExp(`screen 1 is missing ${key}`));
    }
    const second = { id: valid.id, screens: [screen, { ...screen, prompt: "" }], track: valid.track };
    assert.throws(() => parsePayload(JSON.stringify(second)), /screen 2 is missing prompt/);
    assert.throws(() => parsePayload(JSON.stringify({ ...valid, screens: [] })), /at least one screen/);
    assert.throws(() => parsePayload(JSON.stringify({ ...valid, screens: [{ ...screen, grid: {} }] })), /grid\.rows/);
    assert.throws(() => parsePayload(JSON.stringify({ ...valid, screens: [{ ...screen, expect: {} }] })), /expect\.value/);
    // A picture screen is graded from its answers, so the grid it has no use for is not required —
    // and the answers it does use are.
    const picture = { type: "picture", prompt: "Which range?", answers: ["B2:B6"], expect: { value: "B2:B6" } };
    assert.deepEqual(parsePayload(JSON.stringify({ ...valid, screens: [picture] })).screens, [picture]);
    assert.throws(
      () => parsePayload(JSON.stringify({ ...valid, screens: [{ ...picture, answers: [] }] })),
      /screen 1 is missing answers/,
    );
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
    // Both graders come from the shipped module: the formula evaluator and the answer lookup.
    assert.match(code, /\bgrade\(screen, raw\)/);
    assert.match(code, /\bgradeAnswer\(screen, raw\)/);
  });

  it("never turns content or learner input into markup", () => {
    for (const danger of ["innerHTML", "outerHTML", "insertAdjacentHTML", "document.write", "eval(", "new Function"]) {
      assert.equal(code.includes(danger), false, `drill.js must not use ${danger}`);
      assert.equal(stateCode.includes(danger), false, `state.js must not use ${danger}`);
    }
    assert.match(code, /textContent/);
  });

  it("keeps the grader call guarded so a throw cannot strand the learner", () => {
    assert.match(code, /try \{\s*result = gradeScreen\(screen, raw\);\s*\} catch/);
  });

  it("keeps state.js free of browser globals so Node can test it", () => {
    for (const global of ["document.", "window.", "localStorage"]) {
      assert.equal(stateCode.includes(global), false, `state.js must not reference ${global}`);
    }
  });

  it("emits the funnel events under the names the phase document lists", () => {
    // The page owns the navigation and commerce events; grading belongs to the score
    // loop, which names its own four. Asserting each at its source keeps a rename from
    // slipping through both.
    for (const event of [
      "screen_view",
      "drill_start",
      "hint_open",
      "solution_reveal",
      "lesson_exhausted",
      "paywall_view",
      "paywall_email",
      "trial_start",
    ]) {
      assert.match(code, new RegExp(`track\\("${event}"`), `${event} is never emitted`);
    }
    const loopCode = stripComments(
      readFileSync(join(ROOT, "packages/session/score.js"), "utf8"),
    );
    for (const event of ["check_correct", "check_wrong", "screen_complete", "lesson_complete"]) {
      assert.match(loopCode, new RegExp(`type: "${event}"`), `${event} is never emitted by the loop`);
    }
    assert.match(code, /emitLoop\(/, "the loop's events must reach the page's sink");
  });

  it("reads the shared clock instead of timing the drill itself", () => {
    assert.match(code, /import \{[^}]*\bcreateClock\b[^}]*\} from "\.\.\/session\/index\.js"/s);
    assert.match(code, /const clock = createClock\(\);/);
    assert.doesNotMatch(code, /\bnew Date\(\).*elapsed/i);
  });

  it("pauses the clock while the tab is hidden and resumes it when it comes back", () => {
    assert.match(
      code,
      /if \(document\.hidden\) clock\.pause\(\);\s*document\.addEventListener\("visibilitychange", \(\) => \{\s*if \(document\.hidden\) clock\.pause\(\);\s*else clock\.resume\(\);/,
    );
  });

  it("stamps the working events with whole seconds on task", () => {
    assert.match(code, /function seconds\(\) \{\s*return Math\.round\(clock\.elapsedMs\(\) \/ 1000\);/);
    // Three screen_views, the loop's base props, the first keystroke, hint, reveal and exhaustion.
    assert.equal(code.match(/elapsed: seconds\(\)/g)?.length, 8);
    assert.match(code, /const base = \{ id: lessonId, elapsed: seconds\(\), \.\.\.extra \};/);
  });

  it("reaches the shared session sink instead of its own buffer", () => {
    assert.match(code, /import \{ createSink \} from "\.\.\/session\/index\.js";/);
    assert.match(code, /const sink = createSink\(\{/);
    assert.match(code, /return sink\.emit\(type, props\)/);
  });

  it("never puts a cell value in the formula bar", () => {
    // `solved ? display(expect.value)` was the bug: the bar then held 3580, Check
    // graded it, and a completed lesson answered "Not accepted".
    assert.doesNotMatch(code, /ui\.input\.value = solved \? display\(/);
    assert.match(code, /function barText\(/);
    assert.match(code, /ui\.input\.value = barText\(\)/);
  });

  it("asks the shared predicate before grading", () => {
    // Only a formula screen has a cell to select, so only it can have a bar that is read-only. A
    // picture screen answers in words and a shortcut screen in keys: their bar is always the
    // learner's to grade.
    assert.match(
      code,
      /if \(\s*screen\.type === "formula" &&\s*!canGrade\(\{ selected, answerCell: screen\.answerCell, disabled: ui\.input\.disabled \}\)\s*\) \{\s*return;/,
    );
  });

  it("routes each screen type to its own grader", () => {
    assert.match(code, /import \{ grade, gradeAnswer \} from "\.\.\/grader\/index\.js";/);
    assert.match(
      code,
      /if \(screen\.type === "picture"\) return gradeAnswer\(screen, raw\);\s*if \(screen\.type === "chord" \|\| screen\.type === "sequence"\) return gradeKeys\(screen, raw\);\s*return grade\(screen, raw\);/,
    );
  });

  it("grades a typed shortcut as forgivingly as a typed answer", () => {
    // The bar is the documented fallback for a browser that eats the keys, so the spelling has to
    // be as loose as the press: Cmd, Ctrl and Mod are one token, and a sequence is one entry per
    // step in order.
    assert.match(code, /import \{[^}]*matchesTyped[^}]*\} from "\.\.\/keys\/index\.js";/);
    assert.match(code, /chords\.some\(\(chord\) => matchesTyped\(raw, chord\)\)/);
    assert.match(code, /matchesTypedSteps\(raw, chords\)/);
  });

  it("only spends an attempt on a press that could be the answer", () => {
    // A learner reading the sheet types plain letters that are not shortcuts; grading those would
    // burn the three attempts before the first real attempt.
    assert.match(code, /const deliberate =\s*keyStep > 0 \|\|/);
    assert.match(code, /if \(!deliberate \|\| !keysLive\) return false;/);
    // The typed fallback lives in the bar, so a keydown that came from a field is never captured.
    assert.match(code, /if \(event\.target\?\.closest\?\.\("input, textarea, select, \[contenteditable=true\]"\)\) return;/);
    assert.match(code, /event\.isTrusted === false/);
    // A held chord repeats after it solves the screen; the repeat must not grade the screen after it.
    assert.match(code, /if \(event\.repeat\) return;/);
  });

  it("starts a sequence over on Escape", () => {
    assert.match(code, /if \(event\.key === "Escape" && keyStep > 0\) \{/);
  });

  it("prints a solved line the screen can actually show", () => {
    // A picture screen has no cell to name, so the line reads the answer instead of "B7 holds 21.5.";
    // a shortcut screen names the shortcut in this keyboard's words.
    assert.match(code, /if \(screen\.type === "picture"\) return `The answer is \$\{display\(screen\.expect\.value\)\}\.`;/);
    assert.match(code, /if \(screen\.type === "chord"\) return `The shortcut is \$\{revealText\(screen\)\}\.`;/);
    assert.match(code, /if \(screen\.type === "sequence"\) return `The keys are \$\{revealText\(screen\)\}\.`;/);
    assert.match(code, /return `\$\{screen\.answerCell\} holds \$\{display\(screen\.expect\.value\)\}\.`;/);
  });

  it("prints the reference in the learner's keyboard words", () => {
    // `screen.reference` was spoken by the server in the default spelling; a reveal on a Mac has to
    // say ⌘⇧L, not Ctrl + Shift + L.
    assert.match(code, /ui\.solutionCode\.textContent = revealText\(activeScreen\(\)\);/);
    assert.match(code, /function revealText\(screen\) \{/);
    assert.match(code, /return chords\.map\(spoken\)\.join\(screen\.type === "sequence" \? ", " : " or "\);/);
  });

  it("takes the chip and the worked example away when there is no cell", () => {
    assert.match(code, /ui\.chip\.hidden = !isFormula;/);
    assert.match(code, /ui\.docsWorked\.hidden = !isFormula;/);
    // enterScreen only rewrites the docs block for a formula screen; a picture or shortcut screen
    // would print the previous screen's formula beside a question that is not about it.
    assert.match(code, /if \(isFormula\) \{\s*if \(ui\.docsCode\)/);
  });

  it("opens the bar on a screen without a cell to select", () => {
    // `stripComments` removes the comment, so the branch is read as code alone.
    assert.match(
      code,
      /if \(isPicture \|\| isKeys\) \{\s*selected = null;\s*if \(ui\.check\) ui\.check\.disabled = false;/,
    );
    assert.match(code, /ui\.input\.setAttribute\("aria-label", barLabel\(screen\)\);/);
    for (const label of ["Your answer", "Type the keys in order", "Type the shortcut"]) {
      assert.ok(code.includes(`return "${label}";`), `barLabel does not name "${label}"`);
    }
  });

  it("keeps a draft typed on a screen without a cell", () => {
    assert.match(code, /if \(screen\.type !== "formula" \|\| selected === screen\.answerCell\) draft = ui\.input\.value;/);
  });

  it("announces exhaustion once, on the third miss", () => {
    assert.equal(code.match(/lesson_exhausted/g).length, 1, "one emission site, so a retry does not re-count");
    assert.doesNotMatch(code, />= MAX_ATTEMPTS\) \{\s*if \(ui\.showAnswer\) ui\.showAnswer\.hidden = false;/);
  });

  it("re-offers the reveal on a later screen of an exhausted lesson", () => {
    // `exhausted` dedupes the event; it must not gate the button, because entering a screen hides it
    // and a learner who spent three misses on screen 1 would otherwise reach screen 2 with no way out.
    assert.match(
      code,
      /if \(screenMisses === MAX_ATTEMPTS\) \{\s*if \(ui\.showAnswer\) ui\.showAnswer\.hidden = false;\s*if \(!exhausted\) \{/,
    );
  });

  it("keeps the reveal visible on a return visit that finished with help", () => {
    // enterScreen clears `offeredSolution` on the way in, so the mount has to re-read the record
    // before it paints or a helped completion comes back looking like a clean solve.
    assert.match(code, /offeredSolution = progress\.done\[lessonId\]\.helped === true;\s*paintSolved\(\);/);
  });

  it("restores the reveal for a lesson that was already exhausted", () => {
    assert.match(code, /if \(attemptsFor\(progress, lessonId\) >= MAX_ATTEMPTS && ui\.showAnswer\) \{/);
    assert.match(code, /ui\.showAnswer\.hidden = false;/);
  });

  it("keeps the typed address out of the event buffer", () => {
    // The form says nothing is sent anywhere; an address sitting in the event queue
    // would be the one field an analytics hook could forward. The extra
    // lesson_exhausted event is intentional (it marks the third miss).
    assert.doesNotMatch(code, /track\("paywall_email"[^)]*email[^)]*\)/);
    assert.doesNotMatch(code, /track\("paywall_email"[^)]*input\.value/);
  });
});

describe("dashboard.js source", () => {
  const code = stripComments(readFileSync(join(ROOT, "legacy/src/client/dashboard.js"), "utf8"));

  it("never turns a title or a stored timestamp into markup", () => {
    for (const danger of ["innerHTML", "outerHTML", "insertAdjacentHTML", "document.write", "eval(", "new Function"]) {
      assert.equal(code.includes(danger), false, `dashboard.js must not use ${danger}`);
    }
    assert.match(code, /textContent/);
  });

  it("reads the shipped progress model instead of its own rules", () => {
    assert.match(code, /from "\.\.\/progress\/index\.js"/);
    assert.match(code, /from "\.\/state\.js"/);
  });

  it("does not teach the page a second copy of the badge labels", () => {
    // The pills the server prints and the pills the island prints must say the same thing, so the
    // label table is imported rather than retyped.
    for (const label of ["Complete", "Needs practice", "Not started"]) {
      assert.equal(code.includes(`"${label}"`), false, `${label} is retyped in the island`);
    }
    assert.match(code, /BADGE_LABELS\[/);
  });

  it("says storage is blocked instead of drawing zero progress", () => {
    // Without this, a browser that refuses localStorage reads as "0 of 16 done" — a lie about work
    // the learner may well have done.
    assert.match(code, /blocks local storage/);
    assert.match(code, /state\.blocked/);
  });

  it("arms the reset and needs a second click", () => {
    assert.match(code, /dataset\.armed === "true"/);
    assert.match(code, /setTimeout\(disarm, RESET_CONFIRM_MS\)/);
  });
});
