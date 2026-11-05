/**
 * The client's non-DOM half: progress, gating, normalisation, and the guard on
 * the payload shape. Exercise rendering is verified in the browser, not here — what is
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
  GRACE_KEY,
  PROGRESS_KEY,
  attemptsFor,
  canGrade,
  caretLine,
  completedCount,
  emptyProgress,
  emptyGrace,
  gateFor,
  graceUsed,
  grantGrace,
  isComplete,
  normaliseFormula,
  parseGrace,
  parsePayload,
  parseProgress,
  registerAttempt,
  registerCompletion,
  serializeProgress,
} from "../legacy/src/client/state.js";
import { rewardFrom, rewardLine } from "../legacy/src/client/reward.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

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

  it("keeps the local unlock across a round-trip, and only for a real true", () => {
    assert.equal(emptyProgress().unlocked, false);
    assert.equal(parseProgress('{"unlocked":"true"}').unlocked, false);
    assert.equal(parseProgress('{"unlocked":1}').unlocked, false);
    assert.equal(parseProgress('{"unlocked":true}').unlocked, true);
    const unlocked = { ...emptyProgress(), unlocked: true };
    assert.equal(parseProgress(serializeProgress(unlocked)).unlocked, true);
    assert.equal(serializeProgress(emptyProgress()).includes('"unlocked":false'), true);
  });

  it("uses the documented storage keys", () => {
    assert.equal(PROGRESS_KEY, "es.progress");
  });
});

describe("gating", () => {
  it("opens the free exercises wherever they sit, and walls the rest", () => {
    // The free ten are a curated list, not the first ten: a free lesson sits at number 1 and at 40,
    // and both are open. `number` decides nothing about free.
    assert.equal(gateFor({ free: true, number: 1 }), "open");
    assert.equal(gateFor({ free: true, number: 40 }), "open");
    assert.equal(gateFor({ free: false, number: 5, promptAt: 4 }), "paywall");
  });

  it("prompts on the one paid exercise the track nominates, not on the first paid one", () => {
    const track = { free: false, number: 5, promptAt: 5 };
    assert.equal(gateFor(track), "prompt");
    assert.equal(gateFor({ free: false, number: 6, promptAt: 5 }), "paywall");
  });

  it("needs the prompt position to make the prompt, so an entry without one walls", () => {
    // `track.promptAt` is config, read from `promptLesson`. A payload that arrives without it must
    // fall back to the wall rather than to the free pass.
    assert.equal(gateFor({ free: false, number: 5 }), "paywall");
    assert.equal(gateFor({ free: false, number: 5, promptAt: "5" }), "paywall");
    assert.equal(gateFor({ free: false, number: 5, promptAt: null }), "paywall");
  });

  it("stops prompting once the pass is spent, which the caller checks, not this rule", () => {
    // `gateFor` has no memory: the once-only pass is `graceUsed`, and the exercise page asks both.
    assert.equal(gateFor({ free: false, number: 5, promptAt: 5 }), "prompt");
  });
});

describe("grace", () => {
  it("starts empty and remembers one exercise per prompt", () => {
    assert.deepEqual(emptyGrace(), { v: 1, used: [] });
    assert.equal(graceUsed(emptyGrace(), "05-sumif-region"), false);
    const once = grantGrace(emptyGrace(), "05-sumif-region");
    assert.equal(graceUsed(once, "05-sumif-region"), true);
    assert.equal(graceUsed(once, "07-vlookup-exact"), false);
  });

  it("is idempotent, so a double click does not spend a second pass", () => {
    const once = grantGrace(emptyGrace(), "05-sumif-region");
    assert.deepEqual(grantGrace(once, "05-sumif-region"), once);
  });

  it("treats a corrupt or foreign record as empty", () => {
    assert.deepEqual(parseGrace("not json"), emptyGrace());
    assert.deepEqual(parseGrace(""), emptyGrace());
    assert.deepEqual(parseGrace('{"v":1,"used":5}'), emptyGrace());
    assert.deepEqual(parseGrace('{"v":1,"used":["a",3,null,"b"]}'), { v: 1, used: ["a", "b"] });
    assert.equal(parseGrace(undefined).used.length, 0);
  });

  it("does not reach for a key the progress already owns", () => {
    assert.equal(GRACE_KEY, "es.grace");
    assert.notEqual(GRACE_KEY, PROGRESS_KEY);
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

describe("the reward line", () => {
  it("reads only what the server actually paid", () => {
    assert.deepEqual(rewardFrom({ ok: true, points: { awarded: 12, total: 56 }, streak: { current: 3, longest: 9 } }), {
      points: { awarded: 12 },
      streak: { current: 3 },
    });
    // A batch the server refused, replayed, or paid nothing for has no reward to report.
    for (const body of [
      null,
      "ok",
      {},
      { ok: false, error: "unconfigured" },
      { ok: true, points: null, streak: null },
      { ok: true, points: { awarded: 0 }, streak: { current: 0 } },
      { ok: true, points: { awarded: "twelve" }, streak: { current: Number.NaN } },
    ]) {
      assert.equal(rewardFrom(body), null, `${JSON.stringify(body)} must report nothing`);
    }
  });

  it("names the delta and the streak in that order", () => {
    assert.equal(rewardLine({ points: { awarded: 12 }, streak: { current: 3 } }), "+12 points · 3-day streak");
    // A second lesson on the same day repeats the streak rather than claiming another day of it.
    assert.equal(rewardLine({ points: { awarded: 4 }, streak: { current: 1 } }), "+4 points · 1-day streak");
    assert.equal(rewardLine({ points: { awarded: 1 }, streak: null }), "+1 point");
    assert.equal(rewardLine({ points: null, streak: { current: 7 } }), "7-day streak");
    assert.equal(rewardLine({ points: null, streak: null }), "");
    assert.equal(rewardLine(null), "");
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
      "gate_view",
      "track_unlock",
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

  it("reports that a note was filed without reporting the note", () => {
    const feedbackCode = stripComments(readFileSync(join(ROOT, "legacy/src/client/feedback.js"), "utf8"));
    assert.match(feedbackCode, /sink\.emit\("feedback_sent"/, "the dialog never reports itself");
    // A note is free text: it can hold a name, an employer, a password typed into the wrong box. The
    // event carries how long it was, never what it said.
    const emit = feedbackCode.slice(feedbackCode.indexOf('sink.emit("feedback_sent"'));
    const props = emit.slice(emit.indexOf("{"), emit.indexOf("}"));
    assert.match(props, /mood:/);
    assert.match(props, /chars: entry\.text\.length/, "the length is the only thing said about the note");
    assert.equal(/\btext:/.test(props), false, "the note itself is in the event");
    assert.equal(/value/.test(props), false, "a field's value is in the event");
  });

  it("reads the shared clock instead of timing the exercise itself", () => {
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
    assert.match(
      code,
      /const base = \{ id: lessonId, elapsed: seconds\(\), screen_elapsed: screenSeconds\(\), \.\.\.extra \};/,
    );
  });

  it("stamps the per-screen time too, and restarts it on every screen entry", () => {
    assert.match(
      code,
      /function screenSeconds\(\) \{\s*return Math\.max\(0, Math\.round\(\(clock\.elapsedMs\(\) - screenStartedMs\) \/ 1000\)\);/,
    );
    // The hint and the reveal are the two hand-written working events that carry it; the loop's four
    // get it from `base`.
    assert.equal(code.match(/screen_elapsed: screenSeconds\(\)/g)?.length, 3);
    assert.match(
      code,
      /screenMisses = 0;\s*offeredSolution = false;\s*screenStartedMs = clock\.elapsedMs\(\);/,
    );
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
      /if \(screen\.type === "picture" \|\| screen\.type === "workbook"\) return gradeAnswer\(screen, raw\);\s*if \(screen\.type === "chord" \|\| screen\.type === "sequence"\) return gradeKeys\(screen, raw\);\s*return grade\(screen, raw\);/,
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
    // A picture or workbook screen has no cell to name, so the line reads the answer instead of
    // "B7 holds 21.5."; a shortcut screen names the shortcut in this keyboard's words.
    assert.match(
      code,
      /if \(screen\.type === "picture" \|\| screen\.type === "workbook"\) return `The answer is \$\{display\(screen\.expect\.value\)\}\.`;/,
    );
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
      /if \(isPicture \|\| isKeys \|\| isWorkbook\) \{\s*selected = null;\s*if \(ui\.check\) ui\.check\.disabled = false;/,
    );
    assert.match(code, /ui\.input\.setAttribute\("aria-label", barLabel\(screen\)\);/);
    for (const label of ["Your answer", "Type the keys in order", "Type the shortcut"]) {
      assert.ok(code.includes(`return "${label}";`), `barLabel does not name "${label}"`);
    }
  });

  it("keeps a draft typed on a screen without a cell", () => {
    assert.match(code, /if \(screen\.type !== "formula" \|\| selected === screen\.answerCell\) draft = ui\.input\.value;/);
  });

  it("announces exhaustion once, on the miss that exhausts the screen", () => {
    assert.equal(code.match(/lesson_exhausted/g).length, 1, "one emission site, so a retry does not re-count");
    assert.doesNotMatch(code, />= revealAfter\) \{\s*if \(ui\.showAnswer\) ui\.showAnswer\.hidden = false;/);
  });

  it("reads how many misses open the answer from the track file", () => {
    // The number is content, not a constant: a lesson that wants more rope changes `track.json`.
    assert.match(code, /const revealAfter = Number\.isInteger\(payload\.track\.showAnswerAfter\)/);
    assert.match(code, /: DEFAULT_REVEAL_AFTER;/);
    assert.match(code, /const DEFAULT_REVEAL_AFTER = 3;/);
    assert.doesNotMatch(code, /MAX_ATTEMPTS/);
    // The prose the learner reads counts against the same number the gate uses.
    assert.match(code, /return `Attempt \$\{screenMisses\} of \$\{revealAfter\}\.`;/);
    assert.match(code, /return `\$\{screenMisses\} attempts on this screen\. The reference answer is available below\.`;/);
  });

  it("falls back to the screen's general hint when the failing rule has no line of its own", () => {
    // The grader files a hint per rule; a screen with only `hints.value` must still say something
    // rather than leave the previous screen's hint standing.
    assert.match(code, /const hint = result\.hint \|\| activeScreen\(\)\.hints\.value \|\| "";/);
    assert.match(code, /if \(hint\) ui\.hintText\.textContent = hint;/);
  });

  it("re-offers the reveal on a later screen of an exhausted lesson", () => {
    // `exhausted` dedupes the event; it must not gate the button, because entering a screen hides it
    // and a learner who spent their misses on screen 1 would otherwise reach screen 2 with no way out.
    assert.match(
      code,
      /if \(screenMisses === revealAfter\) \{\s*if \(ui\.showAnswer\) ui\.showAnswer\.hidden = false;\s*if \(!exhausted\) \{/,
    );
  });

  it("keeps the reveal visible on a return visit that finished with help", () => {
    // enterScreen clears `offeredSolution` on the way in, so the mount has to re-read the record
    // before it paints or a helped completion comes back looking like a clean solve.
    assert.match(code, /offeredSolution = progress\.done\[lessonId\]\.helped === true;\s*paintSolved\(\);/);
  });

  it("restores the reveal for a lesson that was already exhausted", () => {
    assert.match(code, /if \(attemptsFor\(progress, lessonId\) >= revealAfter && ui\.showAnswer\) \{/);
    assert.match(code, /ui\.showAnswer\.hidden = false;/);
  });

  it("keeps the typed address out of the event buffer", () => {
    // The form says nothing is sent anywhere; an address sitting in the event queue
    // would be the one field an analytics hook could forward. The extra
    // lesson_exhausted event is intentional (it marks the third miss).
    assert.doesNotMatch(code, /track\("paywall_email"[^)]*email[^)]*\)/);
    assert.doesNotMatch(code, /track\("paywall_email"[^)]*input\.value/);
  });

  it("prompts on the nominated paid exercise and lets the reader through once", () => {
    // The boundary is `gateFor`'s verdict, not a second copy of the rule: an exercise that hardcoded
    // `number === 11` would keep prompting after `track.json` moved the free set.
    assert.match(code, /const verdict = gateFor\(payload\.track\);/);
    assert.match(code, /if \(verdict === "prompt"\) \{\s*if \(!graceUsed\(grace, lessonId\)\) return \{ kind: "prompt" \};/);
    assert.match(code, /"data-gate": blocked\.kind/);
    // The pass is written to the store the trial and the progress already use, and it is recorded
    // as an event so the funnel can tell a prompted reader from a walled one.
    assert.match(code, /grace = grantGrace\(grace, lessonId\);/);
    assert.match(code, /store\.write\(GRACE_KEY, JSON\.stringify\(grace\)\);/);
    assert.match(code, /track\("grace_start", \{ id: lessonId, number: payload\.track\.number \}\);/);
    assert.match(code, /track\("gate_view", \{ id: lessonId, reason: "prompt", after: null \}\);/);
  });

  it("asks the paywall before the order gate, so the free tour is walkable", () => {
    // Two locks can stand in front of an exercise. The paywall is the one that knows whether the reader
    // may be here at all; the order gate only makes sense inside the paid track, whose sequence the free
    // ten are not a prefix of. Reading them in the other order asked a free exercise for its paid
    // predecessor ("exercise 23"), which nobody who follows `/start` has finished.
    const gate = code.slice(code.indexOf("function blockingGate()"), code.indexOf("function openAfterGate"));
    const verdict = gate.indexOf("gateFor(payload.track)");
    const order = gate.indexOf("canStart(");
    assert.ok(verdict > -1 && order > -1, "both locks are asked in blockingGate");
    assert.ok(verdict < order, "the paywall verdict comes first");
  });

  it("points both walls at the offer page", () => {
    // A wall with nowhere to go is a dead end: the prompt and the pre-launch gate both name the price page.
    assert.match(code, /class: "btn", href: "\/pricing", text: "See what the rest costs"/);
    // The hard wall buys one plan, so the other two are one link away rather than unreachable.
    assert.match(code, /el\("a", \{ href: "\/pricing", text: "pricing page" \}\)/);
    // And a returning buyer is pointed at the account rather than told to buy again.
    assert.match(code, /const account = payload\.paywall\?\.account;/);
    assert.match(code, /Already bought it\?/);
  });

  it("says storage is blocked on the exercise page instead of losing the save in silence", () => {
    // `createStore().write` still swallows a quota/private-mode throw — that is the recorded
    // behaviour, not something to change here. What was missing is the warning: the dashboard
    // owns the sentence, and the exercise must say the same one once the probe has failed.
    const sentence =
      "This browser blocks local storage, so nothing is saved. The exercises still work, but this page cannot remember them.";
    const dashboard = stripComments(readFileSync(join(ROOT, "legacy/src/client/dashboard.js"), "utf8"));
    assert.ok(dashboard.includes(sentence), "the dashboard sentence moved; update both pages together");
    assert.ok(code.includes(sentence), "the exercise does not repeat the dashboard's blocked-storage sentence");
    assert.match(code, /const storage = safeStorage\(\);\s*const store = createStore\(storage\);\s*if \(!storage\) mountStorageWarning\(\);/);
    assert.match(code, /rail\.querySelector\("\.rail-count"\)/);
    // The note is prose, not a count. It shares the rail meta typography through `.rail-note`;
    // borrowing `.rail-count` would tell the stylesheet (and any reader) a false story.
    assert.match(code, /class: "rail-note",/);
    assert.equal(/class: "rail-count",/.test(code), false);
    const railCss = readFileSync(join(ROOT, "legacy/src/styles/components.css"), "utf8");
    assert.match(railCss, /\.rail-count,\s*\.rail-note\s*\{/);
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
