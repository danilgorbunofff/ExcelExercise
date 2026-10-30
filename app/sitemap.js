/**
 * The sitemap for the ported app. The static build publishes its own at `legacy/dist/sitemap.xml`
 * from the same content, so the two can only disagree about the URL prefix — which `loadSite()` has
 * already rewritten to `/learn/excel/<slug>` by the time this runs.
 */
import { loadSite } from "../lib/site.js";

const { config, index } = loadSite();

export default function sitemap() {
  const lastModified = config.builtAt;
  return [
    { url: `${config.baseUrl}/`, lastModified, priority: 1 },
    // The two legal pages are indexable and listed here, exactly as the static build lists them; the
    // `index.length + 3` assertions in `legacy/src/verify.mjs` and `scripts/check-next-pages.mjs` are
    // what keep this list and that one from drifting.
    { url: `${config.baseUrl}/privacy`, lastModified, priority: 0.3 },
    { url: `${config.baseUrl}/terms`, lastModified, priority: 0.3 },
    ...index.map((entry) => ({ url: `${config.baseUrl}${entry.path}`, lastModified, priority: 0.8 })),
  ];
}
