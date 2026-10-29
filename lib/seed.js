/**
 * Progress seeds for the browser. The order gate reads the published order, so a test that wants a
 * drill past the frontier has to finish what comes before it — the same order the pages are built
 * from, read here rather than copied into the spec. A seed that copied the list would pass on the day
 * it was written and quietly gate the wrong drill after the next lesson ships.
 */
import { loadSite } from "./site.js";

const AT = "2026-01-01T00:00:00.000Z";

/** The `es.progress` record a learner would have after finishing every drill before `slug`. */
export function doneBefore(slug) {
  const { index } = loadSite();
  const at = index.findIndex((entry) => entry.slug === slug);
  if (at < 1) throw new Error(`${slug} is not a published drill past the first, so nothing precedes it`);
  const done = {};
  for (const entry of index.slice(0, at)) done[entry.exercise.id] = { at: AT, tries: 0, helped: false };
  return { v: 1, done, tries: {}, unlocked: false };
}

/** Write that record before the page loads, so the island reads it on its first paint. */
export async function seedBefore(page, slug) {
  await page.addInitScript((seed) => {
    window.localStorage.setItem("es.progress", JSON.stringify(seed));
  }, doneBefore(slug));
}
