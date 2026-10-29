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
