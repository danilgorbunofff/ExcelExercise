/**
 * Invariant 1: every address the sitemap publishes is reachable from the front door by clicking,
 * in three clicks or fewer. A page nobody links to is not published in any sense a reader can
 * feel — it only exists for a crawler.
 *
 * The deliberate exceptions are pages a reader must not stumble into: the verification page for a
 * credential (it carries a serial), the API, and the password-reset flows.
 */
import { expect, test } from "@playwright/test";

import { dashboardGroups } from "../legacy/src/site/dashboard-page.mjs";
import { indexablePaths } from "../legacy/src/site/seo.mjs";
import { loadSite } from "../lib/site.js";

const site = loadSite();
const NOTE_PATH = (article) => `/excel-functions/${article.slug}`;

const PUBLISHED_PATHS = indexablePaths({
  config: site.config,
  index: site.index,
  groups: dashboardGroups({ track: site.track, index: site.index }),
  articles: site.articles.map((article) => ({ path: NOTE_PATH(article), updated: article.updated })),
  extra: site.articles.length > 0 ? ["exercises", "functions", "about", "privacy", "terms"] : ["exercises", "about", "privacy", "terms"],
}).map((entry) => entry.path);

const DEPTH = 3;
const MOBILE_NAV = "/menu"; // the shell's own second door; not a destination
// Downloads are links a reader follows, but they are not pages and `page.goto` cannot render them.
const DOWNLOAD = /\.(?:xlsx|xls|csv|pdf|zip|png|jpe?g|gif|svg|ico|webmanifest|txt|xml)$/i;

const normalize = (href) => {
  const path = href.split("#")[0].split("?")[0];
  if (!path.startsWith("/")) return null;
  return path.length > 1 ? path.replace(/\/$/, "") : "/";
};

async function crawl(page) {
  const reached = new Map([["/", 0]]);
  let frontier = ["/"];
  for (let depth = 1; depth <= DEPTH && frontier.length > 0; depth++) {
    const next = [];
    for (const path of frontier) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      const hrefs = await page.locator("a[href]").evaluateAll((links) => links.map((link) => link.getAttribute("href")));
      for (const href of hrefs) {
        const clean = normalize(href ?? "");
        if (!clean || reached.has(clean) || clean === MOBILE_NAV || DOWNLOAD.test(clean)) continue;
        reached.set(clean, depth);
        next.push(clean);
      }
    }
    frontier = next;
  }
  return reached;
}

test("the sitemap's pages are all reachable in three clicks", async ({ page }) => {
  test.setTimeout(300_000);
  const reached = await crawl(page);

  const unreachable = PUBLISHED_PATHS.map(normalize).filter((path) => path && !reached.has(path));
  expect(unreachable).toEqual([]);
});

test("every published page and every gated surface renders the site chrome", async ({ request }) => {
  test.setTimeout(300_000);
  const gated = ["/account", "/daily", "/leaderboard", "/certificate", "/flashcards", "/login", "/signup", "/reset"];
  const paths = [...new Set([...PUBLISHED_PATHS.map(normalize), ...gated])].filter(Boolean);

  const chrome = [];
  for (const path of paths) {
    const response = await request.get(path);
    const html = await response.text();
    const ok = response.status() === 200 && html.includes('<header class="site"') && html.includes('<footer class="foot"');
    if (!ok) chrome.push(`${response.status()} ${path}`);
  }
  expect(chrome).toEqual([]);
});

test("the front door does not leak the credential or reset addresses", async ({ page }) => {
  await page.goto("/");
  const hrefs = await page.locator("a[href]").evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? ""));
  const leaked = hrefs.filter((href) => /^\/(verify|api|reset)(\/|$)/.test(href));
  expect(leaked).toEqual([]);
});
