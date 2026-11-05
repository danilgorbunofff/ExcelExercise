/**
 * The feedback dialog in the footer, on every page.
 *
 * A note is sent to `/api/feedback`, which writes it where a person can read it. When that endpoint is
 * not there — the static edition has no server, and a deployment without accounts has no store — the
 * note is kept in this browser instead and the dialog says so. Which of the two happened is never
 * guessed: the message after Send is the outcome of the request.
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

/** One POST, and the outcome as three facts rather than an exception. */
async function postNote(entry) {
  try {
    const response = await fetch("/api/feedback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mood: entry.mood, text: entry.text, page: entry.route }),
    });
    if (response.status === 201) return { sent: true };
    if (response.status === 429) {
      const body = await response.json().catch(() => ({}));
      return { sent: false, tooMany: true, retryAfter: body.retry_after ?? null };
    }
    return { sent: false };
  } catch {
    return { sent: false };
  }
}

function submit(event) {
  event.preventDefault();
  const entry = feedbackEntry({
    mood: chosenMood(),
    text: ui.text?.value ?? "",
    route: globalObject.location?.pathname ?? "",
  });
  if (!entry) {
    if (ui.error) ui.error.textContent = "Choose one of the three first. The note on its own is not enough.";
    ui.form?.querySelector("input[name='mood']")?.focus();
    return;
  }

  const submitButton = ui.form?.querySelector("button[type='submit']");
  if (submitButton) submitButton.disabled = true;
  if (ui.error) ui.error.textContent = "";

  postNote(entry).then((outcome) => {
    if (submitButton) submitButton.disabled = false;

    if (outcome.sent) {
      sink.emit("feedback_sent", { mood: entry.mood, chars: entry.text.length, delivered: true });
      showDone("Sent. Thank you. A person reads these, and the page you were on came with it.");
      return;
    }

    if (outcome.tooMany) {
      // Nothing was delivered, so nothing is queued behind the learner's back: say it and let them retry.
      if (ui.error) {
        ui.error.textContent = `That is a lot of notes in a short time. Try again in ${
          outcome.retryAfter ? `${outcome.retryAfter} seconds` : "a few minutes"
        }.`;
      }
      return;
    }

    // No endpoint, so the honest fallback: keep it here, and say that is all that happened.
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
      delivered: false,
    });

    showDone(
      kept > 0
        ? "Saved in this browser, and nowhere else: this copy of the site has no way to receive it yet. Thank you for writing. That is all this form can do here."
        : "This browser refused to keep the note, so it is gone as soon as you close this. Nothing was sent.",
    );
  });
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
