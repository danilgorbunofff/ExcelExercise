/**
 * Search: the index, the ranking, and the page.
 *
 * Two kinds of claim are tested here. The first is behavioural — 27 queries a learner would actually
 * type, each of which has one right exercise, must return it in the top three. The second is structural:
 * every exercise's own title has to find that exercise, so the index cannot be tuned to twenty-seven hand-
 * picked cases and be useless for the other sixty-one.
 */

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, describe, it } from "node:test";

import { build } from "../legacy/src/build.mjs";
import { siteConfig } from "../legacy/src/site/config.mjs";
import { loadArticles, loadContent } from "../legacy/src/site/content.mjs";
import { prepareSearchPage, renderSearchPage } from "../legacy/src/site/search-page.mjs";
import {
  buildSearchIndex,
  hydrate,
  loadIndex,
  queryTerms,
  search,
  serializeIndex,
} from "../packages/search/index.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONTENT = join(ROOT, "legacy/content");
const { track, index } = loadContent(CONTENT);
const articles = loadArticles(CONTENT);
const entries = buildSearchIndex({ index, articles, groups: track.groups });
const slugOf = (id) => id.replace(/^\d+-/, "");

const topHits = (query, limit = 3) => search(query, entries, { limit }).map((hit) => slugOf(hit.id));

/** What a learner types, and the one exercise that answers it. */
const QUERIES = [
  ["sum a column", "sum-basics"],
  ["average scores", "average-scores"],
  ["count blanks", "counta-count-the-non-empty-cells"],
  ["count numbers", "count-numbers-only-and-what-it-skips"],
  ["xlookup exact match", "xlookup-exact-match-no-column-counting"],
  ["vlookup exact", "vlookup-exact"],
  ["index match", "index-match"],
  ["remove duplicates", "unique-one-row-per-distinct-value"],
  ["highest value", "large-and-small-the-nth-highest"],
  ["middle value", "median-the-middle-value"],
  ["most common value", "mode-the-most-common-value"],
  ["round decimals", "round-markup"],
  ["join text", "textjoin-join-a-range-and-skip-blanks"],
  ["split text delimiter", "textbefore-and-textafter"],
  ["days between dates", "datedif-days-months-or-years-between"],
  ["count two conditions", "countifs-several-conditions"],
  ["sumif region", "sumif-region"],
  ["if two outcomes", "ifs-more-than-two-outcomes"],
  ["catch error", "iferror-catch-the-error-show-your-text"],
  ["trim spaces", "clean-up-an-imported-list"],
  ["filter rows", "filter-the-rows-that-meet-a-condition"],
  ["uppercase lowercase", "upper-lower-and-proper"],
  ["hidden rows total", "subtotal-a-sum-over-a-group"],
  ["running total", "running-total-down-a-column"],
  ["two way lookup", "two-way-lookup-with-vlookup-and-match"],
  ["wildcard countif", "countif-with-wildcards"],
  ["prefix text", "left-find-prefix"],
];

describe("the index", () => {
  it("has one row per exercise, plus the notes and the groups", () => {
    assert.equal(entries.filter((entry) => entry.kind === "drill").length, index.length);
    assert.equal(entries.filter((entry) => entry.kind === "note").length, articles.length);
    assert.equal(entries.filter((entry) => entry.kind === "group").length, track.groups.length);
  });

  it("carries a path, a title and some searchable words for every row", () => {
    for (const entry of entries) {
      assert.ok(entry.path.startsWith("/"), `${entry.id} has no path`);
      assert.ok(entry.title.length > 0, `${entry.id} has no title`);
      assert.ok(entry.terms.length > 0, `${entry.id} has no terms`);
      assert.ok(!entry.terms.includes(""), `${entry.id} has an empty term`);
    }
  });

  it("answers to the function an exercise uses, not only to its title", () => {
    const drillless = entries.find((entry) => entry.id.endsWith("sumifs-two-conditions-at-once"));
    assert.ok(drillless.terms.includes("sumifs"));
  });

  it("survives a round trip through the shipped form", () => {
    const rows = serializeIndex(entries);
    assert.ok(JSON.stringify(rows).length < 120_000, "the index has grown past what a page should carry");
    const reloaded = loadIndex(rows);
    assert.equal(reloaded.length, entries.length);
    for (const query of ["count blanks", "two way lookup", "trim spaces"]) {
      assert.deepEqual(
        search(query, reloaded).map((hit) => hit.id),
        search(query, entries).map((hit) => hit.id),
        `"${query}" answered differently after the round trip`,
      );
    }
  });

  it("rejects a row it cannot hydrate and never throws on junk", () => {
    assert.deepEqual(loadIndex([]), []);
    assert.equal(hydrate({ title: "x", path: "/x", kind: "drill" }).terms.length, 1);
  });
});

describe("ranking", () => {
  for (const [query, expected] of QUERIES) {
    it(`"${query}" finds ${expected}`, () => {
      assert.ok(
        topHits(query).includes(expected),
        `"${query}" returned ${JSON.stringify(topHits(query))} — expected ${expected}`,
      );
    });
  }

  it("finds every exercise by its own title, which is the check the fixtures cannot make", () => {
    const misses = index.filter((entry) => {
      const hits = search(entry.exercise.title, entries, { limit: 1 });
      return hits.length === 0 || hits[0].id !== entry.exercise.id;
    });
    assert.deepEqual(misses.map((entry) => entry.exercise.slug), []);
  });

  it("returns nothing for a query with no words in it", () => {
    assert.deepEqual(search("", entries), []);
    assert.deepEqual(search("   ", entries), []);
    assert.deepEqual(search("how do i", entries), [], "stopwords alone are not a query");
    assert.deepEqual(queryTerms("how do i"), []);
  });

  it("returns nothing rather than a near miss when the words are not covered", () => {
    assert.deepEqual(search("zzzz", entries), []);
    assert.deepEqual(search("pivot table slicer", entries, { limit: 3 }).map((hit) => hit.id), []);
  });

  it("gives the same answer twice, and honours the limit", () => {
    const once = search("lookup", entries, { limit: 5 });
    const twice = search("lookup", entries, { limit: 5 });
    assert.deepEqual(once, twice);
    assert.ok(search("lookup", entries, { limit: 2 }).length <= 2);
  });

  it("ranks an exercise above a note that merely mentions the same function", () => {
    const hits = search("count blanks", entries, { limit: 4 });
    assert.equal(hits[0].kind, "drill");
  });
});

describe("the page", () => {
  const config = siteConfig({ SITE_URL: "https://example.test" });
  const { body, page } = prepareSearchPage({ config, track, index, articles });

  it("is a page a crawler can read: title, description, one h1", () => {
    assert.equal(page.title, "Search the exercises");
    assert.match(page.description, /\d+ Excel exercises/);
    assert.equal(body.match(/<h1\b/g)?.length, 1);
  });

  it("has a labelled search box that works without a script", () => {
    assert.match(body, /<form class="search-form" action="\/search" method="get" role="search">/);
    assert.match(body, /<input[^>]*id="search-input"[^>]*name="q"/);
    assert.match(body, /<label class="visually-hidden" for="search-input">Search the exercises<\/label>/);
    assert.match(body, /<button class="btn btn-primary" type="submit">Search<\/button>/);
  });

  it("declares the combobox contract the script relies on", () => {
    assert.match(body, /role="combobox"/);
    assert.match(body, /aria-controls="search-results"/);
    assert.match(body, /aria-expanded="false"/);
    assert.match(body, /<ul class="search-results" id="search-results" role="listbox"/);
    assert.match(body, /id="search-status"[^>]*aria-live="polite"/);
  });

  it("lists every exercise, so the page is still an index with no JavaScript", () => {
    for (const entry of index) {
      assert.ok(body.includes(`href="${entry.path}"`), `${entry.path} is missing from the list`);
    }
  });

  it("carries the index in the document rather than asking for it", () => {
    const html = renderSearchPage({ config, track, index, articles });
    assert.match(html, /<script type="application\/json" id="search-index">/);
    assert.match(html, /<script type="module" src="\/assets\/client\/search.js"><\/script>/);
    const json = html.match(/<script type="application\/json" id="search-index">([\s\S]*?)<\/script>/)?.[1];
    const rows = JSON.parse(json);
    assert.equal(rows.length, entries.length);
    assert.ok(!json.includes("<"), "the JSON must not be able to close its own script tag");
  });
});

describe("a real build", () => {
  let dist;
  before(() => {
    dist = mkdtempSync(join(tmpdir(), "search-"));
    build({ root: join(ROOT, "legacy"), out: dist, env: { SITE_URL: "https://example.test" }, quiet: true });
  });
  after(() => rmSync(dist, { recursive: true, force: true }));

  it("writes search/index.html with the box, the list and the engine copied beside it", () => {
    const html = readFileSync(join(dist, "search/index.html"), "utf8");
    assert.match(html, /id="search-input"/);
    assert.match(html, /id="search-index"/);
    assert.match(html, /src="\/assets\/client\/search.js"/);
    const engine = readFileSync(join(dist, "assets/search/index.js"), "utf8");
    assert.match(engine, /export function search/);
  });

  it("lists itself in the sitemap", () => {
    const sitemap = readFileSync(join(dist, "sitemap.xml"), "utf8");
    assert.match(sitemap, /<loc>https:\/\/example\.test\/search<\/loc>/);
  });

  it("puts the search link in every page's header, with its glyph", () => {
    const home = readFileSync(join(dist, "index.html"), "utf8");
    const lesson = readFileSync(join(dist, `${index[0].path.replace(/^\//, "")}.html`), "utf8");
    for (const html of [home, lesson]) {
      // The glyph sits inside the link, so the word is still the accessible name and the last thing
      // in the anchor.
      assert.match(html, /<a class="head-link" href="\/search"><svg class="icon icon-head"[^>]*>[\s\S]*?<\/svg>Search<\/a>/);
    }
  });
});
