/**
 * The rules a search engine reads, tested on rendered HTML rather than on intent.
 *
 * The sitemap is pinned in `build.test.js`; what is pinned here is the rest of the contract: one
 * heading per page, a canonical on every indexable page, a title and description no other page shares,
 * structured data drawn only from the types Google still shows, and the internal links that make the
 * group hubs and the next lesson reachable from a page a stranger landed on.
 */
import assert from "node:assert/strict";
import { join } from "node:path";
import { describe, it } from "node:test";

import { readIcons } from "../legacy/src/site/assets.mjs";
import { siteConfig } from "../legacy/src/site/config.mjs";
import { dashboardGroups, renderDashboardPage } from "../legacy/src/site/dashboard-page.mjs";
import { loadContent } from "../legacy/src/site/content.mjs";
import { renderExercisePage } from "../legacy/src/site/exercise-page.mjs";
import { renderAboutPage, renderExercisesHub } from "../legacy/src/site/hub-page.mjs";
import { renderIndexPage } from "../legacy/src/site/index-page.mjs";
import { renderLegalPage } from "../legacy/src/site/legal-page.mjs";
import { EXTRA_PAGES, indexablePaths } from "../legacy/src/site/seo.mjs";

const ROOT = join(import.meta.dirname, "..");
const CONTENT = join(ROOT, "legacy/content");
const ENV = { SITE_URL: "https://drills.example", SITE_BUILT_AT: "2026-10-28" };

const config = siteConfig(ENV);
const { track, index } = loadContent(CONTENT);
const icons = readIcons(join(ROOT, "legacy/vendor/icons"));
const args = { config, track, index, icons, clientAvailable: true };
const groups = dashboardGroups({ track, index });

/**
 * Every page the sitemap lists, rendered the way the build renders it. The sitemap is the list, so a
 * page cannot be added to one without being checked by the other.
 */
const pages = (() => {
  const rendered = new Map();
  rendered.set("/", renderIndexPage(args));
  rendered.set(EXTRA_PAGES.exercises.path, renderExercisesHub(args));
  rendered.set(EXTRA_PAGES.about.path, renderAboutPage(args));
  for (const kind of ["privacy", "terms"]) {
    rendered.set(EXTRA_PAGES[kind].path, renderLegalPage({ ...args, kind }));
  }
  for (const group of groups) rendered.set(`/learn/groups/${group.id}`, renderDashboardPage({ ...args, group: group.id }));
  for (const entry of index) rendered.set(entry.path, renderExercisePage({ ...args, entry }));
  return rendered;
})();

const listed = indexablePaths({
  config,
  index,
  groups,
  extra: ["exercises", "about", "privacy", "terms"],
});

const headOf = (html) => html.slice(0, html.indexOf("</head>"));
const attr = (html, pattern) => html.match(pattern)?.[1] ?? null;

describe("the SEO contract of a rendered page", () => {
  it("renders every URL the sitemap lists, and only those", () => {
    assert.deepEqual(
      [...pages.keys()].sort(),
      listed.map((item) => item.path).sort(),
    );
    assert.equal(listed.length, 1 + 4 + groups.length + index.length);
  });

  it("gives every page one canonical, one h1, and no robots directive", () => {
    for (const [path, html] of pages) {
      const head = headOf(html);
      assert.equal(
        attr(head, /<link rel="canonical" href="([^"]+)">/),
        `${config.baseUrl}${path}`,
        `${path} canonical`,
      );
      assert.equal((html.match(/<h1[\s>]/g) ?? []).length, 1, `${path} has exactly one h1`);
      assert.doesNotMatch(head, /name="robots"/, `${path} must not be noindex`);
      assert.equal(attr(head, /<meta name="description" content="([^"]*)">/)?.length > 0, true, `${path} description`);
    }
  });

  it("never shares a title or a description between two pages", () => {
    const titles = new Map();
    const descriptions = new Map();
    for (const [path, html] of pages) {
      const head = headOf(html);
      const title = attr(head, /<title>([^<]+)<\/title>/);
      const description = attr(head, /<meta name="description" content="([^"]*)">/);
      assert.equal(titles.has(title), false, `${path} reuses the title of ${titles.get(title)}`);
      assert.equal(descriptions.has(description), false, `${path} reuses the description of ${descriptions.get(description)}`);
      titles.set(title, path);
      descriptions.set(description, path);
    }
  });

  it("reports a modified date for pages that carry one", () => {
    const lesson = pages.get(index[0].path);
    assert.equal(attr(headOf(lesson), /<meta property="article:modified_time" content="(\d{4}-\d{2}-\d{2})">/) !== null, true);
  });

  it("emits structured data from the types that are still shown in a result", () => {
    // FAQ and HowTo rich results were withdrawn, so their markup is never emitted: a type Google no
    // longer renders is dead weight in the head, not extra reach.
    const allowed = new Set([
      "Organization",
      "WebSite",
      "Course",
      "LearningResource",
      "BreadcrumbList",
      "ItemList",
      "Article",
    ]);
    const seen = new Set();
    for (const [path, html] of pages) {
      const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
      assert.ok(blocks.length > 0, `${path} has no structured data`);
      for (const [, raw] of blocks) {
        const parsed = JSON.parse(raw);
        const nodes = parsed["@graph"] ?? [parsed];
        for (const node of nodes) {
          assert.ok(allowed.has(node["@type"]), `${path} emits ${node["@type"]}`);
          seen.add(node["@type"]);
        }
      }
    }
    assert.ok(seen.has("LearningResource"), "lessons describe themselves as exercises");
    assert.ok(seen.has("BreadcrumbList"), "pages carry a trail");
  });
});

describe("the exercises hub", () => {
  const html = pages.get(EXTRA_PAGES.exercises.path);

  it("puts the head term in the h1 and links every group", () => {
    assert.match(html, /<h1>Excel exercises with instant answers<\/h1>/);
    for (const group of groups) {
      assert.ok(html.includes(`href="/learn/groups/${group.id}"`), `${group.id} is not linked from the hub`);
    }
  });

  it("answers the first questions in visible headings, not in FAQ markup", () => {
    const faq = html.slice(html.indexOf('id="questions-heading"'));
    assert.ok((faq.match(/<h3>/g) ?? []).length >= 3, "at least three questions are answered");
    assert.ok(html.includes('href="/about"'), "the page that explains the checking is one link away");
    assert.doesNotMatch(html, /FAQPage/);
  });
});

describe("a lesson's way out", () => {
  const entry = index.find((candidate) => candidate.group === "lookup");
  const html = pages.get(entry.path);

  it("offers drills that teach the same skill, plus the next group's opener", () => {
    const related = html.slice(html.indexOf('id="related-heading"'));
    const links = [...related.matchAll(/<li><a href="([^"]+)"/g)].map((match) => match[1]).slice(0, 4);
    assert.equal(links.length, 4);
    const same = index.filter((item) => item.group === entry.group && item.exercise.id !== entry.exercise.id);
    assert.ok(same.length > 0);
    for (const path of links.slice(0, 3)) {
      const target = index.find((item) => item.path === path);
      assert.equal(target?.group, entry.group, `${path} is not in the same group`);
    }
    const opener = index.find((item) => item.path === links[3]);
    const groupIds = track.groups.map((group) => group.id);
    assert.equal(opener?.group, groupIds[groupIds.indexOf(entry.group) + 1], "the fourth link opens the next group");
  });

  it("links the group hub, so the page is not a dead end", () => {
    assert.ok(html.includes(`href="/learn/groups/${entry.group}"`));
  });
});
