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
    ...index.map((entry) => ({ url: `${config.baseUrl}${entry.path}`, lastModified, priority: 0.8 })),
  ];
}
