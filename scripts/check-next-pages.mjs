#!/usr/bin/env node
/**
 * Proves the Next.js routes render what the static build renders: every lesson page, the dashboard, the
 * group pages and the index prerendered by `next build` must contain the exact fragment the shared
 * template returns. Run after
 * `npm run next:build`. A route that quietly drops the rail, the pager or the client script fails here,
 * and so does a sitemap that drops a lesson or lists a redirect.
 *
 *   node scripts/check-next-pages.mjs      (npm run next:check)
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { dashboardGroups, prepareDashboardPage } from "../legacy/src/site/dashboard-page.mjs";
import { prepareArticlePage, prepareFunctionsHub } from "../legacy/src/site/article-page.mjs";
import { prepareExercisePage } from "../legacy/src/site/exercise-page.mjs";
import { prepareIndexPage } from "../legacy/src/site/index-page.mjs";
import { prepareAboutPage, prepareExercisesHub } from "../legacy/src/site/hub-page.mjs";
import { prepareLegalPage } from "../legacy/src/site/legal-page.mjs";
import { preparePricingPage } from "../legacy/src/site/pricing-page.mjs";
import { indexablePaths } from "../legacy/src/site/seo.mjs";
import { loadSite } from "../lib/site.js";
import nextConfig from "../next.config.mjs";

const ROOT = process.cwd();
const PAGES = join(ROOT, ".next/server/app");

// The same inputs the routes use, including the `/learn/excel/<slug>` path rewrite, so this compares
// "what the route rendered" with "what the template says" rather than two different content models.
const { config, track, index, icons, clientAvailable, dashboardAvailable, articles, entryFor, articleDrillAvailable } = loadSite();

const problems = [];
let checked = 0;

function checkPage({ file, args, prepare }) {
  const path = join(PAGES, file);
  if (!existsSync(path)) {
    problems.push(`${file}: not prerendered — is next build behind legacy/content?`);
    return;
  }
  const html = readFileSync(path, "utf8");
  const { body, page } = prepare(args);
  // The page renders the template fragment verbatim; a wrapper element around it is fine.
  if (!html.includes(body)) problems.push(`${file}: <main> markup differs from the shared template`);
  const probes = [
    ["site header", 'class="site"'],
    ["footer", 'class="foot"'],
    ["skip link", 'class="skip"'],
  ];
  for (const [label, probe] of probes) {
    if (!html.includes(probe)) problems.push(`${file}: ${label} is missing`);
  }
  // A page the template gives no structured data to must not sprout one in the route either.
  if (!page.jsonLd && html.includes("application/ld+json")) {
    problems.push(`${file}: ships JSON-LD the template does not`);
  }
  checked += 1;
}

// The two pages that carry the site's menu. `projectsAvailable` and `appPagesAvailable` are host facts,
// not content: the Next deploy serves `/projects` and the signed-in surfaces, the static build does not,
// so only these two arguments differ from the build's. They must match what `app/page.js` and
// `app/learn/page.js` pass, or this check compares a page against a template that was never rendered.
const menu = { projectsAvailable: true, appPagesAvailable: true };

checkPage({
  file: "index.html",
  prepare: prepareIndexPage,
  args: { config, track, index, icons, clientAvailable, ...menu },
});

checkPage({
  file: "learn.html",
  prepare: prepareDashboardPage,
  args: { config, track, index, icons, clientAvailable: dashboardAvailable, ...menu },
});

/** The island's two halves: the payload it reads and the script that reads it. Both pages need both. */
function checkIsland(file) {
  const path = join(PAGES, file);
  if (!existsSync(path)) return; // checkPage already fails a page that was not prerendered
  const html = readFileSync(path, "utf8");
  for (const [probe, label] of [
    ['id="dashboard-data"', "the progress payload the island reads"],
    ["/assets/client/dashboard.js", "the island script"],
  ]) {
    if (!html.includes(probe)) problems.push(`${file}: ${label} is missing`);
  }
}

checkIsland("learn.html");

// The offer the drill's wall links to. `noindex` and out of the sitemap, so the assertion below — that
// the sitemap matches `indexablePaths()` entry for entry — stays the proof that it did not leak in.
checkPage({
  file: "pricing.html",
  prepare: preparePricingPage,
  args: { config, track, index, icons },
});

// The indexable pages that are not lessons. Their sitemap entries are asserted below against
// `indexablePaths()`, so a route that drops one fails both checks.
for (const kind of ["privacy", "terms"]) {
  checkPage({
    file: `${kind}.html`,
    prepare: prepareLegalPage,
    args: { config, track, index, icons, kind },
  });
}

// The hubs' ways out include the host surfaces, the same as the index: `app/excel-exercises/page.js`
// and `app/about/page.js` pass `menu` too.
checkPage({
  file: "excel-exercises.html",
  prepare: prepareExercisesHub,
  args: { config, track, index, icons, clientAvailable, ...menu },
});

checkPage({
  file: "about.html",
  prepare: prepareAboutPage,
  args: { config, track, index, icons, clientAvailable, ...menu },
});

// One page per group: the group's own hub, indexable, with the keyword in the heading. The sitemap
// assertion below proves they are published; `checkPage` proves the route renders the hub, not the
// filtered dashboard.
for (const { id } of dashboardGroups({ track, index })) {
  const file = `learn/groups/${id}.html`;
  checkPage({
    file,
    prepare: prepareDashboardPage,
    args: { config, track, index, icons, clientAvailable: dashboardAvailable, group: id },
  });
  checkIsland(file);
}

for (const entry of index) {
  checkPage({
    file: `learn/excel/${entry.slug}.html`,
    prepare: prepareExercisePage,
    // `articles` too: a lesson whose note exists carries the door to it, and a route that stopped
    // passing the notes would lose that door without any other check noticing.
    args: { config, track, index, entry, icons, clientAvailable, articles },
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

// The function notes and the hub that lists them. A note borrows one lesson's first screen, so the
// route has to find that lesson: a note whose drill silently disappeared renders a page that still
// passes every other check, which is why the drill's payload is asserted here.
if (articles.length > 0) {
  checkPage({
    file: "excel-functions.html",
    prepare: prepareFunctionsHub,
    args: { config, track, index, articles, icons, clientAvailable: articleDrillAvailable },
  });
}

for (const article of articles) {
  const file = `excel-functions/${article.slug}.html`;
  checkPage({
    file,
    prepare: prepareArticlePage,
    args: {
      config,
      track,
      index,
      articles,
      article,
      entry: entryFor(article.exercise),
      clientAvailable: articleDrillAvailable,
    },
  });
  const path = join(PAGES, file);
  const html = existsSync(path) ? readFileSync(path, "utf8") : "";
  for (const [probe, label] of [
    ['id="article-data"', "the drill payload the note grades against"],
    ["/assets/client/article-drill.js", "the note drill script"],
  ]) {
    if (html && !html.includes(probe)) problems.push(`${file}: ${label} is missing`);
  }
}

// The route list must cover the lesson files on disk: a lesson the loader never saw is a page the
// deploy silently does not have, and nothing above would notice because nothing above knows the count.
const files = readdirSync(join(ROOT, "legacy/content/exercises")).filter((name) => name.endsWith(".json"));
if (index.length !== files.length) {
  problems.push(`content has ${index.length} lessons, expected ${files.length} files in legacy/content/exercises`);
}

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
    // The list has to be `indexablePaths()`' list, in its order — the same one `legacy/src/verify.mjs`
    // asserts against the static build's sitemap, so the two deploys cannot disagree about what they
    // publish without one of them going red.
    const expected = indexablePaths({
      config,
      index,
      groups: dashboardGroups({ track, index }),
      articles: articles.map((article) => ({ path: `/excel-functions/${article.slug}`, updated: article.updated })),
      extra: articles.length > 0 ? ["exercises", "functions", "about", "privacy", "terms"] : ["exercises", "about", "privacy", "terms"],
    }).map((item) => `${config.baseUrl}${item.path}`);
    if (locs.length !== expected.length) {
      problems.push(`${file}: lists ${locs.length} URLs, expected ${expected.length}`);
    }
    for (const url of expected) {
      if (!locs.includes(url)) problems.push(`${file}: does not list ${url}`);
    }
    if (!locs.some((loc) => loc.includes("/learn/groups/"))) {
      problems.push(`${file}: lists none of the group hubs, which are indexable`);
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
