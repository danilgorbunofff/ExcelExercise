/**
 * The sitemap for the ported app, built from the one list of indexable URLs (`legacy/src/site/seo.mjs`)
 * that the static build also uses. `loadSite()` has already rewritten lesson paths to
 * `/learn/excel/<slug>`, so the two sitemaps can only differ by which hub pages each build publishes.
 */
import { dashboardGroups } from "../legacy/src/site/dashboard-page.mjs";
import { indexablePaths } from "../legacy/src/site/seo.mjs";

import { loadSite } from "../lib/site.js";

const { config, track, index, articles } = loadSite();

/** Hub pages this app serves. `/excel-functions` is listed only when it has notes to list. */
export const EXTRA = articles.length > 0 ? ["exercises", "functions", "about", "privacy", "terms"] : ["exercises", "about", "privacy", "terms"];

export default function sitemap() {
  return indexablePaths({
    config,
    index,
    groups: dashboardGroups({ track, index }),
    articles: articles.map((article) => ({ path: `/excel-functions/${article.slug}`, updated: article.updated })),
    extra: EXTRA,
  }).map((entry) => ({
    url: `${config.baseUrl}${entry.path}`,
    lastModified: entry.lastModified,
    priority: Number(entry.priority),
  }));
}
