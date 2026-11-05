/**
 * The funnel's browser end: did this visit start an exercise, finish it, see the paywall. Three facts a
 * page knows and the server does not.
 *
 * No cookie, no account, no answer text: a line says what happened, never to whom, which is the rule
 * `lib/log-event.js` enforces on the other end. Each event is sent once per page view, and only where
 * the endpoint exists. The route belongs to the Next edition, so the static build served from a plain
 * host skips the call instead of drawing a 404 in the console.
 */

const ENDPOINT = "/api/events";
const SENT = new Set();
let off = false;

/** The static edition has no route to answer on, and a 404 in the console reads as a broken page. */
function servedByApp() {
  return document.querySelector('script[src^="/_next/"]') !== null;
}

/** Which silo the page belongs to. The report prints these words, so they are the vocabulary. */
function surfaceOf(pathname) {
  if (pathname.startsWith("/formulas/")) return "formula";
  if (pathname.startsWith("/excel-functions/")) return "article";
  return "lesson";
}

/** The page's own slug, without the static build's `.html`. */
function slugOf(pathname) {
  const last = pathname.replace(/\/+$/, "").split("/").pop() ?? "";
  return last.replace(/\.html$/, "");
}

/**
 * Report one funnel step.
 *
 * @param {"drill_started" | "drill_completed" | "paywall_shown"} event
 * @param {Record<string, number | boolean>} [fields] - counts about the attempt, never an answer.
 */
export function funnel(event, fields = {}) {
  if (off || !servedByApp()) return;
  const path = location.pathname;
  const key = `${event} ${path}`;
  if (SENT.has(key)) return;
  SENT.add(key);

  const post = () =>
    fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event, fields: { surface: surfaceOf(path), slug: slugOf(path), ...fields } }),
      keepalive: true,
      credentials: "omit",
    });

  try {
    post()
      .then((response) => {
        if (response.status === 404 || response.status === 405) off = true;
      })
      .catch(() => {
        off = true;
      });
  } catch {
    off = true;
  }
}
