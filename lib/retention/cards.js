/**
 * A card, built from a lesson's own content.
 *
 * This half is server-side on purpose: `revealOf` reads the authored lesson JSON, and the browser has no
 * business loading it. `lib/retention/flashcards.js` is the other half — the schedule — and stays free of
 * content imports so the client component can import it without dragging `node:fs` into the bundle.
 *
 * A card is the drill's own reveal: the prompt and the sheet in front, the formula the drill would have
 * shown after a correct answer, and one line of the lesson's explanation behind. That is why a card can
 * never disagree with its lesson.
 */
import { revealOf } from "../../packages/content/index.js";
import { eligibleScreen } from "./challenge.js";

/** A deck is bounded: a learner with 85 finished lessons has ~146 screens, and a session is not a scroll. */
export const CARD_CAP = 60;

const lastSegment = (path) => String(path).split("/").pop();

/** The first sentence of a paragraph, shortened at a word boundary. Empty in, empty out. */
export function firstSentence(text, { max = 200 } = {}) {
  if (typeof text !== "string") return "";
  const sentence = text.trim().split(/(?<=[.!?])\s/)[0] ?? "";
  if (sentence.length <= max) return sentence;
  const cut = sentence.slice(0, max);
  const at = cut.lastIndexOf(" ");
  return `${(at > 40 ? cut.slice(0, at) : cut).trimEnd()}…`;
}

/**
 * One card: the prompt and the sheet on the front, the formula and one line on the back.
 *
 * `answer` is `revealOf`, the same reveal the drill shows after a correct answer, so a card and a
 * lesson can never disagree about what the formula was.
 */
export function cardFor({ lessonId, lesson, screen, number = null }) {
  if (!lesson || !screen) return null;
  return {
    key: `${lessonId}#${screen.id}`,
    lessonId,
    lessonTitle: lesson.title ?? "",
    lessonNumber: number,
    screenId: screen.id,
    type: screen.type,
    prompt: screen.prompt ?? "",
    grid: screen.grid ?? null,
    answer: revealOf(lesson, screen),
    explain: firstSentence(lesson.docs?.explain ?? ""),
    image: screen.image ? `/assets/img/${lastSegment(screen.image)}` : null,
    alt: screen.alt ?? "",
  };
}

/**
 * The cards for exactly these lessons.
 *
 * Unknown ids are dropped rather than thrown over: `es.progress` outlives a content change, and a
 * lesson that has been renamed should cost the learner one fewer card, not a broken page.
 */
export function buildDeck(index, lessonIds, { cap = CARD_CAP } = {}) {
  const byId = new Map((Array.isArray(index) ? index : []).map((entry) => [entry.exercise.id, entry]));
  const cards = [];
  const seen = new Set();
  for (const id of Array.isArray(lessonIds) ? lessonIds : []) {
    if (seen.has(id)) continue;
    seen.add(id);
    const entry = byId.get(id);
    if (!entry) continue;
    for (const screen of entry.exercise.screens) {
      if (!eligibleScreen(screen)) continue;
      const card = cardFor({
        lessonId: id,
        lesson: entry.exercise,
        screen,
        number: entry.number ?? null,
      });
      if (!card) continue;
      cards.push(card);
      if (cards.length >= cap) return cards;
    }
  }
  return cards;
}
