/**
 * The ported app's sitemap and robots.txt. The static build publishes equivalents; these routes are
 * the ones a crawler will actually hit, so they must cover the track and never advertise a legacy
 * `/excel/` address that now redirects.
 */
import assert from "node:assert/strict";
import { before, test } from "node:test";

// Set before the modules load: `loadSite()` reads the environment once per process and caches.
process.env.SITE_URL = "https://example.com";
process.env.SITE_BUILT_AT = "2026-01-02";

let sitemap;
let robots;
let site;

before(async () => {
  sitemap = (await import("../app/sitemap.js")).default;
  robots = (await import("../app/robots.js")).default;
  site = (await import("../lib/site.js")).loadSite();
});

test("lists the index and every lesson, nothing else", async () => {
  const urls = sitemap().map((entry) => entry.url);
  assert.equal(urls.length, site.index.length + 1);
  assert.equal(new Set(urls).size, urls.length, "a URL is listed twice");
  assert.equal(urls[0], "https://example.com/");
  for (const entry of site.index) {
    assert.ok(urls.includes(`https://example.com${entry.path}`), `${entry.slug} is not in the sitemap`);
  }
});

test("advertises no address that only redirects", async () => {
  for (const { url } of sitemap()) {
    const { pathname } = new URL(url);
    assert.ok(
      pathname === "/" || pathname.startsWith("/learn/excel/"),
      `${url} is not a route the app serves`,
    );
  }
});

test("dates every entry from the build, not from the request", async () => {
  for (const entry of sitemap()) assert.equal(entry.lastModified, "2026-01-02");
});

test("robots points crawlers at that sitemap", async () => {
  const rules = robots();
  assert.deepEqual(rules.rules, [{ userAgent: "*", allow: "/" }]);
  assert.equal(rules.sitemap, "https://example.com/sitemap.xml");
  assert.ok(sitemap().every((entry) => entry.url.startsWith("https://example.com/")));
});
