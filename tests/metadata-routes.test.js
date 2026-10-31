/**
 * The ported app's sitemap and robots.txt. The static build publishes equivalents; these routes are
 * the ones a crawler will actually hit, so they must cover the track and never advertise a legacy
 * `/excel/` address that now redirects.
 */
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { before, test } from "node:test";

import { buildSha, GET as health } from "../app/api/health/route.js";
import { dashboardGroups } from "../legacy/src/site/dashboard-page.mjs";

const ROOT = join(import.meta.dirname, "..");

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

test("lists the index, the hubs and every lesson, nothing else", async () => {
  const urls = sitemap().map((entry) => entry.url);
  const groups = dashboardGroups({ track: site.track, index: site.index });
  // The same list `indexablePaths()` produces for the static build: home, four non-lesson pages, the
  // notes and their hub, one hub per group, then every lesson.
  const notePages = site.articles.length + (site.articles.length > 0 ? 1 : 0);
  assert.equal(urls.length, 1 + 4 + groups.length + site.index.length + notePages);
  assert.equal(new Set(urls).size, urls.length, "a URL is listed twice");
  assert.equal(urls[0], "https://example.com/");
  for (const entry of site.index) {
    assert.ok(urls.includes(`https://example.com${entry.path}`), `${entry.slug} is not in the sitemap`);
  }
  for (const { id } of groups) {
    assert.ok(urls.includes(`https://example.com/learn/groups/${id}`), `${id} hub is not in the sitemap`);
  }
});

test("advertises no address that only redirects", async () => {
  for (const { url } of sitemap()) {
    const { pathname } = new URL(url);
    assert.ok(
      pathname === "/" ||
        ["/privacy", "/terms", "/about", "/excel-exercises", "/excel-functions"].includes(pathname) ||
        pathname.startsWith("/excel-functions/") ||
        pathname.startsWith("/learn/groups/") ||
        pathname.startsWith("/learn/excel/"),
      `${url} is not a route the app serves`,
    );
  }
});

test("every address it emits sits on SITE_URL's origin, and none on a laptop's", async () => {
  // `SITE_URL` unset falls back to `localhost:4173`, which is how a canonical ends up pointing at a
  // machine only the builder can reach. The guard in `scripts/check-origin.mjs` walks the built trees;
  // this is the same promise one level earlier, where the URLs are generated.
  const host = new URL(process.env.SITE_URL).host;
  const urls = [robots().sitemap, ...sitemap().map((entry) => entry.url)];
  for (const url of urls) {
    assert.equal(new URL(url).host, host, `${url} is not on ${host}`);
    assert.ok(!/localhost|127\.0\.0\.1/.test(url), `${url} names a laptop`);
  }
});

test("dates every entry from the content, falling back to the build", async () => {
  for (const entry of sitemap()) {
    assert.match(String(entry.lastModified).slice(0, 10), /^\d{4}-\d{2}-\d{2}$/);
  }
});

test("robots points crawlers at that sitemap", async () => {
  const rules = robots();
  assert.deepEqual(rules.rules, [
    { userAgent: "*", allow: "/", disallow: ["/api/", "/certificate"] },
  ]);
  assert.equal(rules.sitemap, "https://example.com/sitemap.xml");
  assert.ok(sitemap().every((entry) => entry.url.startsWith("https://example.com/")));
});

test("every disallowed path is a surface that exists", async () => {
  // A `Disallow` for a URL that 404s is worse than no rule: it reads as protection while the real
  // page stays crawlable under another address. `/dashboard` did exactly that — the dashboard is
  // served at `/learn`. So each rule has to name something the app actually serves.
  const [rule] = robots().rules;
  for (const path of rule.disallow) {
    const segment = path.replace(/\/$/, "");
    const page = join(ROOT, "app", segment, "page.js");
    const api = join(ROOT, "app", segment);
    assert.ok(
      existsSync(page) || (path.endsWith("/") && existsSync(api)),
      `${path} is disallowed but no page or route handler is served there`,
    );
  }
});

test("the dashboard is fetchable so its noindex is the thing that hides it", async () => {
  // `/learn` carries `robots: { index: false, follow: true }`. A `Disallow` would stop the crawler
  // before it read that, leaving any already-indexed copy in place; those two directives must not
  // both be set for the same URL.
  const [rule] = robots().rules;
  assert.ok(!rule.disallow.includes("/learn"), "/learn is noindex, not disallowed");
  assert.ok(!rule.disallow.includes("/dashboard"), "/dashboard is not a route");
});

test("health echoes the commit CI built from", async () => {
  // The workflow sets GIT_SHA and asserts the served body matches it; that is the only proof a
  // deployed artifact corresponds to a commit, so the env var must always win over any guess.
  const saved = { git: process.env.GIT_SHA, vercel: process.env.VERCEL_GIT_COMMIT_SHA };
  try {
    process.env.GIT_SHA = "abc123";
    // On a Vercel build both are set, and the host's own commit is the more specific one.
    process.env.VERCEL_GIT_COMMIT_SHA = "vercel999";
    assert.deepEqual(await (await health()).json(), { status: "ok", sha: "vercel999" });
    delete process.env.VERCEL_GIT_COMMIT_SHA;
    assert.deepEqual(await (await health()).json(), { status: "ok", sha: "abc123" });
  } finally {
    if (saved.git === undefined) delete process.env.GIT_SHA;
    else process.env.GIT_SHA = saved.git;
    if (saved.vercel !== undefined) process.env.VERCEL_GIT_COMMIT_SHA = saved.vercel;
  }
});

test(
  "health names the local commit instead of 'unknown' in a git checkout",
  // A source tarball or a packed deploy has no `.git`; the fallback test below covers that shape.
  { skip: !existsSync(".git") && "not a git checkout" },
  async () => {
    const saved = { git: process.env.GIT_SHA, vercel: process.env.VERCEL_GIT_COMMIT_SHA };
    try {
      delete process.env.GIT_SHA;
      delete process.env.VERCEL_GIT_COMMIT_SHA;
      const { sha } = await (await health()).json();
      assert.match(sha, /^[0-9a-f]{7,40}$/, `expected the build's commit, got ${JSON.stringify(sha)}`);
    } finally {
      if (saved.git !== undefined) process.env.GIT_SHA = saved.git;
      if (saved.vercel !== undefined) process.env.VERCEL_GIT_COMMIT_SHA = saved.vercel;
    }
  },
);

test("health keeps 'unknown' for a checkout with no git", async () => {
  const saved = { git: process.env.GIT_SHA, vercel: process.env.VERCEL_GIT_COMMIT_SHA };
  const empty = mkdtempSync(join(tmpdir(), "es-health-"));
  try {
    delete process.env.GIT_SHA;
    delete process.env.VERCEL_GIT_COMMIT_SHA;
    // No `process.chdir` here: the test runner shares one cwd across files, and a global chdir
    // would move every concurrently loading module. `buildSha` takes the directory to ask git in.
    assert.equal(buildSha(empty), "unknown");
    assert.deepEqual(await (await health()).json(), { status: "ok", sha: buildSha() });
  } finally {
    rmSync(empty, { recursive: true, force: true });
    if (saved.git !== undefined) process.env.GIT_SHA = saved.git;
    if (saved.vercel !== undefined) process.env.VERCEL_GIT_COMMIT_SHA = saved.vercel;
  }
});
