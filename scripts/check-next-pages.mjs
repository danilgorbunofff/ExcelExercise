#!/usr/bin/env node
/**
 * Proves the Next.js routes render what the static build renders: every lesson page and the index
 * prerendered by `next build` must contain the exact fragment the shared template returns. Run after
 * `npm run next:build`. A route that quietly drops the rail, the pager or the client script fails here,
 * and so does a sitemap that drops a lesson or lists a redirect.
 *
 *   node scripts/check-next-pages.mjs      (npm run next:check)
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { prepareExercisePage } from "../legacy/src/site/exercise-page.mjs";
import { prepareIndexPage } from "../legacy/src/site/index-page.mjs";
import { loadSite } from "../lib/site.js";
import nextConfig from "../next.config.mjs";

const ROOT = process.cwd();
const PAGES = join(ROOT, ".next/server/app");

// The same inputs the routes use, including the `/learn/excel/<slug>` path rewrite, so this compares
// "what the route rendered" with "what the template says" rather than two different content models.
const { config, track, index, icons, clientAvailable } = loadSite();

const problems = [];
let checked = 0;

function checkPage({ file, args, prepare }) {
  const path = join(PAGES, file);
  if (!existsSync(path)) {
    problems.push(`${file}: not prerendered — is next build behind legacy/content?`);
    return;
  }
  const html = readFileSync(path, "utf8");
  const { body } = prepare(args);
  // The page renders the template fragment verbatim; a wrapper element around it is fine.
  if (!html.includes(body)) problems.push(`${file}: <main> markup differs from the shared template`);
  for (const [label, probe] of [
    ["site header", 'class="site"'],
    ["footer", 'class="foot"'],
    ["skip link", 'class="skip"'],
    ["JSON-LD", "application/ld+json"],
  ]) {
    if (!html.includes(probe)) problems.push(`${file}: ${label} is missing`);
  }
  checked += 1;
}

checkPage({
  file: "index.html",
  prepare: prepareIndexPage,
  args: { config, track, index, icons, clientAvailable },
});

for (const entry of index) {
  checkPage({
    file: `learn/excel/${entry.slug}.html`,
    prepare: prepareExercisePage,
    args: { config, track, index, entry, icons, clientAvailable },
  });
  const html = existsSync(join(PAGES, `learn/excel/${entry.slug}.html`))
    ? readFileSync(join(PAGES, `learn/excel/${entry.slug}.html`), "utf8")
    : "";
  if (html && !html.includes("/assets/client/drill.js")) {
    problems.push(`learn/excel/${entry.slug}.html: the client island script is missing`);
  }
  if (html && !html.includes('id="exercise-data"')) {
    problems.push(`learn/excel/${entry.slug}.html: the exercise payload the island reads is missing`);
  }
}

if (index.length !== 10) problems.push(`content has ${index.length} lessons, expected 10`);

// Every URL the static build publishes must still resolve. The lesson route is a real route; the old
// `/excel/<slug>` and `/index.html` shapes are permanent redirects that phase 6 extends.
const redirects = await nextConfig.redirects();
for (const [source, destination] of [
  ["/excel/:slug", "/learn/excel/:slug"],
  ["/index.html", "/"],
]) {
  const rule = redirects.find((candidate) => candidate.source === source);
  if (!rule) problems.push(`next.config.mjs: no redirect for the legacy URL ${source}`);
  else if (rule.destination !== destination) {
    problems.push(`next.config.mjs: ${source} redirects to ${rule.destination}, expected ${destination}`);
  } else if (!rule.permanent) {
    problems.push(`next.config.mjs: ${source} must redirect permanently`);
  }
}

// The metadata routes ship with the deploy too. A sitemap that drops a lesson, or advertises an
// address that only redirects, is a regression no HTML comparison above can see.
for (const [file, pattern] of [
  ["sitemap.xml.body", /<loc>[^<]+<\/loc>/],
  ["robots.txt.body", /^Sitemap: \S+\/sitemap\.xml$/m],
]) {
  const path = join(PAGES, file);
  if (!existsSync(path)) {
    problems.push(`${file}: not prerendered — the metadata route is missing from the build`);
    continue;
  }
  const text = readFileSync(path, "utf8");
  if (!pattern.test(text)) problems.push(`${file}: does not contain what the route returns`);
  if (file === "sitemap.xml.body") {
    const locs = [...text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
    if (locs.length !== index.length + 1) {
      problems.push(`${file}: lists ${locs.length} URLs, expected ${index.length + 1}`);
    }
    for (const entry of index) {
      if (!locs.includes(`${config.baseUrl}${entry.path}`)) problems.push(`${file}: does not list ${entry.path}`);
    }
    if (locs.some((loc) => !loc.startsWith(`${config.baseUrl}/`))) {
      problems.push(`${file}: lists a URL outside ${config.baseUrl}`);
    }
  }
}

if (problems.length > 0) {
  console.error(`next routes: ${problems.length} problem(s)`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}

console.log(`next routes: ${checked} prerendered pages match the shared templates`);
