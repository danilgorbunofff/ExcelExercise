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

import { siteConfig } from "./site/config.mjs";
import { loadContent } from "./site/content.mjs";
import { esc } from "./site/html.mjs";
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

  if (!existsSync(distDir)) {
    return { pages: 0, checks: 0, failures: [`${distDir} does not exist — run \`npm run build\` first`] };
  }

  const { track, index } = loadContent(join(root, "content"));
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
        const url = `${config.baseUrl}${entry.path}`;
        ok(ld["@type"] === "LearningResource", `${label} JSON-LD @type`, `is "${ld["@type"]}"`);
        ok(ld.url === url, `${label} JSON-LD url`, `is "${ld.url}", expected "${url}"`);
        ok(ld["@id"] === `${url}#drill`, `${label} JSON-LD @id`, `is "${ld["@id"]}"`);
        ok(ld.position === entry.number, `${label} JSON-LD position`, `is "${ld.position}"`);
        ok(
          ld.isAccessibleForFree === entry.free,
          `${label} JSON-LD isAccessibleForFree`,
          `is "${ld.isAccessibleForFree}"`,
        );
        ok(
          ld.isPartOf?.["@id"] === `${config.baseUrl}/#${track.id}`,
          `${label} JSON-LD isPartOf`,
          "does not name the course",
        );
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

    // A workbook screen is a real download: the link, then the file, then the ZIP magic that proves
    // it is a spreadsheet and not an empty placeholder the learner cannot open.
    for (const [position, s] of exercise.screens.entries()) {
      if (s.type !== "workbook") continue;
      const where = `${label} screen ${position + 1}`;
      const name = workbookName(entry.slug, s.id);
      has(html, `href="/assets/files/${name}"`, `${where} workbook link`);
      has(html, `id="workbook-${position}"`, `${where} workbook block`);
      const file = join(distDir, "assets/files", name);
      if (ok(existsSync(file), `${where} workbook ${name}`, "is linked but not on disk")) {
        ok(
          readFileSync(file).subarray(0, 4).equals(Buffer.from("PK\x03\x04")),
          `${where} workbook ${name}`,
          "is not a ZIP",
        );
      }
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
  }

  // --- dashboard --------------------------------------------------------------------
  // `/learn` is a real page for a stranger without JavaScript: the whole track, in order, grouped.
  // What it cannot have is a per-browser number, so the counts it ships are zeroes and the island
  // replaces them. `noindex` is checked here because a sitemap entry for it would be a lie.
  if (ok(existsSync(join(distDir, "learn/index.html")), "learn/index.html", "does not exist")) {
    const html = read("learn/index.html");
    has(html, "<h1>Where you are</h1>", "learn/index.html heading");
    has(html, '<meta name="robots" content="noindex">', "learn/index.html noindex");
    for (const entry of index) has(html, `href="${entry.path}"`, `learn/index.html link to ${entry.path}`);
    for (const group of track.groups) {
      if (!index.some((entry) => entry.group === group.id)) continue;
      has(html, `id="group-${group.id}"`, `learn/index.html ${group.id} group`);
      has(html, `data-group-count="${group.id}"`, `learn/index.html ${group.id} counter`);
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
  }

  // --- sitemap and robots -----------------------------------------------------------
  if (ok(existsSync(join(distDir, "sitemap.xml")), "sitemap.xml", "does not exist")) {
    const xml = read("sitemap.xml");
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
    ok(locs.length === index.length + 1, "sitemap.xml", `lists ${locs.length} URLs, expected ${index.length + 1}`);
    ok(locs.includes(`${config.baseUrl}/`), "sitemap.xml", "does not list the index");
    ok(!locs.includes(`${config.baseUrl}/learn`), "sitemap.xml", "lists the dashboard, which is noindex");
    for (const entry of index) {
      ok(locs.includes(`${config.baseUrl}${entry.path}`), "sitemap.xml", `does not list ${entry.path}`);
    }
  }

  if (ok(existsSync(join(distDir, "robots.txt")), "robots.txt", "does not exist")) {
    has(read("robots.txt"), `Sitemap: ${config.baseUrl}/sitemap.xml`, "robots.txt");
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
  const allowed = new Set([config.baseUrl, ...ALLOWED_ORIGINS]);
  for (const file of ["index.html", "learn/index.html", ...index.map((entry) => `excel/${entry.slug}.html`)]) {
    const html = read(file);
    for (const [url] of html.matchAll(/(?:https?:)?\/\/[^\s"'<>)]+/g)) {
      // A protocol-relative URL inherits our scheme; absolute ones must match it.
      const absolute = url.startsWith("//") ? `${new URL(config.baseUrl).protocol}${url}` : url;
      if ([...allowed].some((origin) => absolute === origin || absolute.startsWith(`${origin}/`))) continue;
      ok(false, file, `refers to ${url} — the site ships no third-party origins`);
    }
  }

  return { pages: index.length, checks, failures };
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
      console.log(`verified ${result.pages} lesson pages, the index and the dashboard — ${result.checks} checks passed`);
    }
  } catch (error) {
    console.error(`verify failed: ${error.message}`);
    process.exitCode = 1;
  }
}
