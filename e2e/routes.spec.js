/**
 * The URL contract: every address the static build published still resolves on the ported app, and
 * an address that was never ours is a real 404 rather than a blank 200.
 */
import { expect, test } from "@playwright/test";

import { dashboardGroups } from "../legacy/src/site/dashboard-page.mjs";
import { indexablePaths } from "../legacy/src/site/seo.mjs";
import { loadSite } from "../lib/site.js";

const site = loadSite();
const GROUP_COUNT = dashboardGroups({ track: site.track, index: site.index }).length;
const NOTE_PATH = (article) => `/excel-functions/${article.slug}`;

/** The sitemap's own source of truth, so this test cannot drift from `app/sitemap.js` the way a
 *  hand-summed count did the day the notes shipped. */
const EXPECTED_PATHS = indexablePaths({
  config: site.config,
  index: site.index,
  groups: dashboardGroups({ track: site.track, index: site.index }),
  articles: site.articles.map((article) => ({ path: NOTE_PATH(article), updated: article.updated })),
  extra: site.articles.length > 0 ? ["exercises", "functions", "about", "privacy", "terms"] : ["exercises", "about", "privacy", "terms"],
}).map((entry) => entry.path);

test("the legacy lesson URLs redirect to the ported route", async ({ request }) => {
  const response = await request.get("/excel/sum-basics", { maxRedirects: 0 });
  expect(response.status()).toBe(308);
  expect(response.headers().location).toBe("/learn/excel/sum-basics");
});

test("/index.html redirects to the root", async ({ request }) => {
  const response = await request.get("/index.html", { maxRedirects: 0 });
  expect(response.status()).toBe(308);
  expect(response.headers().location).toBe("/");
});

test("an unknown path answers 404 with the site chrome", async ({ page }) => {
  const response = await page.goto("/nothing-here");
  expect(response.status()).toBe(404);
  await expect(page.locator("h1")).toHaveText("That page is not a drill");
  await expect(page.locator(".site .brand")).toBeVisible();
  await expect(page.locator("a.btn-primary")).toHaveAttribute("href", "/");
});

test("/api/health reports the deploy identity", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.status).toBe("ok");
  expect(typeof body.sha).toBe("string");
  expect(body.sha.length).toBeGreaterThan(0);

  // CI exports the commit it is testing; the endpoint echoes it, which is what makes an external
  // probe able to tell two deploys apart.
  const expected = process.env.GIT_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA;
  if (expected) expect(body.sha).toBe(expected);
});

test("no page asks a third-party origin for anything", async ({ page }) => {
  const foreign = [];
  page.on("request", (request) => {
    const { hostname } = new URL(request.url());
    if (hostname !== "127.0.0.1" && hostname !== "localhost") foreign.push(request.url());
  });

  await page.goto("/");
  await page.goto("/learn/excel/sum-basics");
  expect(foreign, "the zero-third-party promise is a product feature, not an optimisation").toEqual([]);
});

/**
 * The menu blocks are the site's navigation — the header is the mark, the count and the badge — so a
 * page they name is a page a visitor can reach, and a page they do not name is a page only a typed URL
 * finds. This asserts both halves: the home page's "More ways in" and the dashboard's "Your tools"
 * between them name every surface, every name resolves, and the footer stays the colophon it now is
 * rather than growing a second navigation row again.
 */
test("every way out the page menus offer is a page that exists", async ({ page, request }) => {
  const menu = async (path) => {
    await page.goto(path);
    return page
      .locator("nav.ways a[href^='/']")
      .evaluateAll((links) => links.map((link) => link.getAttribute("href")));
  };
  const hrefs = [...(await menu("/")), ...(await menu("/learn"))];

  for (const named of ["/pricing", "/projects", "/flashcards", "/daily", "/leaderboard", "/certificate", "/account"]) {
    expect(hrefs, `${named} has no other way in`).toContain(named);
  }
  for (const href of new Set(hrefs)) {
    const response = await request.get(href);
    expect(response.status(), `${href} is named in the menu but does not answer`).toBeLessThan(400);
  }

  // The footer is a colophon: three ways out, none of them navigation.
  await page.goto("/");
  const foot = await page
    .locator("footer.foot a[href^='/']")
    .evaluateAll((links) => links.map((link) => link.getAttribute("href")));
  expect([...foot].sort(), "the footer is legal print, not a site map").toEqual(["/privacy", "/terms"]);
});

/**
 * The footer test above proves the one navigation row. It does not prove the body links on the pages
 * only the app has — the dashboard cards, the project shelf, the drill rail, the legal pages' account
 * links — and those are exactly where a route can vanish without any assertion noticing. So walk a
 * representative page from each surface and resolve every internal href it emits.
 */
test("every internal link on the app's own pages resolves", async ({ page, request }) => {
  const surfaces = [
    "/",
    "/learn",
    "/learn/excel/sum-basics",
    "/pricing",
    "/projects",
    "/flashcards",
    "/daily",
    "/leaderboard",
    "/login",
    "/signup",
    "/privacy",
    "/terms",
  ];
  const hrefs = new Set();
  for (const surface of surfaces) {
    const response = await page.goto(surface);
    expect(response.status(), `${surface} does not answer`).toBeLessThan(400);
    const found = await page.locator("a[href^='/']").evaluateAll((links) => links.map((link) => link.getAttribute("href")));
    for (const href of found) if (!href.startsWith("/api/")) hrefs.add(href);
  }
  // A page that renders no links would pass the loop below while proving nothing.
  expect(hrefs.size, "the crawl found almost no links, so it is not looking at the pages").toBeGreaterThan(60);

  const dead = [];
  for (const href of hrefs) {
    const response = await request.get(href);
    if (response.status() >= 400) dead.push(`${href} → ${response.status()}`);
  }
  expect(dead.sort(), "these links are rendered but the app does not serve them").toEqual([]);
});

test("the sitemap and robots the app serves describe the routes it actually has", async ({ request }) => {
  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  expect(sitemap.headers()["content-type"]).toContain("xml");
  const locs = [...(await sitemap.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  const paths = locs.map((loc) => new URL(loc).pathname);
  // One entry per lesson, one per group hub, one per note, and the pages that are neither.
  const hubs = paths.filter((path) => path.startsWith("/learn/groups/"));
  expect(hubs).toHaveLength(GROUP_COUNT);
  expect(paths.sort(), "the sitemap and the route list disagree").toEqual([...EXPECTED_PATHS].sort());
  expect(new Set(locs).size, "a URL is listed twice").toBe(locs.length);
  for (const loc of locs) {
    const { pathname } = new URL(loc);
    // A sitemap full of redirects is worse than none: `/excel/*` only ever 308s.
    const served =
      pathname === "/" ||
      ["/privacy", "/terms", "/about", "/excel-exercises", "/excel-functions"].includes(pathname) ||
      pathname.startsWith("/learn/groups/") ||
      pathname.startsWith("/learn/excel/") ||
      pathname.startsWith("/excel-functions/");
    expect(served, `${loc} is not a served route`).toBe(true);
  }
  for (const page of ["/privacy", "/terms", "/about", "/excel-exercises"]) {
    expect(paths, `${page} is not in the sitemap`).toContain(page);
  }
  // The dashboard and the offer are noindex, so neither may appear.
  for (const excluded of ["/learn", "/pricing", "/account"]) {
    expect(paths, `${excluded} is noindex but in the sitemap`).not.toContain(excluded);
  }

  const robots = await request.get("/robots.txt");
  expect(robots.status()).toBe(200);
  const text = await robots.text();
  expect(text).toContain("Allow: /");
  expect(text).toMatch(/^Sitemap: \S+\/sitemap\.xml$/m);
  // Whatever is disallowed has to be a real surface, and the pages we want found must stay out of the
  // list — a robots rule that names a served marketing page silently deletes it from search.
  const disallowed = [...text.matchAll(/^Disallow: (\S+)$/gm)].map((match) => match[1]);
  expect(disallowed.sort()).toEqual(["/api/", "/certificate"]);
  for (const loc of locs) {
    const { pathname } = new URL(loc);
    for (const rule of disallowed) {
      expect(pathname.startsWith(rule), `${loc} is in the sitemap and disallowed by ${rule}`).toBe(false);
    }
  }
});
