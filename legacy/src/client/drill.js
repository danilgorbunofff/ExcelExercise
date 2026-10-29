/**
 * The drill client. The HTML is already on the page: the sheet, the formula bar, the
 * feedback region and the progress rail are server-rendered, and this module only
 * adds behaviour and fills those regions in. Nothing here builds markup from content
 * with innerHTML — the grader echoes learner input inside its messages, so every
 * string reaches the DOM through textContent.
 */

import { grade, gradeAnswer } from "../grader/index.js";
import { chordText, labelsOf, matchesEvent, matchesTyped, matchesTypedSteps, parseChord, parsePress, uncapturable } from "../keys/index.js";
import { MOVE_KEYS, gridModel, moveSelection } from "../sheet/index.js";
import {
  createClock,
  createSession,
  currentScreen,
  emitAll,
  isComplete as loopComplete,
  recordVerdict,
} from "../session/index.js";
import { createSink } from "../session/index.js";
import {
  PROGRESS_KEY,
  TRIAL_KEY,
  attemptsFor,
  canGrade,
  caretLine,
  completedCount,
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
  trialDaysLeft,
  validEmail,
} from "./state.js";

const MAX_ATTEMPTS = 3;

const RULE_LABEL = {
  syntax: "The formula cannot be read",
  require: "Wrong function",
  forbid: "Function ruled out",
  "require-ref": "Missing reference",
  matchType: "Wrong argument",
  value: "Not the answer",
  error: "Excel error",
  keys: "Wrong keys",
  internal: "Checker error",
};

const globalObject = globalThis;

/**
 * Funnel events go through the shared sink, which owns the vocabulary and the envelope
 * and refuses names it does not know. Nothing is shipped anywhere yet: the buffer is
 * what the analytics collector will read once phase 10 wires a transport.
 */
const sink = createSink({
  write: (event) => {
    if (!Array.isArray(globalObject.__esEvents)) globalObject.__esEvents = [];
    globalObject.__esEvents.push(event);
    if (typeof globalObject.console?.debug === "function") {
      globalObject.console.debug(`[es] ${event.type}`, event);
    }
  },
  context: () => ({ route: globalObject.location?.pathname ?? "" }),
});

function track(type, props = {}) {
  return sink.emit(type, props);
}

/** Element builder: text is always a text node, so grader output cannot become markup. */
function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else node.setAttribute(key, value === true ? "" : String(value));
  }
  for (const child of children) node.append(typeof child === "string" ? document.createTextNode(child) : child);
  return node;
}

function safeStorage() {
  try {
    const storage = globalObject.localStorage;
    const probe = `${PROGRESS_KEY}.probe`;
    storage.setItem(probe, "1");
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
}

function createStore(storage) {
  return {
    read(key) {
      try {
        return storage ? storage.getItem(key) : null;
      } catch {
        return null;
      }
    },
    write(key, value) {
      try {
        if (storage) storage.setItem(key, value);
      } catch {
        /* private mode: the drill still works, progress just does not persist */
      }
    },
  };
}

function display(value) {
  if (value === null || value === undefined) return "";
  return String(value);
}

/* ── Keys ────────────────────────────────────────────────────────────────── */

/**
 * Which keyboard the labels are written for. `userAgentData.platform` is the standard field when a
 * browser has it and `navigator.platform` is the one they all still ship; both are empty in a
 * non-browser runner, which reads as "not a Mac" — the Ctrl/Alt spelling.
 */
function detectOs() {
  const nav = globalObject.navigator;
  const platform = nav?.userAgentData?.platform ?? nav?.platform ?? "";
  return /mac|iphone|ipad|ipod/i.test(platform) ? "mac" : "other";
}

const OS = detectOs();

/**
 * Can this page see a key press at all? A shortcut screen leans on `keydown` reaching the document,
 * and a browser that swallows it would leave the learner pressing at a page that never answers. One
 * synthetic event answers the question before the copy promises the keyboard works.
 */
function canReadKeys() {
  if (typeof globalObject.KeyboardEvent !== "function" || typeof document === "undefined") return false;
  let seen = false;
  const probe = () => {
    seen = true;
  };
  document.addEventListener("keydown", probe, { capture: true, once: true });
  try {
    document.dispatchEvent(new globalObject.KeyboardEvent("keydown", { key: "Unidentified", bubbles: true, cancelable: true }));
  } catch {
    return false;
  } finally {
    document.removeEventListener("keydown", probe, { capture: true });
  }
  return seen;
}

/** The chord an event carries, in the words of the asker's keyboard. */
function spoken(chord) {
  return chordText(chord, { os: OS });
}

/** A press the learner aimed at the drill rather than at the page: a chord, or a named key. */
const NAMED_PRESS = /^(F[1-9]|F1[0-2]|Tab|Enter|Delete|Backspace|Insert|Home|End|PageUp|PageDown|ArrowUp|ArrowDown|ArrowLeft|ArrowRight)$/;

/**
 * The keys of one shortcut screen, parsed. A chord screen lists alternative spellings of one
 * shortcut and a sequence screen lists the presses of one run, so both are just chords in a row.
 */
function chordsOf(screen) {
  const field = screen.type === "chord" ? screen.keys : screen.type === "sequence" ? screen.steps : null;
  if (!Array.isArray(field)) return [];
  const parse = screen.type === "chord" ? parseChord : parsePress;
  const chords = [];
  for (const entry of field) {
    try {
      chords.push(parse(entry));
    } catch {
      // Content the schema let through but the model cannot read: grade nothing rather than throw.
      return [];
    }
  }
  return chords;
}

/** A shortcut in the learner's keyboard words: one of the alternatives, or the run in order. */
function revealText(screen) {
  const chords = chordsOf(screen);
  if (chords.length === 0) return display(screen.reference);
  return chords.map(spoken).join(screen.type === "sequence" ? ", " : " or ");
}

/** Replace a press's caps with this platform's labels — the server wrote the default spelling. */
function relabelCaps(press, chord) {
  press.textContent = "";
  labelsOf(chord, { os: OS }).forEach((label, index) => {
    if (index > 0) press.append(el("span", { class: "key-plus", "aria-hidden": "true", text: "+" }));
    press.append(el("kbd", { class: "keycap", text: label }));
  });
  press.setAttribute("aria-label", spoken(chord));
}

/* ── Lesson page ─────────────────────────────────────────────────────────── */

function mountDrill(payloadNode) {
  let payload;
  try {
    payload = parsePayload(payloadNode.textContent);
  } catch (error) {
    console.warn(`[es] ${error.message}`);
    return;
  }

  const ui = {
    card: document.getElementById("drill"),
    screens: document.getElementById("drill-screens"),
    position: document.getElementById("screen-position"),
    answerNote: document.getElementById("screen-answer-cell"),
    docsCode: document.getElementById("docs-example-code"),
    docsValue: document.getElementById("docs-example-value"),
    docsReference: document.getElementById("docs-reference"),
    docsWorked: document.getElementById("docs-worked"),
    bar: document.getElementById("formula-bar"),
    chip: document.getElementById("ref-chip"),
    input: document.getElementById("formula"),
    check: document.getElementById("check"),
    feedback: document.getElementById("feedback"),
    feedbackHead: document.getElementById("feedback-head"),
    feedbackBody: document.getElementById("feedback-body"),
    hint: document.getElementById("hint"),
    hintText: document.getElementById("hint-text"),
    hintRow: document.querySelector(".hint-row"),
    showAnswer: document.getElementById("show-answer"),
    solution: document.getElementById("solution"),
    solutionCode: document.getElementById("solution-code"),
    railCount: document.getElementById("progress-count"),
    railFill: document.getElementById("progress-fill"),
  };

  if (!ui.screens || !ui.input || !ui.check || !ui.feedback) {
    console.warn("[es] the page is missing part of the drill mount contract");
    return;
  }

  const store = createStore(safeStorage());
  let progress = parseProgress(store.read(PROGRESS_KEY));
  let trial = parseTrial(store.read(TRIAL_KEY));

  const lessonId = payload.id;
  const total = payload.track.total || 1;
  const screenCount = payload.screens.length;

  // A lesson is complete once every screen has been answered correctly: one screen is
  // worth the whole cap, four screens a quarter each. The loop therefore ends on the last
  // screen of an honest run, and only recycles when a screen was skipped — which is what
  // "answer them all" means, and what the single-screen drill did before there were screens.
  let loop = createSession({
    screens: screenCount,
    scoring: { correct: Math.ceil(100 / screenCount), incorrect: 0, cap: 100 },
  });

  // Wall-clock time on this lesson. The budget is not enforced — a zero-signup reader whose
  // progress is in their own browser loses nothing by working on — so the clock is read for the
  // funnel only, and pausing it keeps a background tab from inflating the numbers.
  const clock = createClock();

  let active = 0;
  let cells = [];
  let byKey = new Map();
  let targetCell = null;
  // The sheet the active screen renders, as data: what `onGridKey` moves across. Null on a screen
  // with no grid, which has nothing to select.
  let model = null;

  // Answered once, at mount: a page that cannot see a key press cannot offer the keyboard at all,
  // and the shortcut screens say so instead of waiting for presses that never arrive.
  const readable = canReadKeys();

  let selected = payload.screens[0].answerCell;
  // How far into a sequence screen's run the learner is. A chord screen is one press, so it is only
  // ever read on a sequence screen, where the steps light up as they land.
  let keyStep = 0;
  let keysLive = false;
  let draft = "";
  let started = false;
  let screenMisses = 0;
  let exhausted = false;
  let solved = isComplete(progress, lessonId);
  let offeredSolution = solved && progress.done[lessonId].helped === true;

  /** The first keystroke on the lesson, once, whichever door it came through. */
  function markStarted() {
    if (started) return;
    started = true;
    track("drill_start", { id: lessonId, elapsed: seconds() });
  }

  /** Whole seconds on the drill, the unit the funnel reports. */
  function seconds() {
    return Math.round(clock.elapsedMs() / 1000);
  }

  /** The screen being answered. Everything that used to read a single `payload.screen` reads this. */
  function activeScreen() {
    return payload.screens[active];
  }

  function activePanels() {
    return ui.screens ? [...ui.screens.children] : [];
  }

  function activeGrid() {
    const panel = activePanels()[active];
    return panel ? panel.querySelector("table[role=grid]") : null;
  }

  function keysPanel() {
    const panel = activePanels()[active];
    return panel ? panel.querySelector(".keys-panel") : null;
  }

  function saveProgress() {
    store.write(PROGRESS_KEY, serializeProgress(progress));
  }

  function paintProgress() {
    const count = completedCount(progress);
    if (ui.railCount) ui.railCount.textContent = `${count} of ${total}`;
    if (ui.railFill) {
      ui.railFill.style.width = `${Math.round((count / total) * 100)}%`;
      ui.railFill.dataset.full = String(count === total);
    }
    for (const item of document.querySelectorAll(".rail-item[data-lesson]")) {
      const done = isComplete(progress, item.dataset.lesson);
      item.classList.toggle("is-done", done);
      const tick = item.querySelector(".rail-tick");
      if (tick) tick.hidden = !done;
    }
  }

  /**
   * What the bar holds for the answer cell. Never the cell's value: Check would grade
   * it, so a solved lesson would answer "not accepted" to its own answer.
   */
  function barText() {
    if (!solved) return draft;
    const screen = activeScreen();
    if (screen.type === "chord" || screen.type === "sequence") return draft || revealText(screen);
    return draft || screen.reference || "";
  }

  function selectCell(key, { focus = false } = {}) {
    const cell = byKey.get(key);
    if (!cell) return;
    selected = key;
    for (const node of cells) {
      const isSelected = node === cell;
      node.setAttribute("aria-selected", String(isSelected));
      node.tabIndex = isSelected ? 0 : -1;
    }
    if (focus) cell.focus();

    const grid = activeGrid();
    if (grid) {
      for (const head of grid.querySelectorAll(".col-head.is-active, .row-head.is-active")) {
        head.classList.remove("is-active");
      }
      const headRow = grid.tHead?.rows[0];
      if (headRow) headRow.children[cell.cellIndex]?.classList.add("is-active");
    }
    cell.closest("tr")?.querySelector(".row-head")?.classList.add("is-active");

    const onAnswer = key === activeScreen().answerCell;
    if (ui.chip) ui.chip.textContent = key;
    // A disabled input cannot be submitted, and a disabled button cannot submit it.
    if (ui.check) ui.check.disabled = !onAnswer;
    if (onAnswer) {
      ui.input.disabled = false;
      ui.input.value = barText();
      ui.input.setAttribute("aria-label", `Your formula for ${activeScreen().answerCell}`);
    } else {
      ui.input.disabled = true;
      ui.input.value = display(cell.textContent);
      ui.input.setAttribute("aria-label", `Value of ${key}`);
    }
  }

  /**
   * Movement is decided by the sheet model, not by the DOM: the addresses an arrow can reach are the
   * ones the page rendered, so a preview table or a stray `[data-cell]` cannot become selectable.
   */
  function onGridKey(event) {
    if (!MOVE_KEYS.has(event.key)) return;
    event.preventDefault();
    const nextKey = model ? moveSelection(selected, event.key, { model }) : null;
    if (nextKey) selectCell(nextKey, { focus: true });
  }

  function clearFeedback() {
    ui.feedback.className = "feedback";
    ui.feedbackHead.textContent = "";
    ui.feedbackBody.textContent = "";
    for (const extra of ui.feedback.querySelectorAll(".feedback-caret, .feedback-meta, .next-cta")) extra.remove();
  }

  function showFeedback({ state, head, body, caret = "", meta = "", next = null }) {
    clearFeedback();
    ui.feedback.classList.add(state, "is-live");
    ui.feedbackHead.textContent = head;
    ui.feedbackBody.textContent = body;
    if (caret) ui.feedback.append(el("pre", { class: "feedback-caret", text: caret }));
    if (meta) ui.feedback.append(el("p", { class: "feedback-meta", text: meta }));
    if (next) {
      const link = el("a", { class: "next-cta", href: next.path }, [document.createTextNode(next.label)]);
      link.append(el("svg", { class: "icon", width: "14", height: "14", "aria-hidden": "true" }));
      ui.feedback.append(link);
    }
    keepVerdictInView();
  }

  // On a phone the verdict can be written below the fold. Move the page — never an
  // ancestor's scroll box — just far enough to show it.
  function keepVerdictInView() {
    const box = ui.feedback.getBoundingClientRect();
    const margin = 16;
    if (box.top >= margin && box.bottom <= window.innerHeight - margin) return;
    const delta = box.top < margin ? box.top - margin : box.bottom - window.innerHeight + margin;
    const behavior = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    window.scrollBy({ top: delta, behavior });
  }

  /** Where a keystroke should land: the shortcut panel on a shortcut screen, the bar otherwise. */
  function focusAnswer() {
    const screen = activeScreen();
    if (screen.type === "chord" || screen.type === "sequence") keysPanel()?.focus({ preventScroll: true });
    else ui.input.focus({ preventScroll: true });
  }

  function setHint() {
    const text = activeScreen().hints?.value ?? "";
    ui.hintText.textContent = text;
    if (ui.hint) ui.hint.hidden = !text;
    if (!text) ui.hintText.hidden = true;
  }

  function markTarget(kind) {
    // A wrong retry must not erase the recorded answer on a solved lesson.
    if (!targetCell || solved) return;
    targetCell.classList.toggle("cell-correct", kind === "correct");
    targetCell.classList.toggle("cell-wrong", kind === "wrong");
  }

  function paintSolved() {
    solved = true;
    const screen = activeScreen();
    if (targetCell) {
      targetCell.textContent = display(screen.expect.value);
      targetCell.classList.remove("cell-wrong");
      targetCell.classList.add("cell-correct");
      targetCell.setAttribute(
        "aria-label",
        `Answer cell ${screen.answerCell}, ${offeredSolution ? "shown" : "correct"}: ${display(screen.expect.value)}`,
      );
    }
    if (offeredSolution) ui.solution.hidden = false;
    paintProgress();
  }

  /** Put one screen on the page and point the bar, the docs and the hint at it. */
  function enterScreen(position, { focus = false } = {}) {
    active = position;
    activePanels().forEach((panel, index) => {
      panel.hidden = index !== position;
    });
    const screen = activeScreen();
    cells = [...(activeGrid()?.querySelectorAll("[role=gridcell]") ?? [])];
    byKey = new Map(cells.map((cell) => [cell.dataset.cell, cell]));
    targetCell = byKey.get(screen.answerCell) ?? null;
    model = screen.grid ? gridModel({ grid: screen.grid, answerCell: screen.answerCell }) : null;

    draft = "";
    screenMisses = 0;
    offeredSolution = false;

    clearFeedback();
    ui.solution.hidden = true;
    ui.solution.classList.remove("is-live");
    ui.hintText.textContent = "";
    ui.hintText.hidden = true;
    if (ui.hint) {
      ui.hint.hidden = true;
      ui.hint.setAttribute("aria-expanded", "false");
    }
    if (ui.showAnswer) ui.showAnswer.hidden = true;
    if (ui.position) ui.position.textContent = `screen ${position + 1} of ${screenCount} · `;
    const isFormula = screen.type === "formula";
    const isPicture = screen.type === "picture";
    const isKeys = screen.type === "chord" || screen.type === "sequence";
    // A workbook screen ships a file and asks what a cell holds, so it answers in the bar like a
    // picture screen and has no keys to press and no cell to select.
    const isWorkbook = screen.type === "workbook";
    // The target chip names a cell; a picture screen answers in words and a shortcut screen in keys,
    // so it goes dark and the note under the body says where the answer goes instead. The docs
    // worked example is a formula, so it steps aside on both — the client puts it back for the next
    // formula screen.
    if (ui.answerNote) {
      ui.answerNote.textContent = isFormula ? screen.answerCell : isPicture || isWorkbook ? "the bar" : "the keys";
    }
    if (ui.chip) {
      ui.chip.hidden = !isFormula;
      ui.chip.textContent = isFormula ? screen.answerCell : "";
    }
    if (ui.docsWorked) ui.docsWorked.hidden = !isFormula;
    if (isFormula) {
      if (ui.docsCode) ui.docsCode.textContent = screen.reference;
      if (ui.docsReference) ui.docsReference.textContent = screen.reference;
      if (ui.docsValue) ui.docsValue.textContent = display(screen.expect.value);
    }

    setHint();
    if (isPicture || isKeys || isWorkbook) {
      selected = null;
      // Nothing to select, so nothing can disable the bar: every keystroke is an attempt at the answer.
      if (ui.check) ui.check.disabled = false;
      ui.input.disabled = false;
      ui.input.value = draft;
      ui.input.setAttribute("aria-label", barLabel(screen));
    } else {
      selectCell(screen.answerCell, { focus });
      return;
    }

    if (isKeys) {
      keyStep = 0;
      // A sequence of presses needs every one of them to reach the page; a chord screen lists
      // alternatives, so one press the browser will deliver is enough to offer the keyboard.
      const chords = chordsOf(screen);
      const blocked = uncapturable(chords, { os: OS }).length;
      keysLive = readable && chords.length > 0 && (screen.type === "sequence" ? blocked === 0 : blocked < chords.length);
      paintKeys(screen);
      if (focus) keysPanel()?.focus({ preventScroll: true });
    } else if (focus) {
      ui.input.focus();
    }
  }

  /** What the bar is for on this screen: a cell, words about a picture or a workbook, or a shortcut. */
  function barLabel(screen) {
    if (screen.type === "picture" || screen.type === "workbook") return "Your answer";
    if (screen.type === "sequence") return "Type the keys in order";
    if (screen.type === "chord") return "Type the shortcut";
    return `Your formula for ${screen.answerCell}`;
  }

  /**
   * Dress a shortcut screen for this keyboard: the server wrote the default labels, and a Mac reads
   * ⌘⌃⌥⇧ instead of Ctrl/Alt/Shift. A sequence also shows how far into the run the presses have got,
   * and the note says whether the page can hear the keys at all.
   */
  function paintKeys(screen) {
    const panel = keysPanel();
    if (!panel) return;
    const chords = chordsOf(screen);
    for (const press of panel.querySelectorAll("[data-press]")) {
      const chord = chords[Number(press.dataset.press)];
      if (chord) relabelCaps(press, chord);
    }
    for (const step of panel.querySelectorAll(".keys-step[data-step]")) {
      step.toggleAttribute("data-done", Number(step.dataset.step) < keyStep);
    }
    const note = panel.querySelector(".keys-note");
    if (note) note.textContent = keysNote(screen);
  }

  function keysNote(screen) {
    const run = screen.type === "sequence";
    if (!keysLive) {
      return run
        ? "This browser will not pass these keys to the page. Type the keys in the bar, in order, separated by commas."
        : "This browser will not pass these keys to the page. Type the shortcut in the bar instead.";
    }
    return run ? "Press the keys in order. Escape starts the run again." : "Press the shortcut, or type it in the bar.";
  }

  /** One graded answer through the score loop. The caller emits what comes back. */
  function verdict(ok) {
    const result = recordVerdict(loop, ok);
    loop = result.session;
    return result.events;
  }

  /**
   * The loop's events, stamped with what only the page knows: which lesson, whether the answer was
   * the reference one, and how much of the track is done. The loop's own props win a collision.
   */
  function emitLoop(events, extra = {}) {
    const base = { id: lessonId, elapsed: seconds(), ...extra };
    emitAll({ emit: (type, props) => sink.emit(type, { ...base, ...props }) }, events);
  }

  function successLabel(missed) {
    if (missed === 0) return "Solved on the first attempt.";
    return `Solved after ${missed} ${missed === 1 ? "wrong attempt" : "wrong attempts"}.`;
  }

  // Attempts are counted per screen: three misses on this screen open the reference answer,
  // and the next screen starts with a clean three even if the lesson kept a longer tally.
  function attemptLabel() {
    if (screenMisses >= MAX_ATTEMPTS) {
      return `${screenMisses} attempts on this screen. The reference answer is available below.`;
    }
    return `Attempt ${screenMisses} of ${MAX_ATTEMPTS}.`;
  }

  /** What the learner reads once a screen is right, whichever kind of screen it was. */
  function solvedLine(screen) {
    if (screen.type === "picture" || screen.type === "workbook") return `The answer is ${display(screen.expect.value)}.`;
    if (screen.type === "chord") return `The shortcut is ${revealText(screen)}.`;
    if (screen.type === "sequence") return `The keys are ${revealText(screen)}.`;
    return `${screen.answerCell} holds ${display(screen.expect.value)}.`;
  }

  /**
   * The typed fallback for a shortcut, in the shape `grade()` returns. A learner whose browser eats
   * the keys, or who would rather spell the shortcut than press it, types what they would press —
   * and it is graded as forgivingly as a spelling test: `Ctrl+Shift+L`, `cmd shift l` and
   * `control-shift-l` are one answer.
   */
  function gradeKeys(screen, raw) {
    const chords = chordsOf(screen);
    const ok =
      screen.type === "sequence"
        ? matchesTypedSteps(raw, chords)
        : chords.some((chord) => matchesTyped(raw, chord));
    if (ok) return { ok: true, rule: "correct", message: "Correct.", hint: "", value: raw, expected: null, code: null, position: null };
    return {
      ok: false,
      rule: "keys",
      message:
        screen.type === "sequence"
          ? "That is not the sequence. Type every press in order, separated by commas, like Alt, H, O."
          : "That is not the shortcut. Type the keys that are held, then the key, like Ctrl + Shift + L.",
      hint: screen.hints?.value ?? "",
      value: raw,
      expected: null,
      code: null,
      position: null,
    };
  }

  /**
   * The screen router: one grading call per screen type, in one place. A registry would need
   * something to register; with four types this switch is the whole of it. A picture screen and a
   * workbook screen are both graded by their list of accepted answers.
   */
  function gradeScreen(screen, raw) {
    if (screen.type === "picture" || screen.type === "workbook") return gradeAnswer(screen, raw);
    if (screen.type === "chord" || screen.type === "sequence") return gradeKeys(screen, raw);
    return grade(screen, raw);
  }

  /**
   * A press on a shortcut screen. Only a press that could be an answer is graded — a chord, a named
   * key, or a step after the run started — so a learner can look around the page without spending
   * an attempt on every letter. Returns whether the press was consumed.
   */
  function pressKeys(event) {
    const screen = activeScreen();
    if (screen.type !== "chord" && screen.type !== "sequence") return false;

    if (event.key === "Escape" && keyStep > 0) {
      // Escape is the documented way out of a half-typed formula, so it is the way out of a
      // half-pressed one too: the run starts over rather than sitting on its second step.
      event.preventDefault();
      keyStep = 0;
      paintKeys(screen);
      return true;
    }

    const chords = chordsOf(screen);
    const chord = chords[keyStep] ?? null;
    const deliberate =
      keyStep > 0 ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      event.shiftKey ||
      NAMED_PRESS.test(event.key) ||
      chord?.solo === true;
    if (!deliberate || !keysLive) return false;

    markStarted();

    if (screen.type === "sequence") {
      if (matchesEvent(event, chord, { os: OS })) {
        event.preventDefault();
        keyStep += 1;
        if (keyStep >= chords.length) {
          keyStep = 0;
          onCorrect();
        } else {
          paintKeys(screen);
        }
        return true;
      }
      // A sequence commits a press per step, so a wrong key ends the run as well as the attempt.
      const at = keyStep + 1;
      keyStep = 0;
      paintKeys(screen);
      onWrong({ rule: "keys", message: `Step ${at} wanted a different key. Start the run again from the first one.`, position: null });
      return true;
    }

    if (chords.some((candidate) => matchesEvent(event, candidate, { os: OS }))) {
      // The press *is* the answer, so the browser must not act on it: Ctrl+Shift+L is also
      // something its own shortcut table may want.
      event.preventDefault();
      onCorrect();
      return true;
    }

    onWrong({ rule: "keys", message: "That is not the shortcut this task wants.", position: null });
    return true;
  }

  function onCorrect() {
    const answered = activeScreen();
    const missed = screenMisses;
    const helped = offeredSolution;
    const events = verdict(true);
    const finished = loopComplete(loop);

    if (finished) {
      progress = registerCompletion(progress, lessonId, { at: new Date().toISOString(), helped });
      saveProgress();
      paintSolved();
    }
    emitLoop(events, { helped, completed: completedCount(progress) });

    if (finished) {
      const next = payload.track.nextPath
        ? { path: payload.track.nextPath, label: `Next: ${payload.track.nextTitle ?? "the next drill"}` }
        : { path: "/", label: "Back to all drills" };
      showFeedback({
        state: "is-correct",
        head: "Correct",
        body: helped
          ? `${solvedLine(answered)} Counted as completed with the reference answer.`
          : solvedLine(answered),
        meta: helped ? "Completed with help." : successLabel(missed),
        next,
      });
      return;
    }

    enterScreen(loop.index, { focus: true });
    const right = missed === 0 ? "Right first time." : `After ${missed} ${missed === 1 ? "wrong attempt" : "wrong attempts"}.`;
    showFeedback({
      state: "is-correct",
      head: "Correct",
      body: solvedLine(answered),
      meta: `${right} Screen ${currentScreen(loop)} of ${screenCount}.`,
    });
    track("screen_view", {
      id: lessonId,
      screen: currentScreen(loop),
      of: screenCount,
      gated: !payload.track.free,
      solved: false,
      elapsed: seconds(),
    });
  }

  function onWrong(result) {
    progress = registerAttempt(progress, lessonId);
    saveProgress();
    screenMisses += 1;
    markTarget("wrong");
    const caret = result.position === null || result.position === undefined ? "" : caretLine(normaliseFormula(ui.input.value), result.position);
    showFeedback({
      state: "is-wrong",
      head: RULE_LABEL[result.rule] ?? "Not accepted",
      body: result.message || "That formula is not accepted yet.",
      caret,
      meta: attemptLabel(),
    });
    if (result.hint) ui.hintText.textContent = result.hint;
    emitLoop(verdict(false), { rule: result.rule });
    // Three misses on *this* screen open the reveal; `exhausted` only dedupes the event, because a
    // learner who spent their three on screen 1 must still be able to ask on screen 2.
    if (screenMisses === MAX_ATTEMPTS) {
      if (ui.showAnswer) ui.showAnswer.hidden = false;
      if (!exhausted) {
        exhausted = true;
        track("lesson_exhausted", { id: lessonId, screen: currentScreen(loop), elapsed: seconds() });
      }
    }
    paintProgress();
  }

  function check() {
    const screen = activeScreen();
    // Clicking a data cell makes the bar read-only; grading the value it shows would
    // spend an attempt and answer "not accepted" to a cell the learner cannot edit. A picture or
    // shortcut screen has no cells to select, so its bar is always the learner's to grade.
    if (
      screen.type === "formula" &&
      !canGrade({ selected, answerCell: screen.answerCell, disabled: ui.input.disabled })
    ) {
      return;
    }
    const raw = normaliseFormula(ui.input.value);
    if (raw === "") {
      clearFeedback();
      ui.feedback.classList.add("is-hint", "is-live");
      ui.feedbackHead.textContent = "Nothing to check yet";
      ui.feedbackBody.textContent =
        screen.type === "picture" || screen.type === "workbook"
          ? "Type the answer in the bar, then press Enter."
          : screen.type === "sequence"
            ? "Type the keys in order, separated by commas, then press Enter."
            : screen.type === "chord"
              ? "Type the shortcut, then press Enter."
              : `Type a formula in the bar, starting with =, then press Enter.`;
      return;
    }
    let result;
    try {
      result = gradeScreen(screen, raw);
    } catch (error) {
      console.error("[es] grader threw", error);
      showFeedback({
        state: "is-wrong",
        head: RULE_LABEL.internal,
        body: "That formula stopped the checker. Simplify it and try again.",
      });
      return;
    }
    if (result.ok) onCorrect(result);
    else onWrong(result);
  }

  function revealSolution() {
    offeredSolution = true;
    track("solution_reveal", { id: lessonId, elapsed: seconds() });
    ui.solutionCode.textContent = revealText(activeScreen());
    ui.solution.hidden = false;
    ui.solution.classList.add("is-live");
    if (!solved) {
      progress = registerCompletion(progress, lessonId, { at: new Date().toISOString(), helped: true });
      saveProgress();
    }
    paintSolved();
    showFeedback({
      state: "is-hint",
      head: "Reference answer",
      body: `${solvedLine(activeScreen())} This counts as completed with help.`,
      meta: screenMisses ? attemptLabel() : "",
    });
  }

  function toggleHint() {
    const expanded = ui.hint.getAttribute("aria-expanded") === "true";
    ui.hint.setAttribute("aria-expanded", String(!expanded));
    ui.hintText.hidden = expanded;
    if (!expanded) {
      ui.hintText.classList.add("is-live");
      if (!ui.hintText.textContent) setHint();
      track("hint_open", { id: lessonId, attempts: attemptsFor(progress, lessonId), elapsed: seconds() });
    }
  }

  function gate() {
    if (gateFor(payload.track, trial) === "open") return false;
    const remaining = Math.max(total - (payload.track.freeLessonCount ?? 0), 1);
    const paywall = el("div", { class: "paywall", id: "paywall" }, [
      el("h2", { class: "paywall-title", text: "The rest of the track is on trial" }),
      el(
        "p",
        { class: "paywall-body" },
        [
          `Drills ${(payload.track.freeLessonCount ?? 0) + 1}–${total} cover rounding, lookups, ` +
            `and text splitting. The first ${payload.track.freeLessonCount} stay free. A trial opens the remaining ` +
            `${remaining} for ${7} days.`,
        ],
      ),
    ]);

    const error = el("p", { class: "paywall-error", id: "paywall-error", role: "alert", text: "" });
    const input = el("input", {
      class: "paywall-input",
      id: "paywall-email",
      type: "email",
      name: "email",
      autocomplete: "email",
      placeholder: "you@company.com",
      "aria-label": "Email address",
      "aria-describedby": "paywall-error",
      required: true,
    });
    const submit = el("button", { class: "btn", type: "submit", text: "Start free trial" });
    const form = el("form", { class: "paywall-form", id: "paywall-form", novalidate: true }, [input, submit, error]);
    paywall.append(form, el("p", { class: "paywall-note", text: "No card required. Nothing is sent anywhere: the trial is stored in this browser." }));

    for (const node of [ui.screens, ui.bar, ui.feedback, ui.hintRow]) if (node) node.hidden = true;
    if (ui.solution) ui.solution.hidden = true;
    (ui.card?.querySelector(".sheet-head") ?? ui.card)?.after(paywall);
    track("paywall_view", { id: lessonId });

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const email = input.value.trim();
      if (!validEmail(email)) {
        error.textContent = "That does not look like an email address. Use the form you@company.com.";
        input.focus();
        return;
      }
      trial = startTrial();
      store.write(TRIAL_KEY, JSON.stringify(trial));
      // Deliberately not logging the address: this buffer may later be wired to an
      // analytics endpoint, and the form promises nothing is sent anywhere.
      track("paywall_email", { id: lessonId });
      track("trial_start", { id: lessonId, days: trialDaysLeft(trial) });
      paywall.remove();
      for (const node of [ui.screens, ui.bar, ui.feedback, ui.hintRow]) if (node) node.hidden = false;
      // The mount's `screen_view` sits after the paywall's early return, so a gated learner would
      // otherwise never enter the funnel: their first screen is the one the trial just opened.
      track("screen_view", {
        id: lessonId,
        screen: currentScreen(loop),
        of: screenCount,
        gated: true,
        solved,
        elapsed: seconds(),
      });
      clearFeedback();
      showFeedback({
        state: "is-hint",
        head: "Trial started",
        body: `${trialDaysLeft(trial)} days of the full track are open. Your progress is kept in this browser.`,
      });
      ui.input.focus();
    });

    return true;
  }

  /* wiring */

  ui.check.addEventListener("click", (event) => {
    event.preventDefault();
    check();
  });
  ui.bar.addEventListener("submit", (event) => {
    event.preventDefault();
    check();
  });
  ui.input.addEventListener("input", () => {
    const screen = activeScreen();
    // Only the answer cell's text is the learner's: every other cell's value is the sheet's.
    if (screen.type !== "formula" || selected === screen.answerCell) draft = ui.input.value;
    if (ui.input.value.trim() !== "") markStarted();
  });
  // On the form, not the input: after a mouse click the focus is on Check, and the
  // documented Escape shortcut should still work from there.
  ui.bar.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      ui.input.value = solved ? barText() : "";
      draft = ui.input.value;
      markTarget(null);
      clearFeedback();
    }
  });
  // Delegated from the screens container: every screen's grid, including ones the loop has not
  // reached yet, answers to the same two listeners.
  ui.screens.addEventListener("click", (event) => {
    const cell = event.target.closest?.("[role=gridcell][data-cell]");
    if (cell) selectCell(cell.dataset.cell);
  });
  ui.screens.addEventListener("keydown", onGridKey);
  // On the document, not the panel: the shortcut screens invite a press while the focus sits on the
  // bar, the Check button, or wherever the last click left it. Typing in a field stays typing —
  // that is the fallback spelling of the same answer — so the handler stands aside for it.
  document.addEventListener("keydown", (event) => {
    if (event.isTrusted === false) return;
    // A held key repeats, and a chord that lands would otherwise be graded again on the screen the
    // loop just advanced to — a miss the learner never made.
    if (event.repeat) return;
    if (event.target?.closest?.("input, textarea, select, [contenteditable=true]")) return;
    pressKeys(event);
  });
  if (ui.hint) ui.hint.addEventListener("click", toggleHint);
  if (ui.showAnswer) ui.showAnswer.addEventListener("click", revealSolution);

  // A hidden tab is not time on task, and `visibilitychange` is the only signal for it that every
  // browser we support fires. Both calls are idempotent, so a repeated event cannot double-count
  // the gap, and a page that loads hidden starts paused rather than counting the tab it sits in.
  if (document.hidden) clock.pause();
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) clock.pause();
    else clock.resume();
  });

  paintProgress();
  enterScreen(0);
  // A lesson exhausted on an earlier visit keeps its reveal: the record already holds
  // the three misses, and hiding the only way out would trap the learner.
  if (attemptsFor(progress, lessonId) >= MAX_ATTEMPTS && ui.showAnswer) {
    exhausted = true;
    ui.showAnswer.hidden = false;
  }
  if (solved) {
    // enterScreen reset the flag; a return visit that finished with the reveal must keep showing it.
    offeredSolution = progress.done[lessonId].helped === true;
    paintSolved();
  }

  if (gate()) {
    paintProgress();
    return;
  }

  track("screen_view", {
    id: lessonId,
    screen: currentScreen(loop),
    of: screenCount,
    gated: !payload.track.free,
    solved,
    elapsed: seconds(),
  });

  // Focus the answer only when the drill is actually on screen: autofocus on a long page
  // scrolls the reader past the lesson title. The bar is the door for a typed answer, and the
  // shortcut panel is the door for a pressed one — a press that landed in the bar would be typed
  // text, not a shortcut.
  const observer =
    typeof IntersectionObserver === "function"
      ? new IntersectionObserver((entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting && !solved) {
              focusAnswer();
              observer.disconnect();
            }
          }
        })
      : null;
  if (observer && ui.card) observer.observe(ui.card);
}

/* ── Track index ─────────────────────────────────────────────────────────── */

function mountTrack() {
  const store = createStore(safeStorage());
  const progress = parseProgress(store.read(PROGRESS_KEY));
  const rows = [...document.querySelectorAll(".lesson-row[data-lesson]")];
  if (rows.length === 0) return;

  const count = completedCount(progress);
  for (const row of rows) row.classList.toggle("is-done", isComplete(progress, row.dataset.lesson));

  const wrap = document.getElementById("track-progress");
  const note = document.getElementById("track-progress-note");
  const fill = document.getElementById("track-fill");
  if (wrap) wrap.hidden = false;
  if (note) note.textContent = `${count} of ${rows.length} drills complete${count === 0 ? "." : " in this browser."}`;
  if (fill) {
    fill.style.width = `${Math.round((count / rows.length) * 100)}%`;
    fill.dataset.full = String(count === rows.length);
  }
  track("track_view", { completed: count, total: rows.length });
}

/* ── Boot ────────────────────────────────────────────────────────────────── */

const payloadNode = document.getElementById("exercise-data");
if (payloadNode) mountDrill(payloadNode);
else mountTrack();
