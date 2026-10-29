/**
 * The drill client. The HTML is already on the page: the sheet, the formula bar, the
 * feedback region and the progress rail are server-rendered, and this module only
 * adds behaviour and fills those regions in. Nothing here builds markup from content
 * with innerHTML — the grader echoes learner input inside its messages, so every
 * string reaches the DOM through textContent.
 */

import { grade } from "../grader/index.js";
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
    sheet: document.getElementById("sheet"),
    grid: document.getElementById("sheet-grid"),
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

  if (!ui.grid || !ui.input || !ui.check || !ui.feedback) {
    console.warn("[es] the page is missing part of the drill mount contract");
    return;
  }

  const store = createStore(safeStorage());
  let progress = parseProgress(store.read(PROGRESS_KEY));
  let trial = parseTrial(store.read(TRIAL_KEY));

  const lessonId = payload.id;
  const total = payload.track.total || 1;
  const cells = [...ui.grid.querySelectorAll("[role=gridcell]")];
  const byKey = new Map(cells.map((cell) => [cell.dataset.cell, cell]));
  const targetCell = byKey.get(payload.answerCell) ?? null;

  let selected = payload.answerCell;
  let draft = "";
  let started = false;
  let solved = isComplete(progress, lessonId);
  let offeredSolution = solved && progress.done[lessonId].helped === true;

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
    return draft || payload.docs?.reference || "";
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

    for (const head of ui.grid.querySelectorAll(".col-head.is-active, .row-head.is-active")) {
      head.classList.remove("is-active");
    }
    const headRow = ui.grid.tHead?.rows[0];
    if (headRow) headRow.children[cell.cellIndex]?.classList.add("is-active");
    cell.closest("tr")?.querySelector(".row-head")?.classList.add("is-active");

    const onAnswer = key === payload.answerCell;
    ui.chip.textContent = key;
    // A disabled input cannot be submitted, and a disabled button cannot submit it.
    if (ui.check) ui.check.disabled = !onAnswer;
    if (onAnswer) {
      ui.input.disabled = false;
      ui.input.value = barText();
      ui.input.setAttribute("aria-label", `Your formula for ${payload.answerCell}`);
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
    const text = payload.hints?.value ?? "";
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
    if (targetCell) {
      targetCell.textContent = display(payload.expect.value);
      targetCell.classList.remove("cell-wrong");
      targetCell.classList.add("cell-correct");
      targetCell.setAttribute(
        "aria-label",
        `Answer cell ${payload.answerCell}, ${offeredSolution ? "shown" : "correct"}: ${display(payload.expect.value)}`,
      );
    }
    if (offeredSolution) ui.solution.hidden = false;
    paintProgress();
  }

  function successLabel(missed) {
    if (missed === 0) return "Solved on the first attempt.";
    return `Solved after ${missed} ${missed === 1 ? "wrong attempt" : "wrong attempts"}.`;
  }

  function attemptLabel() {
    const tries = attemptsFor(progress, lessonId);
    if (tries >= MAX_ATTEMPTS) return `${tries} attempts. The reference answer is available below.`;
    return `Attempt ${tries} of ${MAX_ATTEMPTS}.`;
  }

  function onCorrect(result) {
    const missed = progress.tries[lessonId] ?? 0;
    progress = registerCompletion(progress, lessonId, {
      at: new Date().toISOString(),
      helped: offeredSolution,
    });
    saveProgress();
    paintSolved();
    const next = payload.track.nextPath
      ? { path: payload.track.nextPath, label: `Next: ${payload.track.nextTitle ?? "the next drill"}` }
      : { path: "/", label: "Back to all drills" };
    showFeedback({
      state: "is-correct",
      head: "Correct",
      body: offeredSolution
        ? `${payload.answerCell} holds ${display(payload.expect.value)}. Counted as completed with the reference answer.`
        : `${payload.answerCell} holds ${display(payload.expect.value)}.`,
      meta: offeredSolution ? "Completed with help." : successLabel(missed),
      next,
    });
    track("check_correct", {
      id: lessonId,
      attempts: attemptsFor(progress, lessonId),
      helped: offeredSolution,
    });
    track("lesson_complete", {
      id: lessonId,
      helped: offeredSolution,
      completed: completedCount(progress),
    });
  }

  function onWrong(result) {
    progress = registerAttempt(progress, lessonId);
    saveProgress();
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
    track("check_wrong", { id: lessonId, rule: result.rule, attempts: attemptsFor(progress, lessonId) });
    if (attemptsFor(progress, lessonId) === MAX_ATTEMPTS) {
      if (ui.showAnswer) ui.showAnswer.hidden = false;
      track("lesson_exhausted", { id: lessonId });
    }
    paintProgress();
  }

  function check() {
    // Clicking a data cell makes the bar read-only; grading the value it shows would
    // spend an attempt and answer "not accepted" to a cell the learner cannot edit.
    if (!canGrade({ selected, answerCell: payload.answerCell, disabled: ui.input.disabled })) return;
    const raw = normaliseFormula(ui.input.value);
    if (raw === "") {
      clearFeedback();
      ui.feedback.classList.add("is-hint", "is-live");
      ui.feedbackHead.textContent = "Nothing to check yet";
      ui.feedbackBody.textContent = `Type a formula in the bar, starting with =, then press Enter.`;
      return;
    }
    let result;
    try {
      result = grade(payload, raw);
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
    track("solution_reveal", { id: lessonId });
    ui.solutionCode.textContent = payload.docs.reference;
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
      body: `${payload.docs.reference} returns ${display(payload.expect.value)}. This counts as completed with help.`,
      meta: attemptsFor(progress, lessonId) ? attemptLabel() : "",
    });
  }

  function toggleHint() {
    const expanded = ui.hint.getAttribute("aria-expanded") === "true";
    ui.hint.setAttribute("aria-expanded", String(!expanded));
    ui.hintText.hidden = expanded;
    if (!expanded) {
      ui.hintText.classList.add("is-live");
      if (!ui.hintText.textContent) setHint();
      track("hint_open", { id: lessonId, attempts: attemptsFor(progress, lessonId) });
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

    for (const node of [ui.sheet, ui.bar, ui.feedback, ui.hintRow]) if (node) node.hidden = true;
    if (ui.solution) ui.solution.hidden = true;
    (document.querySelector(".task") ?? ui.card)?.after(paywall);
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
      for (const node of [ui.sheet, ui.bar, ui.feedback, ui.hintRow]) if (node) node.hidden = false;
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
    if (selected === payload.answerCell) draft = ui.input.value;
    if (!started && ui.input.value.trim() !== "") {
      started = true;
      track("drill_start", { id: lessonId });
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
  ui.grid.addEventListener("click", (event) => {
    const cell = event.target.closest?.("[role=gridcell][data-cell]");
    if (cell) selectCell(cell.dataset.cell);
  });
  ui.grid.addEventListener("keydown", onGridKey);
  if (ui.hint) ui.hint.addEventListener("click", toggleHint);
  if (ui.showAnswer) ui.showAnswer.addEventListener("click", revealSolution);

  setHint();
  paintProgress();
  if (solved) paintSolved();
  else if (ui.showAnswer && attemptsFor(progress, lessonId) >= MAX_ATTEMPTS) ui.showAnswer.hidden = false;

  if (gate()) {
    paintProgress();
    return;
  }

  selectCell(payload.answerCell);
  track("screen_view", { id: lessonId, gated: !payload.track.free, solved });

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
