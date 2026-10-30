/**
 * `GET /api/flashcards?id=<lessonId>` — the cards for some lessons, and nothing else.
 *
 * The page cannot know what a learner has finished: the list lives in `es.progress` in the browser (and,
 * for an account, in `lesson_progress`). So the browser asks for the lessons it has finished and the
 * server answers with those cards — the filter is applied to the request, and an id the deck builder
 * does not recognise is dropped rather than fetched.
 *
 * There is no auth gate, deliberately. A card is public lesson content: the prompt, the sheet, the
 * formula it reveals and one line of the lesson's own explanation are all in the drill's own HTML after
 * a correct answer. Gating this would not protect the content, it would only make a signed-out learner's
 * flashcards fail.
 */
import { flagEnabled } from "../../../lib/flags.js";
import { buildDeck } from "../../../lib/retention/cards.js";
import { loadSite } from "../../../lib/site.js";

/** More lessons than any learner has finished; a cap keeps one request from building the whole catalog. */
const MAX_LESSONS = 50;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

/** `?id=a&id=b` and `?id=a,b` are both spellings of the same request. */
function requested(url) {
  const ids = [];
  for (const value of url.searchParams.getAll("id")) {
    for (const part of value.split(",")) {
      const id = part.trim();
      if (id !== "" && id.length <= 64 && !ids.includes(id)) ids.push(id);
    }
  }
  return ids.slice(0, MAX_LESSONS);
}

export function GET(request) {
  if (!flagEnabled("flashcards")) return json({ ok: false, error: "flashcards_disabled" }, 404);
  const ids = requested(new URL(request.url));
  if (ids.length === 0) return json({ ok: false, error: "no_lessons" }, 400);
  const cards = buildDeck(loadSite().index, ids);
  return json({ ok: true, lessons: ids.length, cards });
}
