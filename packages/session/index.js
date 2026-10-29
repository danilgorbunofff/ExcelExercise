/**
 * The player's session engine: the score loop, the wall-clock budget, and the event
 * sink that everything else reports through. No DOM, no network, no dependencies —
 * the drill imports it through `../session/index.js`, and the Next player will import
 * the same file.
 */

export { createClock, DEFAULT_SESSION_MINUTES } from "./clock.js";
export { createSink, EVENT_TYPES, MAX_EVENTS } from "./events.js";
export {
  FEEDBACK_LIMIT,
  FEEDBACK_TEXT_LIMIT,
  MOODS,
  enqueueFeedback,
  feedbackEntry,
  readQueue,
} from "./feedback.js";
export {
  createSession,
  currentScreen,
  DEFAULT_RECYCLE_FROM,
  DEFAULT_SCORING,
  emitAll,
  isComplete,
  nextIndex,
  progress,
  recordVerdict,
} from "./score.js";
