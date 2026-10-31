/**
 * The enumeration guard for `/verify/<id>`.
 *
 * A credential id is sixteen base32 characters, so guessing one is not a practical attack. Scraping
 * every id on a list that leaked somewhere is. The limit is what turns "a request per guess" into "a
 * request per guess, per minute, per address" — which costs a reader sharing one certificate nothing
 * at all, and makes a crawl of the space pointless.
 *
 * In memory, per process, on purpose. A table would put a write on every view of a page whose whole
 * audience is strangers, and a signed-out reader is exactly who must not be paying for a database
 * round trip to be told a certificate exists. The cost is that the window is per instance: behind
 * more than one instance the effective limit is the sum of the instances, which is still a limit.
 */

/** The window and what it allows. Wide enough for a QA sweep, narrow enough to make a crawl futile. */
export const VERIFY_LIMIT = { windowMs: 60_000, max: 60 };

// Addresses are cheap to invent, so the book itself is capped: a churn of addresses evicts the oldest
// window rather than growing the process without end.
const MAX_TRACKED = 5_000;

/** @type {Map<string, { count: number, resetsAt: number }>} insertion order is the eviction order. */
const windows = new Map();

/**
 * The address a request came from. `x-forwarded-for` is read from the first entry, because every host
 * this ships to (a platform edge, nginx, Vercel) sets it and appends to it; `x-real-ip` is the nginx
 * spelling for the same fact. With neither, every request shares one bucket, which is a poor limit but
 * not none.
 */
export function clientAddress(headers) {
  const forwarded = headers?.get?.("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  if (first) return first;
  const real = headers?.get?.("x-real-ip");
  return real?.trim() || "unidentified";
}

/**
 * One request against one address's window.
 *
 * @param {{ address: string, now?: number }} input
 * @returns {{ allowed: boolean, retryAfter: number }} `retryAfter` is whole seconds, never below 1.
 */
export function admitVerifyRequest({ address, now = Date.now() }) {
  const key = String(address ?? "") || "unidentified";
  let window = windows.get(key);

  if (!window || window.resetsAt <= now) {
    window = { count: 0, resetsAt: now + VERIFY_LIMIT.windowMs };
    // Re-inserting moves the key to the end, so the eviction below keeps the freshest windows.
    windows.delete(key);
    windows.set(key, window);
    if (windows.size > MAX_TRACKED) windows.delete(windows.keys().next().value);
  }

  window.count += 1;
  if (window.count > VERIFY_LIMIT.max) {
    return { allowed: false, retryAfter: Math.max(1, Math.ceil((window.resetsAt - now) / 1000)) };
  }
  return { allowed: true, retryAfter: 0 };
}

/** Forgets every window. Tests only: a live process never needs to. */
export function resetVerifyWindows() {
  windows.clear();
}

/**
 * The refusal, as a page rather than a bare status: a stranger who opens a certificate link and hits
 * this has done nothing wrong, and "429" in a browser tab reads as a broken site.
 */
export function refusalPage(retryAfter) {
  const wait = retryAfter === 1 ? "a second" : `${retryAfter} seconds`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Too many checks — Excel Supreme</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; padding: 12vh 24px; font: 16px/1.6 ui-sans-serif, system-ui, sans-serif; }
  main { max-width: 34rem; margin: 0 auto; }
  h1 { font-size: 1.5rem; line-height: 1.25; margin: 0 0 12px; }
  p { margin: 0 0 12px; }
  a { color: inherit; }
</style>
</head>
<body>
<main>
  <h1>Too many certificate checks</h1>
  <p>This page has been opened many times from your network in the last minute, so it has paused to
    keep people from guessing credential ids.</p>
  <p>Try again in ${wait}.</p>
  <p><a href="/">Back to Excel Supreme</a></p>
</main>
</body>
</html>`;
}
