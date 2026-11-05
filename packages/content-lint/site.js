/**
 * The gate over the site's own copy.
 *
 * `copy.js` measures the authored content: lessons, group intros, the long-form pages, the project
 * briefs. Everything else a visitor reads lives in templates and client modules — the home page, the
 * pricing pitch, the hub and dashboard, the message a wrong formula produces, the legal pages, the meta
 * descriptions, the screen-reader labels. That copy was written at different times by different
 * hands and nothing measured it, so the house style the lessons now keep stopped at the content tree.
 *
 * This module reads it the way a reader meets it: every page is rendered through its own `prepare*`
 * function, the visible text is extracted from the HTML, and the same rules `copy.js` applies to a
 * lesson are applied here. React-only routes and the browser modules have no rendered page to read, so
 * their strings are extracted from source, which is the only place they exist.
 *
 * Two decisions worth knowing:
 *
 * 1. Findings are deduplicated by text, not by page. The footer line is on all 139 pages, and a report
 *    that repeats it 139 times is a report nobody reads. The first surface that renders a string owns
 *    the finding.
 * 2. A string is copy if it reads like one — three words or more, letters, no code punctuation. The
 *    filter lives in `looksLikeCopy`, and `tests/site-copy.test.js` pins the cases that matter. The
 *    inventory this module writes is the check on the filter itself: if a page's prose is missing from
 *    it, the extractor is wrong, not the page.
 */

import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { checkText, loadRules, splitParagraphs } from "./copy.js";

import { readIcons } from "../../legacy/src/site/assets.mjs";
import { prepareArticlePage, prepareFunctionsHub } from "../../legacy/src/site/article-page.mjs";
import { siteConfig } from "../../legacy/src/site/config.mjs";
import { loadArticles, loadContent, loadFormulas, loadShortcuts } from "../../legacy/src/site/content.mjs";
import { dashboardGroups, prepareDashboardPage } from "../../legacy/src/site/dashboard-page.mjs";
import { prepareExercisePage } from "../../legacy/src/site/exercise-page.mjs";
import { prepareFormulaPage, prepareFormulasHub } from "../../legacy/src/site/formula-page.mjs";
import { prepareAboutPage, prepareExercisesHub } from "../../legacy/src/site/hub-page.mjs";
import { prepareIndexPage } from "../../legacy/src/site/index-page.mjs";
import { prepareLegalPage } from "../../legacy/src/site/legal-page.mjs";
import { prepareNotFoundPage } from "../../legacy/src/site/not-found-page.mjs";
import { preparePricingPage } from "../../legacy/src/site/pricing-page.mjs";
import { loadProjects, prepareProjectsPage } from "../../legacy/src/site/projects.mjs";
import { prepareSearchPage } from "../../legacy/src/site/search-page.mjs";
import { renderChrome } from "../../legacy/src/site/shell.mjs";
import { prepareShortcutPage, prepareShortcutsHub } from "../../legacy/src/site/shortcut-page.mjs";
import { prepareStartPage } from "../../legacy/src/site/start-page.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
export const ROOT = join(HERE, "..", "..");

/**
 * The modules whose strings never reach HTML we can render: the browser runtime, the React-only
 * routes, the grader's fallback messages. Every entry is a file a visitor can read text from, and the
 * test asserts each one still contributes at least `min` strings, so a new file cannot join the site
 * without joining this list.
 */
export const SOURCE_MODULES = [
  { path: "legacy/src/site/messages.mjs", min: 20 },
  { path: "legacy/src/client/drill.js", min: 50 },
  { path: "legacy/src/client/dashboard.js", min: 4 },
  { path: "legacy/src/client/state.js", min: 12 },
  { path: "legacy/src/client/feedback.js", min: 4 },
  { path: "legacy/src/client/search.js", min: 2 },
  { path: "legacy/src/client/article-drill.js", min: 3 },
  { path: "packages/grader/grade.js", min: 18 },
  { path: "packages/grader/evaluate.js", min: 14 },
  { path: "packages/grader/values.js", min: 7 },
  { path: "packages/grader/functions.js", min: 56 },
  { path: "packages/grader/parse.js", min: 7 },
  { path: "packages/grader/tokenize.js", min: 5 },
  { path: "packages/grader/answers.js", min: 2 },
  { path: "packages/grader/address.js", min: 3 },
  { path: "lib/auth/profile.js", min: 8 },
  { path: "lib/auth/credentials.js", min: 4 },
  { path: "lib/certificate/eligibility.js", min: 3 },
  { path: "lib/flags.js", min: 4 },
  { path: "legacy/src/site/social.mjs", min: 1 },
  { path: "app/daily/page.js", min: 12 },
  { path: "app/excel-exercises/page.js", min: 1 },
  { path: "app/excel-functions/page.js", min: 1 },
  { path: "app/formulas/page.js", min: 1 },
  { path: "app/search/page.js", min: 1 },
  { path: "app/shortcuts/page.js", min: 1 },
  { path: "app/daily/run/runner.js", min: 10 },
  { path: "app/leaderboard/page.js", min: 5 },
  { path: "app/flashcards/page.js", min: 2 },
  { path: "app/flashcards/deck.js", min: 7 },
  { path: "app/certificate/page.js", min: 6 },
  { path: "app/certificate/form.js", min: 3 },
  { path: "app/account/page.js", min: 7 },
  { path: "app/account/deleted/page.js", min: 6 },
  { path: "app/verify/[id]/page.js", min: 5 },
  { path: "app/error.js", min: 1 },
  { path: "app/auth/actions.js", min: 5 },
  { path: "app/reset/password/page.js", min: 2 },
  { path: "app/account/week.js", min: 4 },
  { path: "app/account/profile/screen.js", min: 3 },
  { path: "app/daily/run/page.js", min: 3 },
  { path: "lib/auth/errors.js", min: 6 },
  { path: "lib/not-found.js", min: 1 },
];

/** Named entities a page may emit. Numeric ones are handled separately. */
const ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  hellip: "\u2026",
  mdash: "\u2014",
  ndash: "\u2013",
  rsquo: "\u2019",
  lsquo: "\u2018",
  ldquo: "\u201c",
  rdquo: "\u201d",
  pound: "\u00a3",
  euro: "\u20ac",
  times: "\u00d7",
  middot: "\u00b7",
  copy: "\u00a9",
};

export function decodeEntities(text) {
  return String(text)
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (match, name) => ENTITIES[name.toLowerCase()] ?? match);
}

/**
 * The visible text of a rendered page, one entry per block.
 *
 * Block elements end a paragraph; a `<br>` ends a line inside one. Every other tag is a space, because
 * `</span><span>` between two words would otherwise glue them together, and whitespace collapses
 * anyway. Scripts, styles and SVG are dropped whole: they are markup a reader never sees, and their
 * contents produce the kind of false positive that teaches people to ignore the gate.
 */
export function htmlBlocks(html) {
  const stripped = String(html)
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|svg|noscript|template)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(
      /<\/(?:p|li|ul|ol|h[1-6]|div|summary|details|td|th|tr|table|button|figcaption|figure|blockquote|dl|dt|dd|section|article|header|footer|main|nav|aside|form|label|option|select|a|span)\s*>/gi,
      " ",
    )
    .replace(/<(?:p|li|h[1-6]|div|summary|td|th|tr|table|figcaption|blockquote|dt|dd|section|article|header|footer|main|nav|aside|option|select)\b[^>]*>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ");

  const decoded = decodeEntities(stripped);
  return decoded
    .split(/\n{2,}/)
    .map((block) => block.replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, " ").trim())
    .filter((block) => block.length > 0);
}

/** The human-readable attributes: the text a screen reader says and the tooltip a mouse shows. */
export function htmlLabels(html) {
  const labels = [];
  for (const match of String(html).matchAll(/\b(?:alt|aria-label|aria-description|title|placeholder)="([^"]*)"/gi)) {
    labels.push({ attr: "attribute", text: decodeEntities(match[1]) });
  }
  return labels;
}

/**
 * Does this string read like copy? The filter is deliberately narrow: a false negative hides a page's
 * prose from the gate and the inventory test catches it, while a false positive makes the report noisy
 * enough to ignore, which is worse.
 */
export function looksLikeCopy(text) {
  if (typeof text !== "string") return false;
  const value = text.replace(/\s+/g, " ").trim();
  if (value.length < 12) return false;
  if (value.split(" ").length < 3) return false;
  if (!/[a-z]{2}/i.test(value)) return false;
  if (/^[=\-+/@]/.test(value)) return false;
  // `function`, `return`, `position` and `margin` are ordinary words on a spreadsheet site, so only
  // their call and declaration shapes count as code.
  if (/=>|\bfunction\s*\(|\bimport\s|\brequire\s*\(|process\.env|document\.|window\.|addEventListener/.test(value)) return false;
  if (/https?:\/\//.test(value)) return false;
  if (/[{}]|\/[a-z]*>|\b[a-z]+=["']|\b(?:px|rem|em|vh|vw|ms)\b\s*[;)]|(?:display|position|margin|padding|grid-template[a-z-]*)\s*:\s*[a-z]/.test(value)) return false;
  if (/;\s*\S/.test(value)) return false;
  if (/^\.[\w-]|\bdata-[\w-]+=|\baria-[\w-]+=/.test(value)) return false;
  if (/^[a-z0-9-]+\.[a-z]{2,4}\b/.test(value)) return false;
  // Column lists, selectors and JSON keys: real copy rarely has a bracket or two snake_case names.
  if (/[[\]]/.test(value)) return false;
  if ((value.match(/\b[a-z]+_[a-z]+\b/g) ?? []).length >= 2) return false;
  return true;
}

/**
 * A module with its comments blanked out, quotes left alone.
 *
 * Comments are prose about the code, and an apostrophe inside one used to leak into the inventory as
 * a fragment like `s chrome, around this file`. Blanking them keeps the line structure the JSX scan
 * depends on while making it impossible for a comment to be measured as copy.
 */
export function stripComments(source) {
  const text = String(source);
  const kept = [];
  let quote = null;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (quote) {
      kept.push(char);
      if (char === "\\") {
        kept.push(next ?? "");
        index += 1;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      kept.push(char);
      continue;
    }
    if (char === "/" && next === "/") {
      while (index < text.length && text[index] !== "\n") {
        kept.push(" ");
        index += 1;
      }
      kept.push("\n");
      continue;
    }
    if (char === "/" && next === "*") {
      const end = text.indexOf("*/", index + 2);
      const stop = end === -1 ? text.length : end + 2;
      kept.push(text.slice(index, stop).replace(/[^\n]/g, " "));
      index = stop - 1;
      continue;
    }
    kept.push(char);
  }
  return kept.join("");
}

/**
 * Every string literal in a module, with template holes replaced by `N` so a message like
 * `Solved after ${missed} wrong attempts.` is measured as the sentence it is rather than skipped for
 * containing a brace.
 */
export function sourceStrings(source) {
  const text = stripComments(String(source));
  const found = [];
  const literal = /"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g;
  for (const match of text.matchAll(literal)) {
    // A hole is a hole whether it is a template's `${name}` or a catalogue entry's `{name}`.
    const value = (match[1] ?? match[2] ?? match[3] ?? "").replace(/\$\{...\}|\$\{[^}]*\}|\{[a-zA-Z][\w.]*\}/g, "N");
    if (value === "") continue;
    found.push(value.replace(/\\n/g, " ").replace(/\\"/g, '"').replace(/\\'/g, "'"));
  }
  // JSX text between tags: `<p>Some sentence.</p>` has no quotes around it at all. The opening tag is
  // part of the match on purpose: without it, `length > 0 && blocked < n` reads as text between a
  // closing and an opening bracket, and the inventory fills with fragments of arithmetic.
  for (const match of text.matchAll(/<\/?[A-Za-z][\w.:-]*(?:\s[^<>]*)?>\s*([^<>{}]+?)\s*</g)) {
    const value = match[1].replace(/\s+/g, " ").trim();
    if (value !== "" && /[a-z]{2}/i.test(value)) found.push(value);
  }
  return found;
}

/** The page objects every static route renders, in the order a reader meets them. */
export function renderedPages(contentDir, { icons = {}, config = siteConfig() } = {}) {
  const { track, index } = loadContent(contentDir);
  const articles = loadArticles(contentDir);
  const formulas = loadFormulas(contentDir);
  const shortcuts = loadShortcuts(contentDir);
  const projects = loadProjects(contentDir);
  const groups = dashboardGroups({ track, index });
  const pages = [];

  const add = (label, prepared) => {
    if (!prepared) return;
    pages.push({ label, body: prepared.body, page: prepared.page });
  };

  add("/", prepareIndexPage({ config, track, index, icons, clientAvailable: true, projectsAvailable: true, appPagesAvailable: true }));
  add("/learn", prepareDashboardPage({ config, track, index, icons, clientAvailable: true }));
  for (const group of groups) {
    add(`/learn/groups/${group.id}`, prepareDashboardPage({ config, track, index, icons, clientAvailable: true, group: group.id }));
  }
  add("/excel-exercises", prepareExercisesHub({ config, track, index, icons, projectsAvailable: true, appPagesAvailable: true }));
  add("/start", prepareStartPage({ config, track, index, icons, projectsAvailable: true, appPagesAvailable: true }));
  add("/search", prepareSearchPage({ config, track, index, articles, formulas, shortcuts, appPagesAvailable: true }));
  add("/about", prepareAboutPage({ config, track, index, icons }));
  add("/pricing", preparePricingPage({ config, track, index }));
  add("/projects", prepareProjectsPage({ track: projects.track, index: projects.index }));
  add("/excel-functions", prepareFunctionsHub({ config, articles, index, formulas }));
  add("/formulas", prepareFormulasHub({ config, formulas, index, articles }));
  add("/shortcuts", prepareShortcutsHub({ config, shortcuts, index }));
  add("/privacy", prepareLegalPage({ config, track, index, kind: "privacy" }));
  add("/terms", prepareLegalPage({ config, track, index, kind: "terms" }));
  add("/404", prepareNotFoundPage({ config, index }));

  // Chrome is the same on every page; one sample page supplies the object it needs.
  const sample = pages[0]?.page;
  if (sample) {
    const chrome = renderChrome({ config, page: sample, appPagesAvailable: true, icons });
    pages.push({ label: "chrome", body: `${chrome.skip}${chrome.header}${chrome.footer}`, page: null, chrome: true });
  }

  // One lesson of each kind, because the lesson body's own text is measured by `copy.js` and what this
  // gate adds is the shell around it: the rail, the docs headings, the "how to work this screen" notes.
  for (const entry of [index[0], index[Math.floor(index.length / 2)], index[index.length - 1]].filter(Boolean)) {
    add(`/excel/${entry.slug}`, prepareExercisePage({ config, track, index, entry, icons, clientAvailable: true, articles, checkout: {}, accountHref: "/account" }));
  }
  if (articles[0]) add(`/excel-functions/${articles[0].slug}`, prepareArticlePage({ config, track, index, articles, article: articles[0], clientAvailable: true }));
  if (formulas[0]) add(`/formulas/${formulas[0].slug}`, prepareFormulaPage({ config, track, index, articles, formulas, formula: formulas[0], clientAvailable: true }));
  if (shortcuts[0]) add(`/shortcuts/${shortcuts[0].slug}`, prepareShortcutPage({ config, track, index, articles, shortcuts, shortcut: shortcuts[0], clientAvailable: true }));

  return pages;
}

/**
 * Every string the site can show a reader, deduplicated, with the surface that shows it first.
 *
 * A rendered page attributes its text to `page:${label}` and its meta to `meta:${label}`; a source
 * module attributes to `module:${path}`. The order is fixed so the inventory file is stable across runs
 * and a wording change is a diff, not a reshuffle.
 */
export function extractSiteCopy({ root = ROOT, contentDir = join(root, "legacy/content"), icons } = {}) {
  const config = siteConfig();
  const surfaces = [];
  const seen = new Set();

  const push = (where, text) => {
    const value = text.replace(/\s+/g, " ").trim();
    if (!looksLikeCopy(value)) return;
    if (seen.has(value)) return;
    seen.add(value);
    surfaces.push({ where, text: value });
  };

  for (const page of renderedPages(contentDir, { icons: icons ?? readIcons(join(root, "legacy/vendor/icons")), config })) {
    for (const block of htmlBlocks(page.body)) push(`page:${page.label}`, block);
    for (const label of htmlLabels(page.body)) push(`label:${page.label}`, label.text);
    if (page.page?.title) push(`meta:${page.label}`, page.page.title);
    if (page.page?.description) push(`meta:${page.label}`, page.page.description);
  }

  for (const module of SOURCE_MODULES) {
    const source = readFileSync(join(root, module.path), "utf8");
    for (const value of sourceStrings(source)) push(`module:${module.path}`, value);
  }

  return surfaces;
}

/** The meta bands, applied to the page objects the routes pass to `generateMetadata`. */
export function lintMeta(pages, rules, { siteName = null } = {}) {
  const findings = [];
  for (const { label, page } of pages) {
    if (!page) continue;
    const where = `meta:${label}`;
    // The rule is about the `<title>` a search result shows, and `renderHead` appends the site name, so
    // measure that and not the bare heading — "Privacy" is a fine heading and a poor title.
    const title = siteName && !page.isHome ? `${page.title} · ${siteName}` : page.title;
    if (title) {
      const length = title.length;
      if (length < rules.seoTitle.minChars || length > rules.seoTitle.maxChars) {
        findings.push({
          rule: "seo-title",
          severity: "warn",
          field: "meta.title",
          where,
          message: `${length} characters; keep it ${rules.seoTitle.minChars}-${rules.seoTitle.maxChars}`,
          excerpt: title,
        });
      }
    }
    if (page.description) {
      const length = page.description.length;
      if (length < rules.seoDescription.minChars || length > rules.seoDescription.maxChars) {
        findings.push({
          rule: "seo-description",
          severity: "warn",
          field: "meta.description",
          where,
          message: `${length} characters; keep it ${rules.seoDescription.minChars}-${rules.seoDescription.maxChars}`,
          excerpt: page.description,
        });
      }
    }
  }
  return findings;
}

/** The rules over a list of surfaces, so a test can plant one without a file behind it. */
export function lintSurfaces(surfaces, rules) {
  const findings = [];
  for (const surface of surfaces) {
    const result = checkText(surface.text, {
      field: surface.where.split(":")[0],
      where: surface.where,
      prose: true,
      rules,
    });
    for (const finding of result.findings) findings.push(finding);
  }
  return findings;
}

/** The gate. Same shape as `lintCopy`: a list of findings and the numbers the report prints. */
export function lintSite({ root = ROOT, contentDir = join(root, "legacy/content"), rules = loadRules() } = {}) {
  const config = siteConfig();
  const icons = readIcons(join(root, "legacy/vendor/icons"));
  const pages = renderedPages(contentDir, { icons, config });
  const surfaces = extractSiteCopy({ root, contentDir, icons });

  const findings = lintSurfaces(surfaces, rules);
  findings.push(...lintMeta(pages, rules, { siteName: config.name }));

  const prose = surfaces.filter((surface) => splitParagraphs(surface.text).length > 0 && surface.text.split(" ").length >= 8);
  return {
    findings,
    stats: {
      pages: pages.length,
      surfaces: surfaces.length,
      modules: SOURCE_MODULES.length,
      words: surfaces.reduce((total, surface) => total + surface.text.split(/\s+/).length, 0),
      longform: prose.length,
    },
    inventory: surfaces,
  };
}

/** The inventory file, sorted so a wording change reads as a one-line diff. */
export function inventoryJson(surfaces) {
  const sorted = [...surfaces].sort((a, b) => (a.where === b.where ? a.text.localeCompare(b.text) : a.where.localeCompare(b.where)));
  return `${JSON.stringify(sorted.map((entry) => [entry.where, entry.text]), null, 1)}\n`;
}
