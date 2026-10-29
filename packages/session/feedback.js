/**
 * The feedback handoff. There is no endpoint until phase 10, and no account to attach one to, so a
 * submission is appended to a bounded queue in the learner's own browser and nothing leaves it — the
 * dialog says so rather than pretending a note went somewhere.
 *
 * The bound is the point, not a nicety: the queue shares `localStorage` with the progress record, so a
 * learner who files forty notes must not make their own quota error on the forty-first and find that
 * their progress stopped saving.
 */

export const FEEDBACK_LIMIT = 20;
export const FEEDBACK_TEXT_LIMIT = 500;

/** The satisfaction choice. Three, because a learner can answer this in a second. */
export const MOODS = Object.freeze(["stuck", "progress", "clicked"]);

function isEntry(entry) {
  return (
    typeof entry === "object" &&
    entry !== null &&
    MOODS.includes(entry.mood) &&
    typeof entry.at === "string" &&
    typeof entry.text === "string"
  );
}

/**
 * One submission, or `null` when the learner has not picked anything yet. The text is trimmed before
 * it is cut, so a note written past the limit loses whitespace at the edges rather than a word.
 */
export function feedbackEntry({ mood, text = "", route = "", at = new Date().toISOString() }) {
  if (!MOODS.includes(mood)) return null;
  return {
    mood,
    text: String(text ?? "").trim().slice(0, FEEDBACK_TEXT_LIMIT),
    route: String(route ?? ""),
    at,
  };
}

/** The newest `FEEDBACK_LIMIT` entries, oldest dropped first. A malformed queue restarts at zero. */
export function enqueueFeedback(queue, entry, limit = FEEDBACK_LIMIT) {
  const kept = Array.isArray(queue) ? queue.filter(isEntry) : [];
  return [...kept, entry].slice(-limit);
}

/** What the queue reads as. Junk is an empty queue, exactly like the progress record. */
export function readQueue(raw) {
  try {
    const parsed = JSON.parse(raw ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(isEntry) : [];
  } catch {
    return [];
  }
}
