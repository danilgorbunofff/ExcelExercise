/**
 * What the feedback route accepts, and how often.
 *
 * The dialog in the footer used to promise nothing left the browser. Now a note reaches a human, so
 * the promise changed and the rules arrived with it: a mood (the one-click part), text that fits the
 * column the database already has, and a page that is a path on this site rather than a URL a browser
 * was told to send. Nothing about the note names a person — the account is the session's.
 *
 * The limits are shared with the browser's copy in `packages/session/feedback.js` by value, and the
 * route is checked against them here rather than trusted to agree.
 */
import { FEEDBACK_TEXT_LIMIT, MOODS } from "../../packages/session/feedback.js";

export const NOTE_LIMIT = FEEDBACK_TEXT_LIMIT;

/** Notes one address may file: enough for a stuck afternoon, not enough to be a nuisance. */
export const RATE = Object.freeze({ max: 12, window: 10 * 60 * 1000 });

function pageOf(raw) {
  const page = typeof raw === "string" ? raw.trim() : "";
  // A path only: a full URL or a protocol-relative one is a redirect waiting to be pasted somewhere.
  if (!page.startsWith("/") || page.startsWith("//") || page.length > 200) return "/";
  return page;
}

/**
 * A note, or the reason it is not one. The text is cut rather than refused past the limit: a learner
 * who pasted too much should not lose the whole of it to a validation error.
 */
export function parseNote(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "body must be a JSON object" };
  }
  if (!MOODS.includes(body.mood)) {
    return { ok: false, error: `mood must be one of: ${MOODS.join(", ")}` };
  }
  const text = String(body.text ?? "").trim().slice(0, NOTE_LIMIT);
  if (text.length === 0) return { ok: false, error: "text must not be empty" };
  return { ok: true, note: { mood: body.mood, text, page: pageOf(body.page) } };
}

/** Whether a browser has filed its allowance. Times are epoch milliseconds, newest anywhere. */
export function overLimit(times, now, rate = RATE) {
  const recent = (Array.isArray(times) ? times : []).filter((at) => Number.isFinite(at) && now - at < rate.window);
  return recent.length >= rate.max;
}
