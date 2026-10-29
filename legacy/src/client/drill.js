/**
 * The drill client. The HTML is already on the page: the sheet, the formula bar, the
 * feedback region and the progress rail are server-rendered, and this module only
 * adds behaviour and fills those regions in. Nothing here builds markup from content
 * with innerHTML — the grader echoes learner input inside its messages, so every
 * string reaches the DOM through textContent.
 */

import { grade, gradeAnswer } from "../grader/index.js";
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

  let selected = payload.screens[0].answerCell;
  let draft = "";
  let started = false;
  let screenMisses = 0;
  let exhausted = false;
  let solved = isComplete(progress, lessonId);
  let offeredSolution = solved && progress.done[lessonId].helped === true;

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
    return draft || activeScreen().reference || "";
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

  function neighbouringKey(key, deltaCol, deltaRow) {
    const cell = byKey.get(key);
    if (!cell) return null;
    const row = cells.filter((node) => node.closest("tr") === cell.closest("tr"));
    const column = cells.filter((node) => node.cellIndex === cell.cellIndex);
    const rowIndex = row.indexOf(cell);
    const columnIndex = column.indexOf(cell);
    if (deltaCol) {
      const next = rowIndex + deltaCol;
      if (next < 0 || next >= row.length) return null;
      return row[next].dataset.cell;
    }
    const next = columnIndex + deltaRow;
    if (next < 0 || next >= column.length) return null;
    return column[next].dataset.cell;
  }

  function onGridKey(event) {
    const key = event.key;
    let nextKey = null;
    if (key === "ArrowLeft") nextKey = neighbouringKey(selected, -1, 0);
    else if (key === "ArrowRight") nextKey = neighbouringKey(selected, 1, 0);
    else if (key === "ArrowUp") nextKey = neighbouringKey(selected, 0, -1);
    else if (key === "ArrowDown") nextKey = neighbouringKey(selected, 0, 1);
    else if (key === "Home") {
      const cell = byKey.get(selected);
      const row = cells.filter((node) => node.closest("tr") === cell.closest("tr"));
      nextKey = row[0].dataset.cell;
    } else if (key === "End") {
      const cell = byKey.get(selected);
      const row = cells.filter((node) => node.closest("tr") === cell.closest("tr"));
      nextKey = row.at(-1).dataset.cell;
    } else return;
    event.preventDefault();
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
    const isPicture = screen.type === "picture";
    // The target chip names a cell; a picture screen has none, so it goes dark and the note under
    // the sheet says where the answer goes instead. The docs worked example is a formula, so it
    // steps aside on a picture screen too — the client puts it back for the next formula screen.
    if (ui.answerNote) ui.answerNote.textContent = isPicture ? "the bar" : screen.answerCell;
    if (ui.chip) {
      ui.chip.hidden = isPicture;
      ui.chip.textContent = isPicture ? "" : screen.answerCell;
    }
    if (ui.docsWorked) ui.docsWorked.hidden = isPicture;
    if (!isPicture) {
      if (ui.docsCode) ui.docsCode.textContent = screen.reference;
      if (ui.docsReference) ui.docsReference.textContent = screen.reference;
      if (ui.docsValue) ui.docsValue.textContent = display(screen.expect.value);
    }

    setHint();
    if (isPicture) {
      selected = null;
      // Nothing to select, so nothing can disable the bar: every keystroke is an attempt at the answer.
      if (ui.check) ui.check.disabled = false;
      ui.input.disabled = false;
      ui.input.value = draft;
      ui.input.setAttribute("aria-label", "Your answer");
      if (focus) ui.input.focus();
    } else {
      selectCell(screen.answerCell, { focus });
    }
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
    if (screen.type === "picture") return `The answer is ${display(screen.expect.value)}.`;
    return `${screen.answerCell} holds ${display(screen.expect.value)}.`;
  }

  /**
   * The screen router: one grading call per screen type, in one place. A registry would need
   * something to register; with two types this switch is the whole of it.
   */
  function gradeScreen(screen, raw) {
    return screen.type === "picture" ? gradeAnswer(screen, raw) : grade(screen, raw);
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
    // spend an attempt and answer "not accepted" to a cell the learner cannot edit. A picture
    // screen has no cells to select, so its bar is always the learner's to grade.
    if (screen.type !== "picture" && !canGrade({ selected, answerCell: screen.answerCell, disabled: ui.input.disabled })) {
      return;
    }
    const raw = normaliseFormula(ui.input.value);
    if (raw === "") {
      clearFeedback();
      ui.feedback.classList.add("is-hint", "is-live");
      ui.feedbackHead.textContent = "Nothing to check yet";
      ui.feedbackBody.textContent =
        screen.type === "picture"
          ? "Type the answer in the bar, then press Enter."
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
    ui.solutionCode.textContent = activeScreen().reference;
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
    if (screen.type === "picture" || selected === screen.answerCell) draft = ui.input.value;
    if (!started && ui.input.value.trim() !== "") {
      started = true;
      track("drill_start", { id: lessonId, elapsed: seconds() });
    }
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

  // Focus the bar only when the drill is actually on screen: autofocus on a long page
  // scrolls the reader past the lesson title.
  const observer =
    typeof IntersectionObserver === "function"
      ? new IntersectionObserver((entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting && !solved) {
              ui.input.focus({ preventScroll: true });
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
