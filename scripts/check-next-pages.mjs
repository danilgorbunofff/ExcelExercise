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
import { prepareFormulaPage, prepareFormulasHub } from "../legacy/src/site/formula-page.mjs";
import { prepareAboutPage, prepareExercisesHub } from "../legacy/src/site/hub-page.mjs";
import { prepareLegalPage } from "../legacy/src/site/legal-page.mjs";
import { preparePricingPage } from "../legacy/src/site/pricing-page.mjs";
import { prepareSearchPage } from "../legacy/src/site/search-page.mjs";
import { prepareShortcutPage, prepareShortcutsHub } from "../legacy/src/site/shortcut-page.mjs";
import { indexablePaths } from "../legacy/src/site/seo.mjs";
import { CARD_PATH, cardKey } from "../legacy/src/site/social.mjs";
import { loadSite } from "../lib/site.js";
import { EXTRA } from "../app/sitemap.js";
import nextConfig from "../next.config.mjs";

const ROOT = process.cwd();
const PAGES = join(ROOT, ".next/server/app");

// The same inputs the routes use, including the `/learn/excel/<slug>` path rewrite, so this compares
// "what the route rendered" with "what the template says" rather than two different content models.
const {
  config,
  track,
  index,
  icons,
  clientAvailable,
  dashboardAvailable,
  articles,
  formulas,
  shortcuts,
  entryFor,
  articleDrillAvailable,
  clientAvailable: shortcutsAvailable,
} = loadSite();

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
  // The preview a link turns into. Next replaces metadata objects instead of merging them, so a page
  // that sets `openGraph` without `images` drops the layout's card and ships a text-only preview — the
  // exact failure this pair of assertions exists to catch.
  const card = `${config.baseUrl}${CARD_PATH(cardKey(page.path))}`;
  if (!html.includes(`property="og:image" content="${card}"`)) {
    problems.push(`${file}: og:image is not ${card}`);
  }
  if (!html.includes('name="twitter:card" content="summary_large_image"')) {
    problems.push(`${file}: twitter:card is not summary_large_image`);
  }
  if (!html.includes('rel="manifest" href="/manifest.webmanifest"')) {
    problems.push(`${file}: the web app manifest is not linked`);
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

// The offer the exercise's wall links to. `noindex` and out of the sitemap, so the assertion below — that
// the sitemap matches `indexablePaths()` entry for entry — stays the proof that it did not leak in.
checkPage({
  file: "pricing.html",
  prepare: preparePricingPage,
  args: { config, track, index, icons },
});

// Search: the box, the index it carries, and the list of every exercise under it. `checkPage` compares
// the whole `<main>`, so a route that stopped passing the index would fail here rather than shipping a
// box that searches nothing.
checkPage({
  file: "search.html",
  prepare: prepareSearchPage,
  args: { config, track, index, articles, icons, clientAvailable, appPagesAvailable: Boolean(config.appUrl) },
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
// route has to find that lesson: a note whose exercise silently disappeared renders a page that still
// passes every other check, which is why the exercise's payload is asserted here.
if (articles.length > 0) {
  checkPage({
    file: "excel-functions.html",
    prepare: prepareFunctionsHub,
    args: { config, track, index, articles, formulas, icons, clientAvailable: articleDrillAvailable },
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
      formulas,
      article,
      entry: entryFor(article.exercise),
      clientAvailable: articleDrillAvailable,
    },
  });
  const path = join(PAGES, file);
  const html = existsSync(path) ? readFileSync(path, "utf8") : "";
  for (const [probe, label] of [["/assets/client/article-drill.js", "the note exercise script"]]) {
    if (html && !html.includes(probe)) problems.push(`${file}: ${label} is missing`);
  }
  // The route has to render one island per listed exercise, each with its own payload: a note that lists
  // five exercises and ships one is a page whose practice section stops halfway, and a note whose islands
  // share one payload grades four of them against the wrong screen.
  const islands = (html.match(/class="article-drill"/g) ?? []).length;
  if (html && islands !== article.drills.length) {
    problems.push(`${file}: renders ${islands} exercise islands, the note lists ${article.drills.length}`);
  }
  for (let n = 1; n <= article.drills.length; n += 1) {
    if (html && !html.includes(`id="article-data-${n}"`)) {
      problems.push(`${file}: exercise ${n} has no payload to grade against`);
    }
  }
}

// The problem silo: a hub, one page per problem, and the same borrowed exercise a note gets. The island
// count is asserted for the same reason it is on a note: a page that lists an exercise and ships no payload
// grades nothing.
if (formulas.length > 0) {
  checkPage({
    file: "formulas.html",
    prepare: prepareFormulasHub,
    args: { config, track, index, articles, formulas, icons, clientAvailable: articleDrillAvailable },
  });
}

for (const formula of formulas) {
  const file = `formulas/${formula.slug}.html`;
  checkPage({
    file,
    prepare: prepareFormulaPage,
    args: {
      config,
      track,
      index,
      articles,
      formulas,
      formula,
      clientAvailable: articleDrillAvailable,
    },
  });
  const path = join(PAGES, file);
  const html = existsSync(path) ? readFileSync(path, "utf8") : "";
  if (html && !html.includes("/assets/client/article-drill.js")) {
    problems.push(`${file}: the problem exercise script is missing`);
  }
  const islands = (html.match(/class="article-drill"/g) ?? []).length;
  if (html && islands !== formula.drills.length) {
    problems.push(`${file}: renders ${islands} exercise islands, the page lists ${formula.drills.length}`);
  }
  for (let n = 1; n <= formula.drills.length; n += 1) {
    if (html && !html.includes(`id="article-data-${n}"`)) {
      problems.push(`${file}: exercise ${n} has no payload to grade against`);
    }
  }
}

// The shortcut silo: the hub with its filter box, and one page per family. The route passes
// `lessonBase` because this app serves exercises at `/learn/excel/...`, so a page compared against a
// template built with the static edition's base would differ on its practice button and its one prose
// link — the exact drift this check exists to catch.
if (shortcuts.length > 0) {
  checkPage({
    file: "shortcuts.html",
    prepare: prepareShortcutsHub,
    args: { config, track, index, shortcuts, clientAvailable: shortcutsAvailable },
  });
}

for (const shortcut of shortcuts) {
  const file = `shortcuts/${shortcut.slug}.html`;
  const args = {
    config,
    track,
    index,
    shortcuts,
    shortcut,
    lessonBase: "/learn/excel",
    clientAvailable: shortcutsAvailable,
  };
  checkPage({ file, prepare: prepareShortcutPage, args });
  const path = join(PAGES, file);
  const html = existsSync(path) ? readFileSync(path, "utf8") : "";
  if (html && !html.includes("/assets/client/shortcuts.js")) {
    problems.push(`${file}: the shortcut script is missing`);
  }
  // The keycaps and the table are the page. A route that shipped the markdown table instead would
  // still pass the `<main>` comparison only if the template did too, so assert the shape here.
  const platform = (html.match(/class="platform-tab"/g) ?? []).length;
  if (html && platform !== shortcut.platforms.length) {
    problems.push(`${file}: renders ${platform} platform tabs, the family offers ${shortcut.platforms.length}`);
  }
  for (const action of shortcut.rows) {
    if (html && !html.includes(`<th scope="row">${action.action}</th>`)) {
      problems.push(`${file}: row "${action.action}" is missing from the keys table`);
    }
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
      formulas: formulas.map((formula) => ({ path: `/formulas/${formula.slug}`, updated: formula.updated })),
      shortcuts,
      extra: EXTRA,
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
