/**
 * The origin guard. A production build whose canonical points at `localhost` looks finished and is
 * invisible to search, so the guard has to fail on that tree — and stay quiet on a laptop one.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const SCRIPT = join(import.meta.dirname, "..", "scripts", "check-origin.mjs");

const PAGE = (origin) => `<!doctype html><html><head>
<link rel="canonical" href="${origin}/excel/sum-basics">
<meta property="og:url" content="${origin}/excel/sum-basics">
<script type="application/ld+json">{"@type":"Course","url":"${origin}/excel/sum-basics"}</script>
</head></html>`;

/** A stand-in build: one page plus a sitemap, in the two trees the guard walks. */
function build(origin) {
  const root = mkdtempSync(join(tmpdir(), "es-origin-"));
  mkdirSync(join(root, "legacy", "dist", "excel"), { recursive: true });
  mkdirSync(join(root, ".next", "server", "app"), { recursive: true });
  writeFileSync(join(root, "legacy", "dist", "excel", "sum-basics.html"), PAGE(origin));
  writeFileSync(join(root, "legacy", "dist", "sitemap.xml"), `<urlset><url><loc>${origin}/</loc></url></urlset>`);
  writeFileSync(join(root, ".next", "server", "app", "page.html"), PAGE(origin));
  return root;
}

const run = (root, env) =>
  spawnSync(process.execPath, [SCRIPT, "--root", root], {
    encoding: "utf8",
    env: { ...process.env, SITE_URL: "", SITE_ENV: "", ...env },
  });

test("a production build on the laptop fallback fails", () => {
  const root = build("http://localhost:4173");
  try {
    const result = run(root, { SITE_ENV: "production" });
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stderr, /SITE_URL is the fallback|do not use/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a production build on a stale origin fails, naming the file and the tag", () => {
  const root = build("http://localhost:4173");
  try {
    const result = run(root, { SITE_ENV: "production", SITE_URL: "https://excelsupreme.com" });
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stderr, /legacy\/dist\/excel\/sum-basics\.html: canonical http:\/\/localhost:4173/);
    assert.match(result.stderr, /7 of 7 URLs do not use https:\/\/excelsupreme\.com/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a production build on its own origin passes", () => {
  const root = build("https://excelsupreme.com");
  try {
    const result = run(root, { SITE_ENV: "production", SITE_URL: "https://excelsupreme.com" });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /every absolute URL uses https:\/\/excelsupreme\.com/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a laptop build is allowed to fall back", () => {
  const root = build("http://localhost:4173");
  try {
    const result = run(root, {});
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /SITE_ENV is not "production"/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an empty tree is an error, not a pass", () => {
  const root = mkdtempSync(join(tmpdir(), "es-origin-empty-"));
  try {
    const result = run(root, {});
    assert.equal(result.status, 2, result.stdout);
    assert.match(result.stderr, /No build output/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
