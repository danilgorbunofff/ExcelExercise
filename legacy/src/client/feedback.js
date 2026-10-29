/**
 * The feedback dialog in the footer, on every page. There is nothing to post to until phase 10 and no
 * account to attach a note to, so a submission goes two places, both local: the event sink (where the
 * funnel already reads from) and a bounded queue in `localStorage` for the transport to pick up later.
 * The dialog says that in as many words — a form that looks like it reaches a human and does not is
 * worse than no form.
 */

import {
  FEEDBACK_TEXT_LIMIT,
  MOODS,
  createSink,
  enqueueFeedback,
  feedbackEntry,
  readQueue,
} from "../session/index.js";

const QUEUE_KEY = "es.feedback";

const globalObject = globalThis;

/**
 * The sink is this module's own rather than the player's: the footer is on every page, and half of them
 * have no player. It writes to the same `window.__esEvents` buffer, so a note and a check land in one
 * place.
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

const ui = {
  dialog: document.getElementById("feedback-dialog"),
  open: document.getElementById("feedback-open"),
  form: document.getElementById("feedback-form"),
  text: document.getElementById("feedback-text"),
  count: document.getElementById("feedback-count"),
  error: document.getElementById("feedback-error"),
  cancel: document.getElementById("feedback-cancel"),
  done: document.getElementById("feedback-done"),
  doneNote: document.getElementById("feedback-done-note"),
  close: document.getElementById("feedback-close"),
};

/** Storage is optional, exactly as it is for progress: a refused write must be said, not swallowed. */
function safeStorage() {
  try {
    const storage = window.localStorage;
    const probe = `${QUEUE_KEY}.probe`;
    storage.setItem(probe, "1");
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
}

function chosenMood() {
  const checked = ui.form?.querySelector("input[name='mood']:checked");
  return MOODS.includes(checked?.value) ? checked.value : null;
}

function paintCount() {
  if (!ui.count) return;
  const length = ui.text?.value.length ?? 0;
  ui.count.textContent = `${length} of ${FEEDBACK_TEXT_LIMIT} characters`;
}

function reset() {
  if (ui.form) {
    ui.form.reset();
    ui.form.hidden = false;
  }
  if (ui.done) ui.done.hidden = true;
  if (ui.error) ui.error.textContent = "";
  paintCount();
}

function showDone(note) {
  if (ui.form) ui.form.hidden = true;
  if (ui.doneNote) ui.doneNote.textContent = note;
  if (ui.done) ui.done.hidden = false;
  ui.close?.focus();
}

function submit(event) {
  event.preventDefault();
  const entry = feedbackEntry({
    mood: chosenMood(),
    text: ui.text?.value ?? "",
    route: globalObject.location?.pathname ?? "",
  });
  if (!entry) {
    if (ui.error) ui.error.textContent = "Pick the one that fits first. The note on its own is not enough.";
    ui.form?.querySelector("input[name='mood']")?.focus();
    return;
  }

  const storage = safeStorage();
  let kept = 0;
  if (storage) {
    try {
      const queued = enqueueFeedback(readQueue(storage.getItem(QUEUE_KEY)), entry);
      storage.setItem(QUEUE_KEY, JSON.stringify(queued));
      kept = queued.length;
    } catch {
      kept = 0;
    }
  }

  sink.emit("feedback_sent", {
    mood: entry.mood,
    chars: entry.text.length,
    kept,
    stored: Boolean(storage) && kept > 0,
  });

  showDone(
    kept > 0
      ? "Saved in this browser, and nowhere else: nothing has been sent. Thank you — that is the whole of what this form can do today."
      : "This browser refused to keep the note, so it is gone as soon as you close this. Nothing was sent.",
  );
}

if (ui.dialog && ui.open) {
  ui.open.addEventListener("click", () => {
    reset();
    ui.dialog.showModal();
  });

  ui.text?.addEventListener("input", paintCount);

  ui.cancel?.addEventListener("click", () => {
    ui.dialog.close();
    reset();
  });

  ui.close?.addEventListener("click", () => {
    ui.dialog.close();
    reset();
  });

  // Escape closes a modal dialog by itself; this is the cleanup that has to happen either way.
  ui.dialog.addEventListener("close", reset);

  ui.form?.addEventListener("submit", submit);

  paintCount();
}
