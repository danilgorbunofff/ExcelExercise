#!/usr/bin/env node
/**
 * Post-build verification. Reads the emitted `dist/` the way a crawler and a stranger
 * would and asserts the things a green build log cannot prove: that the prompt, the
 * docs, the reference answer and the payload are actually in the HTML, that the JSON-LD
 * parses, that the sitemap covers the track, and that no page points at another origin.
 *
 *   node src/verify.mjs                 # verify ./dist
 *   node src/verify.mjs --dist=/tmp/out
 *
 * Run it after `npm run build`. It never rebuilds: a verifier that repairs its own
 * subject can pass a page that was never written.
 */

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { gzipSync } from "node:zlib";

import { siteConfig } from "./site/config.mjs";
import { loadArticles, loadContent, loadFormulas, loadShortcuts } from "./site/content.mjs";
import { dashboardGroups } from "./site/dashboard-page.mjs";
import { proofEntry } from "./site/index-page.mjs";
import { extraKeys, indexablePaths } from "./site/seo.mjs";
import { esc } from "./site/html.mjs";
import { DEFAULT_PLAN, GUARANTEE, PLANS, PRICE, REFUND_DAYS } from "./site/offer.mjs";
import { referenceOf, revealOf, screenAt } from "./site/packages.mjs";
import { imageUrl } from "./site/sheet.mjs";
import { workbookName } from "./xlsx.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

/** Origins the HTML may legitimately name: ours, plus the vocabulary JSON-LD requires. */
const ALLOWED_ORIGINS = ["https://schema.org"];

/** The five docs sections every lesson promises, by id. */
const DOCS_SECTIONS = ["docs-what", "docs-syntax", "docs-example", "docs-errors", "docs-work"];

function extract(html, pattern) {
  const match = html.match(pattern);
  return match ? match[1] : null;
}

export function verify({ root = ROOT, dist, env = process.env } = {}) {
  const config = siteConfig(env);
  const distDir = dist ?? join(root, "dist");
  const failures = [];
  let checks = 0;

  const ok = (condition, label, why = "is missing") => {
    checks += 1;
    if (!condition) failures.push(`${label} ${why}`);
    return Boolean(condition);
  };
  const has = (html, needle, label) =>
    ok(html.includes(needle), label, `does not contain ${JSON.stringify(needle)}`);

  /**
   * The download on a page, the file it names, and the ZIP magic that proves it opens. One function
   * because a lesson, a note and a problem page all link to the same kind of file, and a rename should
   * fail the gate in all three rather than in whichever copy drifted.
   */
  const checkDownload = (html, label, slug, screen) => {
    const name = workbookName(slug, screen.id);
    has(html, `href="/assets/files/${name}"`, `${label} download link`);
    const file = join(distDir, "assets/files", name);
    if (!ok(existsSync(file), `${label} workbook ${name}`, "is linked but not on disk")) return;
    ok(readFileSync(file).subarray(0, 4).equals(Buffer.from("PK\x03\x04")), `${label} workbook ${name}`, "is not a ZIP");
  };

  if (!existsSync(distDir)) {
    return { pages: 0, checks: 0, failures: [`${distDir} does not exist — run \`npm run build\` first`] };
  }

  const { track, index } = loadContent(join(root, "content"));
  const articles = loadArticles(join(root, "content"));
  const formulas = loadFormulas(join(root, "content"));
  const shortcuts = loadShortcuts(join(root, "content"));
  const articlePaths = articles.map((article) => `/excel-functions/${article.slug}`);
  const read = (path) => readFileSync(join(distDir, path), "utf8");

  // --- every lesson page -------------------------------------------------------------
  for (const entry of index) {
    const file = `excel/${entry.slug}.html`;
    const label = file;
    if (!ok(existsSync(join(distDir, file)), label, "does not exist")) continue;
    const html = read(file);
    const { exercise } = entry;
    const screen = screenAt(exercise);

    has(html, `<h1>${esc(exercise.title)}</h1>`, `${label} title`);
    // Anchored to the element: the same text also sits in #exercise-data, so a bare
    // `includes` would stay green with the visible task statement deleted.
    exercise.screens.forEach((s, position) =>
      has(html, `<p class="task">${esc(s.prompt)}</p>`, `${label} screen ${position + 1} prompt`),
    );
    for (const id of DOCS_SECTIONS) has(html, `id="${id}"`, `${label} ${id} section`);
    has(
      html,
      `<pre class="reference" tabindex="0"><code id="docs-reference">${esc(referenceOf(exercise, screen))}</code></pre>`,
      `${label} reference answer`,
    );
    has(html, `<pre class="syntax" tabindex="0"><code>${esc(exercise.docs.syntax)}</code></pre>`, `${label} syntax block`);

    // The client is the only consumer of this block, so a silent shape change would
    // surface as a broken drill rather than a failed build.
    const raw = extract(html, /<script type="application\/json" id="exercise-data">([\s\S]*?)<\/script>/);
    if (ok(raw !== null, `${label} #exercise-data`, "is absent")) {
      let payload = null;
      try {
        payload = JSON.parse(raw);
      } catch (error) {
        ok(false, `${label} #exercise-data`, `is not valid JSON (${error.message})`);
      }
      if (payload) {
        ok(payload.id === exercise.id, `${label} payload id`, `is "${payload.id}", expected "${exercise.id}"`);
        ok(
          Array.isArray(payload.screens) && payload.screens.length === exercise.screens.length,
          `${label} payload screens`,
          `lists ${payload.screens?.length} of ${exercise.screens.length}`,
        );
        exercise.screens.forEach((s, position) => {
          const sent = payload.screens?.[position];
          const where = `${label} payload screens[${position}]`;
          const type = s.type ?? "formula";
          ok(sent?.type === type, `${where}.type`, `is "${sent?.type}", expected "${type}"`);
          ok(isDeepStrictEqual(sent?.expect, s.expect), `${where}.expect`, "does not match the exercise");
          ok(sent?.reference === revealOf(exercise, s), `${where}.reference`, "does not match the exercise");
          if (type === "picture") {
            ok(isDeepStrictEqual(sent?.answers, s.answers), `${where}.answers`, "does not match the exercise");
            ok(sent?.answerCell === undefined, `${where}.answerCell`, "is set on a picture screen");
            ok(sent?.image === s.image, `${where}.image`, "does not match the exercise");
            ok(typeof sent?.alt === "string" && sent.alt.length > 0, `${where}.alt`, "is empty");
          } else if (type === "workbook") {
            ok(isDeepStrictEqual(sent?.answers, s.answers), `${where}.answers`, "does not match the exercise");
            ok(sent?.answerCell === undefined, `${where}.answerCell`, "is set on a workbook screen");
            ok(sent?.sheet === undefined, `${where}.sheet`, "ships the sheet to the client");
          } else {
            ok(sent?.answerCell === s.answerCell, `${where}.answerCell`, `is "${sent?.answerCell}"`);
          }
        });
        ok(
          payload.docs?.reference === exercise.docs.reference,
          `${label} payload docs.reference`,
          "does not match the exercise",
        );
        ok(payload.track?.number === entry.number, `${label} payload track.number`, `is "${payload.track?.number}"`);
        ok(payload.track?.free === entry.free, `${label} payload track.free`, `is "${payload.track?.free}"`);
        ok(payload.track?.total === index.length, `${label} payload track.total`, `is "${payload.track?.total}"`);
      }
    }

    const ldRaw = extract(html, /<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    if (ok(ldRaw !== null, `${label} JSON-LD`, "is absent")) {
      let ld = null;
      try {
        ld = JSON.parse(ldRaw);
      } catch (error) {
        ok(false, `${label} JSON-LD`, `is not valid JSON (${error.message})`);
      }
      if (ld) {
        // The page emits a `@graph`: the drill and the trail that leads to it. Both are checked, because
        // the breadcrumb is what puts the group name in the result instead of a bare slug.
        const nodes = Array.isArray(ld["@graph"]) ? ld["@graph"] : [ld];
        const drill = nodes.find((node) => node["@type"] === "LearningResource");
        const url = `${config.baseUrl}${entry.path}`;
        if (ok(Boolean(drill), `${label} JSON-LD @type`, "has no LearningResource node")) {
          ok(drill.url === url, `${label} JSON-LD url`, `is "${drill.url}", expected "${url}"`);
          ok(drill["@id"] === `${url}#drill`, `${label} JSON-LD @id`, `is "${drill["@id"]}"`);
          // The name has to be the heading the page shows. `seo.title` is the `<title>`, which may be
          // longer; a name the reader never sees is a claim, not a label.
          ok(drill.name === exercise.title, `${label} JSON-LD name`, `is "${drill.name}"`);
          ok(drill.position === entry.number, `${label} JSON-LD position`, `is "${drill.position}"`);
          ok(
            drill.isAccessibleForFree === entry.free,
            `${label} JSON-LD isAccessibleForFree`,
            `is "${drill.isAccessibleForFree}"`,
          );
          ok(
            drill.isPartOf?.["@id"] === `${config.baseUrl}/#${track.id}`,
            `${label} JSON-LD isPartOf`,
            "does not name the course",
          );
        }
        const trail = nodes.find((node) => node["@type"] === "BreadcrumbList");
        if (ok(Boolean(trail), `${label} JSON-LD breadcrumb`, "is absent")) {
          const positions = trail.itemListElement.map((step) => step.position);
          ok(
            positions.every((value, at) => value === at + 1),
            `${label} JSON-LD breadcrumb`,
            "has positions that do not run 1..n",
          );
          ok(
            trail.itemListElement.at(-1)?.item === url,
            `${label} JSON-LD breadcrumb`,
            "does not end on the lesson itself",
          );
        }
      }
    }

    // A picture screen is the image: the tag and its src have to survive the render, and the
    // asset check below proves the file the src names is really in dist.
    for (const [position, s] of exercise.screens.entries()) {
      if (s.type !== "picture") continue;
      const where = `${label} screen ${position + 1}`;
      has(html, `class="picture-img" src="${imageUrl(s.image)}"`, `${where} image`);
      has(html, `alt="${esc(s.alt)}"`, `${where} image alt`);
      has(html, `id="picture-${position}"`, `${where} figure`);
    }

    // A workbook screen is a real download: the link, the block, then the file itself.
    for (const [position, s] of exercise.screens.entries()) {
      if (s.type !== "workbook") continue;
      const where = `${label} screen ${position + 1}`;
      has(html, `id="workbook-${position}"`, `${where} workbook block`);
      checkDownload(html, where, entry.slug, s);
    }

    // A formula screen ships the grid it draws as a file as well, so a learner who works in Excel
    // takes the same rows away instead of retyping them — and the answer is on the second tab.
    for (const [position, s] of exercise.screens.entries()) {
      if (s.type !== "formula") continue;
      checkDownload(html, `${label} screen ${position + 1}`, entry.slug, s);
    }

    // Every asset the page asks for must exist; a rename would otherwise 404 in silence.
    for (const [, url] of html.matchAll(/(?:href|src)="(\/assets\/[^"]+)"/g)) {
      ok(existsSync(join(distDir, url.slice(1))), `${label} asset ${url}`, "is referenced but not on disk");
    }
  }

  // --- index ------------------------------------------------------------------------
  if (ok(existsSync(join(distDir, "index.html")), "index.html", "does not exist")) {
    const html = read("index.html");
    has(html, `<h1>${esc(track.title)}</h1>`, "index.html heading");
    for (const entry of index) has(html, `href="${entry.path}"`, `index.html link to ${entry.path}`);

    // The landing page shows the product instead of describing it: a real drill's grid, and the
    // grader's own sentence about a real near miss. It has to stay a picture of the product — an
    // answer cell here would be a control that does nothing — and its words have to come from the
    // lesson, so the hero cannot drift away from what the grader actually says. Membership tests,
    // not a second copy of the choice `renderProof` makes.
    const proofScreen = proofEntry(index)?.exercise.screens.find((screen) => screen.type === "formula");
    if (ok(Boolean(proofScreen), "index.html proof", "has no formula screen to draw")) {
      const start = html.indexOf('<figure class="proof">');
      if (ok(start !== -1, "index.html proof sheet", "is missing")) {
        const proof = html.slice(start, html.indexOf("</figure>", start));
        ok(!proof.includes("tabindex"), "index.html proof sheet", "has a tab stop, so it is a control that does nothing");
        ok(!proof.includes("cell-target"), "index.html proof sheet", "marks an answer cell, so it looks answerable");
        ok(
          proofScreen.fixtures.accept.some((formula) => proof.includes(`<code class="proof-formula">${esc(formula)}</code>`)),
          "index.html proof formula",
          "is not one of the lesson's accepted answers",
        );
        ok(
          proofScreen.fixtures.reject.some((entry) => proof.includes(`<q>${esc(entry.why)}</q>`)),
          "index.html proof verdict",
          "does not quote one of the grader's own reasons",
        );
      }
    }
  }

  // --- the drawer ------------------------------------------------------------------
  // The header is the mark, the count and the badge; every way into the site now hangs off one button
  // that opens a `<dialog>`. Two halves are checked on the pages a stranger can land on — the button
  // that opens it, with the name of what it opens, and the dialog itself sitting outside `<main>` as
  // a sibling of the header. A page that rendered only one of them has a button wired to nothing, and
  // a build that dropped the rows has no navigation at all.
  for (const page of ["index.html", "learn/index.html", "pricing/index.html", "terms/index.html", "404.html"]) {
    const path = join(distDir, page);
    if (!ok(existsSync(path), page, "does not exist")) continue;
    const html = read(page);
    has(html, '<button class="menu-toggle" id="menu-open"', `${page} menu button`);
    has(html, 'aria-controls="site-menu"', `${page} menu button name`);
    has(html, 'aria-expanded="false"', `${page} menu button starts closed`);
    has(html, '<dialog class="menu" id="site-menu"', `${page} drawer`);
    has(html, 'id="menu-heading"', `${page} drawer heading`);
    has(html, 'class="menu-close"', `${page} drawer close button`);
    has(html, '<script type="module" src="/assets/client/menu.js">', `${page} drawer script`);
    has(html, 'href="/pricing"', `${page} drawer pricing row`);
    has(html, 'class="menu-list menu-list-foot"', `${page} drawer foot block`);
    // The drawer names destinations in words. A `menu-tile` is the glyph column that said nothing the
    // label did not, and a `menu-group` is a caption doing the same.
    ok(
      !html.includes('class="menu-tile"') && !html.includes('class="menu-group"'),
      `${page} drawer rows`,
      "have gone back to glyph tiles or group captions",
    );
    ok(
      html.indexOf('<dialog class="menu"') < html.indexOf("<main"),
      `${page} drawer placement`,
      "is inside the page, where showModal has nothing to move out of the flow",
    );
    // The old wall of links is gone; a page that still ships it has two navigations competing. A `ways`
    // list left on a page is one of the related-exercise rails, not navigation.
    ok(!html.includes('class="ways"'), `${page} drawer replaced the wall`, "still carries the old ways-out list");
  }

  // --- dashboard --------------------------------------------------------------------
  // `/learn` is a real page for a stranger without JavaScript: the whole track, in order, grouped.
  // What it cannot have is a per-browser number, so the counts it ships are zeroes and the island
  // replaces them. `noindex` is checked here because a sitemap entry for it would be a lie.
  if (ok(existsSync(join(distDir, "learn/index.html")), "learn/index.html", "does not exist")) {
    const html = read("learn/index.html");
    has(html, "<h1>Your progress</h1>", "learn/index.html heading");
    has(html, '<meta name="robots" content="noindex">', "learn/index.html noindex");
    for (const entry of index) has(html, `href="${entry.path}"`, `learn/index.html link to ${entry.path}`);
    for (const group of track.groups) {
      if (!index.some((entry) => entry.group === group.id)) continue;
      has(html, `id="group-${group.id}"`, `learn/index.html ${group.id} group`);
      has(html, `data-group-count="${group.id}"`, `learn/index.html ${group.id} counter`);
      has(html, `href="/learn/groups/${group.id}"`, `learn/index.html ${group.id} page link`);
    }
    ok(
      !html.includes('type="application/ld+json"'),
      "learn/index.html",
      "carries JSON-LD for a page that is not in the index",
    );

    const raw = extract(html, /<script type="application\/json" id="dashboard-data">([\s\S]*?)<\/script>/);
    if (ok(raw !== null, "learn/index.html #dashboard-data", "is absent")) {
      let payload = null;
      try {
        payload = JSON.parse(raw);
      } catch (error) {
        ok(false, "learn/index.html #dashboard-data", `is not valid JSON (${error.message})`);
      }
      if (payload) {
        ok(
          Array.isArray(payload.plan) && payload.plan.length === index.length,
          "learn/index.html #dashboard-data plan",
          `lists ${payload.plan?.length} of ${index.length} drills`,
        );
        index.forEach((entry, position) => {
          const sent = payload.plan?.[position];
          ok(sent?.id === entry.exercise.id, `learn/index.html plan[${position}].id`, `is "${sent?.id}"`);
          ok(sent?.path === entry.path, `learn/index.html plan[${position}].path`, `is "${sent?.path}"`);
          ok(sent?.group === entry.group, `learn/index.html plan[${position}].group`, `is "${sent?.group}"`);
        });
      }
    }

    for (const [, url] of html.matchAll(/(?:href|src)="(\/assets\/[^"]+)"/g)) {
      ok(existsSync(join(distDir, url.slice(1))), `learn/index.html asset ${url}`, "is referenced but not on disk");
    }

    // First paint has to fit in a second on a throttled connection, and nothing stands between the HTML
    // and the page: the counts are filled in after it renders, so the only thing that can grow the wait
    // is the bytes themselves. Slow 3G is about 50 kB/s, so the page plus the one stylesheet it loads
    // get half of that second — 25 kB gzipped — and the budget is 44 kB, enough slack for round trips
    // without letting a regression hide behind it. It was 40 kB until the navigation drawer, then 42 kB,
    // and the header and drawer glyphs — fifteen 16px icons, each drawn once per page, so no sprite is
    // cheaper than inline — cost about 2 kB gzipped and have to be paid for somewhere. 44 kB is 0.88 s
    // at 50 kB/s, still inside the second.
    // A missing stylesheet is priced as zero here and reported where it belongs, further down.
    const firstPaint = ["learn/index.html", "assets/styles.css"]
      .filter((file) => existsSync(join(distDir, file)))
      .reduce((total, file) => total + gzipSync(readFileSync(join(distDir, file))).length, 0);
    ok(
      firstPaint < 44_000,
      "learn/index.html first paint",
      `costs ${firstPaint} B gzipped, over the 44 kB a throttled second affords`,
    );
  }

  // --- group pages ------------------------------------------------------------------
  // One page per group that has drills: the group's own hub. It is indexable, listed in the sitemap,
  // and carries the keyword in the heading ("Looking values up in Excel"), because unlike `/learn` it
  // says the same thing to every reader.
  let groupPages = 0;
  for (const group of track.groups) {
    const entries = index.filter((entry) => entry.group === group.id);
    if (entries.length === 0) continue;
    const file = `learn/groups/${group.id}.html`;
    if (!ok(existsSync(join(distDir, file)), file, "does not exist")) continue;
    groupPages += 1;
    const html = read(file);
    has(html, `<h1>Excel exercises: ${esc(group.title)}</h1>`, `${file} heading`);
    ok(!html.includes('<meta name="robots" content="noindex">'), file, "is noindex, so it cannot rank");
    has(html, 'href="/excel-exercises"', `${file} back link`);
    has(html, `id="group-${group.id}"`, `${file} group section`);
    has(html, `data-group-count="${group.id}"`, `${file} counter`);
    has(html, 'id="dashboard-data"', `${file} progress payload`);
    has(html, "/assets/client/dashboard.js", `${file} island script`);
    for (const entry of entries) has(html, `href="${entry.path}"`, `${file} link to ${entry.path}`);
    // And only this group's rows: a page that quietly listed the whole track would still pass every
    // check above, because every link it needs is in there.
    const rows = [...html.matchAll(/data-lesson="([^"]+)"/g)].map((match) => match[1]);
    ok(
      rows.length === entries.length && entries.every((entry) => rows.includes(entry.exercise.id)),
      `${file} rows`,
      `lists ${rows.length} of ${entries.length} drills`,
    );
  }

  // --- function notes ---------------------------------------------------------------
  // A note is written prose plus a borrowed drill. The checks are the ones that keep it a note: one
  // heading, the canonical URL, the Article markup, a laballed input, and no FAQ or HowTo block, which
  // Google stopped showing as a rich result and which would now be a promise the page cannot keep.
  if (articles.length > 0) {
    const hub = "excel-functions/index.html";
    if (ok(existsSync(join(distDir, hub)), hub, "does not exist")) {
      const html = read(hub);
      has(html, 'href="/excel-functions/vlookup"', `${hub} first note link`);
      checkNoHeaderFact(html, hub);
      ok(!html.includes('<meta name="robots" content="noindex">'), hub, "is noindex, so it cannot rank");
      // Scoped to the note rows: the same hub also lists the problem pages, and those reuse the card.
      ok(
        (html.match(/class="article-card-title" href="\/excel-functions\//g) ?? []).length === articles.length,
        hub,
        "does not list every note",
      );
    }
    for (const article of articles) {
      const file = `excel-functions/${article.slug}/index.html`;
      const label = file;
      if (!ok(existsSync(join(distDir, file)), label, "does not exist")) continue;
      const html = read(file);
      ok((html.match(/<h1[\s>]/g) ?? []).length === 1, label, "does not have exactly one h1");
      has(html, `<h1>${esc(article.title)}</h1>`, `${label} heading`);
      checkNoHeaderFact(html, label);
      has(html, `<link rel="canonical" href="${config.baseUrl}/excel-functions/${article.slug}">`, `${label} canonical`);
      has(html, `"@type":"Article"`, `${label} Article markup`);
      has(html, `"@type":"BreadcrumbList"`, `${label} breadcrumb markup`);
      ok(!html.includes('"@type":"FAQPage"'), label, "carries FAQPage markup, which no longer earns a rich result");
      ok(!html.includes('"@type":"HowTo"'), label, "carries HowTo markup, which no longer earns a rich result");
      has(html, `id="article-drill-form-1"`, `${label} drill form`);
      has(html, `id="article-answer-1"`, `${label} drill input`);
      has(html, '<label class="article-drill-label" for="article-answer-1">', `${label} persistent label`);
      const islands = (html.match(/class="article-drill"/g) ?? []).length;
      ok(islands === article.drills.length, label, `ships ${islands} drill islands, the note lists ${article.drills.length}`);
      // A note borrows a lesson's first screen; the file that screen ships is the same file here.
      for (const slug of article.drills) {
        has(html, `href="/excel/${slug}"`, `${label} link to ${slug}`);
        const screen = index.find((item) => item.slug === slug)?.exercise.screens?.[0];
        if (screen) checkDownload(html, label, slug, screen);
      }
    }
  }

  // --- problem pages ----------------------------------------------------------------
  // A problem page is a note with the question first: one formula, then the same borrowed drill. The
  // checks are the note's plus the one thing that makes it a problem page, which is that the drill comes
  // before the cross-links, so a reader who wants to try it never scrolls past a list of other pages.
  if (formulas.length > 0) {
    const hub = "formulas/index.html";
    if (ok(existsSync(join(distDir, hub)), hub, "does not exist")) {
      const html = read(hub);
      ok(!html.includes('<meta name="robots" content="noindex">'), hub, "is noindex, so it cannot rank");
      checkNoHeaderFact(html, hub);
      for (const formula of formulas) has(html, `href="/formulas/${formula.slug}"`, `${hub} link to ${formula.slug}`);
    }
    for (const formula of formulas) {
      const file = `formulas/${formula.slug}/index.html`;
      const label = file;
      if (!ok(existsSync(join(distDir, file)), label, "does not exist")) continue;
      const html = read(file);
      ok((html.match(/<h1[\s>]/g) ?? []).length === 1, label, "does not have exactly one h1");
      has(html, `<h1>${esc(formula.title)}</h1>`, `${label} heading`);
      checkNoHeaderFact(html, label);
      has(html, `class="lede">${esc(formula.question)}<`, `${label} question`);
      has(html, `<link rel="canonical" href="${config.baseUrl}/formulas/${formula.slug}">`, `${label} canonical`);
      has(html, `"@type":"Article"`, `${label} Article markup`);
      has(html, `"@type":"BreadcrumbList"`, `${label} breadcrumb markup`);
      ok(!html.includes('"@type":"FAQPage"'), label, "carries FAQPage markup, which no longer earns a rich result");
      ok(!html.includes('"@type":"HowTo"'), label, "carries HowTo markup, which no longer earns a rich result");
      has(html, `id="article-drill-form-1"`, `${label} drill form`);
      has(html, '<label class="article-drill-label" for="article-answer-1">', `${label} persistent label`);
      const islands = (html.match(/class="article-drill"/g) ?? []).length;
      ok(islands === formula.drills.length, label, `ships ${islands} drill islands, the page lists ${formula.drills.length}`);
      for (const slug of formula.drills) {
        has(html, `href="/excel/${slug}"`, `${label} link to ${slug}`);
        const screen = index.find((item) => item.slug === slug)?.exercise.screens?.[0];
        if (screen) checkDownload(html, label, slug, screen);
      }
      const drillAt = html.indexOf('class="article-drill"');
      const nextAt = html.indexOf("Where to go next");
      ok(drillAt !== -1 && nextAt !== -1 && drillAt < nextAt, label, "puts the drill after the cross-links");
    }
  }

  // --- shortcut pages ---------------------------------------------------------------
  // The page is its table, so the checks are about the table: every row's action is on the page, a
  // platform the page does not offer has no tab, and the tab for the one it does offer is a link with
  // an address in it. The keys themselves are checked by the parser, not here.
  if (shortcuts.length > 0) {
    const hub = "shortcuts/index.html";
    if (ok(existsSync(join(distDir, hub)), hub, "does not exist")) {
      const html = read(hub);
      ok(!html.includes('<meta name="robots" content="noindex">'), hub, "is noindex, so it cannot rank");
      has(html, 'id="shortcut-search"', `${hub} search field`);
      checkNoHeaderFact(html, hub);
      for (const shortcut of shortcuts) {
        has(html, `href="/shortcuts/${shortcut.slug}"`, `${hub} link to ${shortcut.slug}`);
        for (const row of shortcut.rows) has(html, esc(row.action), `${hub} row "${row.action}"`);
      }
    }
    for (const shortcut of shortcuts) {
      const file = `shortcuts/${shortcut.slug}/index.html`;
      const label = file;
      if (!ok(existsSync(join(distDir, file)), label, "does not exist")) continue;
      const html = read(file);
      ok((html.match(/<h1[\s>]/g) ?? []).length === 1, label, "does not have exactly one h1");
      has(html, `<h1>${esc(shortcut.title)}</h1>`, `${label} heading`);
      checkNoHeaderFact(html, label);
      has(html, `<link rel="canonical" href="${config.baseUrl}/shortcuts/${shortcut.slug}">`, `${label} canonical`);
      has(html, `"@type":"Article"`, `${label} Article markup`);
      has(html, `"@type":"BreadcrumbList"`, `${label} breadcrumb markup`);
      has(html, 'id="shortcuts-banner"', `${label} touch banner`);
      ok((html.match(/class="platform-tab"/g) ?? []).length === shortcut.platforms.length, label,
        `offers a tab count that is not ${shortcut.platforms.length}`);
      for (const platform of shortcut.platforms) {
        has(html, `data-platform="${platform}"`, `${label} ${platform} column`);
        if (platform === "windows") {
          has(html, `href="/shortcuts/${shortcut.slug}"`, `${label} default tab link`);
        } else {
          has(html, `href="/shortcuts/${shortcut.slug}?platform=${platform}"`, `${label} ${platform} tab link`);
        }
      }
      for (const row of shortcut.rows) {
        has(html, `<th scope="row">${esc(row.action)}</th>`, `${label} row "${row.action}"`);
        const cell = row.cells.windows;
        if (!cell.none) has(html, `<span class="keycap">${esc(cell.keys.split(" + ")[0])}</span>`, `${label} keycaps`);
      }
      has(html, `href="/excel/${shortcut.practice}"`, `${label} link to its drill`);
      has(html, 'src="/assets/client/shortcuts.js"', `${label} script`);
    }
  }

  // --- pricing ----------------------------------------------------------------------
  // The page the drill's wall sends a reader to. It is `noindex` and out of the sitemap, so nothing
  // above would notice it going missing or drifting from what the drills actually charge for.
  if (ok(existsSync(join(distDir, "pricing/index.html")), "pricing/index.html", "does not exist")) {
    const html = read("pricing/index.html");
    has(
      html,
      `<h1>${index.filter((entry) => entry.free).length} exercises free. The rest from ${PRICE}</h1>`,
      "pricing/index.html heading",
    );
    const plans = PLANS.map((plan) => plan.id);
    // One product, one card: a fieldset with the term as a radio group, three labels and one panel per
    // term. The switch is CSS, so the assertions are that the inputs are there, that they precede the
    // body they reveal, and that each panel carries its own plan.
    has(html, '<fieldset class="term-switch">', "pricing/index.html offer card");
    ok(
      !html.includes('class="plan-grid"'),
      "pricing/index.html offer grid",
      "prints the three terms as three cards again",
    );
    const firstRadio = html.indexOf('class="term-radio"');
    ok(
      firstRadio > -1 && firstRadio < html.indexOf('class="term-body"'),
      "pricing/index.html term switch",
      "puts the panel body before the inputs that reveal it",
    );
    has(html, 'type="radio" name="term" id="term-' + DEFAULT_PLAN + '" checked', "pricing/index.html default term");
    // Three terms, each on its own panel. On a host that can take money, each panel posts to its own
    // address, because a reader who picks the month must not be checked out into the year by a shared
    // action; on a host that cannot, the panels state the terms and there is no form to submit.
    const takingMoney = Boolean((process.env.STRIPE_SECRET_KEY ?? "").trim());
    for (const plan of plans) {
      has(html, `data-plan="${plan}"`, `pricing/index.html ${plan} panel`);
      const action = `action="/api/stripe/checkout?plan=${plan}"`;
      if (takingMoney) has(html, action, `pricing/index.html ${plan} checkout action`);
      else ok(!html.includes(action), `pricing/index.html ${plan} checkout action`, "posts to a checkout this build cannot serve");
    }
    // The price the card is charged leads each panel, and the monthly equivalent is the line under it.
    // A panel whose largest number is a year cannot be compared against one whose largest number is a
    // month, which is why the switch has no comparison to lose.
    for (const plan of PLANS) {
      has(html, `<span class="term-amount">$${plan.amount}</span>`, `pricing/index.html ${plan.id} price`);
      if (plan.months > 1)
        has(html, `$${plan.perMonth} a month`, `pricing/index.html ${plan.id} per month`);
    }
    // The catalogue is gone from this page in both halves: the free ten are a link to /start, and a paid
    // title anywhere means the eighty-six-row fold has grown back.
    const listed = index.filter((entry) => html.includes(esc(entry.exercise.title)));
    ok(
      listed.length === 0,
      "pricing/index.html catalogue",
      `lists ${listed[0]?.exercise.title ?? "an exercise"}, so the page is a catalogue again`,
    );
    has(html, 'href="/start"', "pricing/index.html link to the free ten");
    // The questions a buyer asks before paying, answered on the page: the count is the promise, and a
    // page that quietly dropped the refund answer would still have five of them.
    ok(
      (html.match(/<details class="faq">/g) ?? []).length >= 6,
      "pricing/index.html faq",
      "answers fewer than six questions",
    );
    has(html, '<meta name="robots" content="noindex">', "pricing/index.html noindex");
    has(html, esc(GUARANTEE), "pricing/index.html refund guarantee");
    has(html, `inside ${REFUND_DAYS} days, cancel anytime`, "pricing/index.html cancellation");
    // The static edition has no server. A signup button is either an absolute link to the deployment
    // that does, or absent; a relative one would be a 404 in a primary call to action.
    ok(
      !html.includes('href="/signup'),
      "pricing/index.html signup link",
      "is relative, but this build serves no signup page",
    );
    if (config.appUrl) has(html, `href="${config.appUrl}/signup?next=/pricing"`, "pricing/index.html signup target");
  }

  // --- start ------------------------------------------------------------------------
  // The page that puts the free ten in one sequence. Its whole job is that a reader never has to hunt
  // for them: every free lesson is linked here, in the order the track names, and no paid one is.
  if (ok(existsSync(join(distDir, "start/index.html")), "start/index.html", "does not exist")) {
    const html = read("start/index.html");
    const free = index.filter((candidate) => candidate.free);
    const paid = index.filter((candidate) => !candidate.free);
    has(html, '<h1>Start with these ten</h1>', "start/index.html heading");
    has(html, `opens the other ${paid.length} exercises`, "start/index.html paid count");
    // Order is the point: the page walks `track.freeLessons` rather than the catalogue, so the DOM order
    // of the rows is the reading order — easy ones first, the level-3 closer last — and a reshuffle of
    // the curated list shows up here rather than in a reader's day.
    const byId = new Map(index.map((entry) => [entry.exercise.id, entry]));
    const positions = track.freeLessons.map((id) => html.indexOf(`href="${byId.get(id).path}"`));
    ok(
      positions.every((position, at) => position !== -1 && (at === 0 || position > positions[at - 1])),
      "start/index.html free order",
      "does not list the free exercises in the order the track names them",
    );
    for (const entry of free) has(html, `data-lesson="${entry.exercise.id}"`, `start/index.html row ${entry.number}`);
    for (const entry of paid)
      ok(!html.includes(`href="${entry.path}"`), `start/index.html paid ${entry.path}`, "links into a wall");
    has(html, 'href="/pricing"', "start/index.html pricing link");
  }

  // --- privacy and terms ------------------------------------------------------------
  // The two pages a reader looks at before trusting a refund term, and the two a crawler is meant to
  // find. `noindex` here would be a regression the sitemap count would not notice, and a page that
  // quietly stopped naming the export route would still be a page.
  for (const [file, expected] of [
    [
      "privacy/index.html",
      {
        h1: "<h1>What this site keeps, and what it never sees</h1>",
        retention: "Kept, unlinked from you:",
        browser: "<code>localStorage</code>",
        export: "account page",
        tracked: "No analytics script",
      },
    ],
    [
      "terms/index.html",
      {
        h1: "<h1>What you agree to</h1>",
        retention: "If it does not do what this page says it does, the remedy is a refund",
        browser: "Excel's formula rules vary by version and by locale",
        export: "account page",
        tracked: "not been reviewed by a lawyer",
      },
    ],
  ]) {
    if (!ok(existsSync(join(distDir, file)), file, "does not exist")) continue;
    const html = read(file);
    has(html, expected.h1, `${file} heading`);
    // Indexable on purpose: this is the page a search result should be able to land on.
    ok(
      !html.includes('<meta name="robots" content="noindex">'),
      `${file} robots`,
      "is noindex, but these two pages are the ones search should find",
    );
    has(html, 'href="/privacy"', `${file} footer privacy link`);
    has(html, 'href="/terms"', `${file} footer terms link`);
    for (const [label, probe] of [
      ["retention list", expected.retention],
      ["browser storage section", expected.browser],
      ["account page", expected.export],
      ["honest disclosure", expected.tracked],
    ]) {
      has(html, probe, `${file} ${label}`);
    }
    // Same rule as the signup button: the policy may describe the account page, but it must not link
    // a reader of the static edition into a page this host does not have.
    ok(
      !html.includes('href="/account"'),
      `${file} account link`,
      "is relative, but this build serves no account page",
    );
    if (config.appUrl) has(html, `href="${config.appUrl}/account"`, `${file} account target`);
  }

  // --- sitemap and robots -----------------------------------------------------------
  if (ok(existsSync(join(distDir, "sitemap.xml")), "sitemap.xml", "does not exist")) {
    const xml = read("sitemap.xml");
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
    // The list is `indexablePaths()`' list, so the count is whatever that function produced rather than
    // an arithmetic expression that has to be edited every time a hub is added.
    const expected = indexablePaths({
      config,
      index,
      groups: dashboardGroups({ track, index }),
      articles: articles.map((article) => ({
        path: `/excel-functions/${article.slug}`,
        updated: article.updated,
      })),
      formulas: formulas.map((formula) => ({ path: `/formulas/${formula.slug}`, updated: formula.updated })),
      shortcuts: shortcuts.map((shortcut) => ({ path: `/shortcuts/${shortcut.slug}`, updated: shortcut.updated })),
      extra: extraKeys({ articles, formulas, shortcuts }),
    }).map((item) => `${config.baseUrl}${item.path}`);
    ok(
      locs.length === expected.length,
      "sitemap.xml",
      `lists ${locs.length} URLs, expected ${expected.length}`,
    );
    ok(locs.every((loc, position) => loc === expected[position]), "sitemap.xml", "does not match indexablePaths()");
    for (const item of expected) ok(locs.includes(item), "sitemap.xml", `does not list ${item}`);
    ok(!locs.includes(`${config.baseUrl}/learn`), "sitemap.xml", "lists the dashboard, which is noindex");
    ok(!locs.includes(`${config.baseUrl}/pricing`), "sitemap.xml", "lists the pricing page, which is noindex");
    for (const path of ["/privacy", "/terms", "/about", "/start", "/excel-exercises"]) {
      ok(locs.includes(`${config.baseUrl}${path}`), "sitemap.xml", `does not list ${path}, which is indexable`);
    }
    // Every `<lastmod>` is a real date, and the lesson entries carry their own when they have one: a
    // sitemap that dates the whole site from the build is a sitemap crawlers learn to ignore.
    const lastmods = [...xml.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map((match) => match[1]);
    ok(lastmods.length === locs.length, "sitemap.xml", "has a <lastmod> for every <loc>");
    ok(
      lastmods.every((value) => /^\d{4}-\d{2}-\d{2}$/.test(value)),
      "sitemap.xml",
      "has a <lastmod> that is not a date",
    );
  }

  if (ok(existsSync(join(distDir, "robots.txt")), "robots.txt", "does not exist")) {
    has(read("robots.txt"), `Sitemap: ${config.baseUrl}/sitemap.xml`, "robots.txt");
  }

  // --- the 404 document ---------------------------------------------------------------
  // A static host cannot improvise this page; if the file is missing the reader gets the host's own
  // plain text and the site's chrome is gone. It is also the one page that must never be indexed,
  // which is the difference between a 404 and a page pretending to be one.
  if (ok(existsSync(join(distDir, "404.html")), "404.html", "does not exist")) {
    const html = read("404.html");
    has(html, '<header class="site"', "404.html header");
    has(html, '<footer class="foot"', "404.html footer");
    has(html, "<h1>", "404.html heading");
    has(html, '<meta name="robots" content="noindex">', "404.html noindex");
    has(html, 'href="/excel-exercises"', "404.html catalogue link");
  }

  // --- assets -----------------------------------------------------------------------
  const stylesPath = join(distDir, "assets/styles.css");
  if (ok(existsSync(stylesPath), "assets/styles.css", "does not exist")) {
    ok(readFileSync(stylesPath, "utf8").length > 2000, "assets/styles.css", "is shorter than 2 kB");
  }
  for (const module of [
    "client/dashboard.js",
    "client/drill.js",
    "client/state.js",
    "keys/index.js",
    "sheet/index.js",
    "progress/index.js",
    "grader/index.js",
    "grader/grade.js",
    "session/index.js",
    "session/events.js",
    "session/score.js",
    "session/clock.js",
  ]) {
    ok(existsSync(join(distDir, "assets", module)), `assets/${module}`, "is not in the build");
  }

  // --- no third-party origins -------------------------------------------------------
  // The index is a page a crawler lands on, so it is scanned with the lessons. `//host/x`
  // fetches remotely without a scheme, so the pattern makes the scheme optional.
  //
  // `appUrl` is allowed for the same reason `build.mjs` allows it: it is the sibling deployment of
  // this site, named by the operator, and the header links it (the account page lives there). A gate
  // about third parties must not refuse a link to ourselves — and nothing is fetched from it, only
  // navigated to.
  const allowed = new Set([config.baseUrl, ...ALLOWED_ORIGINS, ...(config.appUrl ? [config.appUrl] : [])]);
  for (const file of ["index.html", "learn/index.html", ...index.map((entry) => `excel/${entry.slug}.html`)]) {
    const html = read(file);
    for (const [url] of html.matchAll(/(?:https?:)?\/\/[^\s"'<>)]+/g)) {
      // A protocol-relative URL inherits our scheme; absolute ones must match it.
      const absolute = url.startsWith("//") ? `${new URL(config.baseUrl).protocol}${url}` : url;
      if ([...allowed].some((origin) => absolute === origin || absolute.startsWith(`${origin}/`))) continue;
      ok(false, file, `refers to ${url} — the site ships no third-party origins`);
    }
  }


  /**
   * No fact in the header, on any page. The row used to print the page's place in its set, and a
   * writer that forgot to set one shipped the word "undefined" in the header of every note, shortcut
   * page and problem page. Both slots are gone, so the check is that nothing came back in their place.
   */
  function checkNoHeaderFact(html, label) {
    const header = /<header class="site"[\s\S]*?<\/header>/.exec(html);
    if (!ok(Boolean(header), label, "has no site header to check")) return;
    ok(!/class="(?:drill-count|badge)"/.test(header[0]), label, "carries a count or a badge in its header");
    ok(!header[0].includes("undefined"), label, "prints undefined in its header");
  }

  return { pages: index.length, groupPages, checks, failures };
}

/** True when this file is the script node was asked to run, symlinked paths included. */
function invokedDirectly() {
  if (process.argv[1] === undefined) return false;
  try {
    return resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (invokedDirectly()) {
  const distArg = process.argv.slice(2).find((arg) => arg.startsWith("--dist="));
  try {
    const result = verify(distArg ? { dist: distArg.slice("--dist=".length) } : {});
    if (result.failures.length > 0) {
      for (const failure of result.failures) console.error(`  ✗ ${failure}`);
      console.error(`verify: ${result.failures.length} of ${result.checks} checks failed`);
      process.exitCode = 1;
    } else {
      console.log(
        `verified ${result.pages} lesson pages, the index, the dashboard, the pricing page and ${result.groupPages} group pages — ${result.checks} checks passed`,
      );
    }
  } catch (error) {
    console.error(`verify failed: ${error.message}`);
    process.exitCode = 1;
  }
}
