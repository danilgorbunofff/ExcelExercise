# Phase 3 — The problem silo (`/formulas/[task-slug]`)

**Status:** shipped (2026-02-20) — see [gate evidence](#gate-evidence) and the [deviations log](#deviations-log).
**Depends on:** phase 2 (problem pages use the same 7-part shape and drill islands).
**Unblocks:** phase 4 (downloads attach to problem pages too), phase 5 (the silo is what `ItemList` lists).
**Size:** one content type, one route pair, one lint module, 12 pages.

---

## Purpose

Every competitor in the teardown ranks on two different intents: "what is `XLOOKUP`" (function,
informational) and "how do I look up a value to the left" (problem, transactional). We serve the
first with `/excel-functions/` and nothing for the second, so the highest-intent query shape in the
market goes to whichever site wrote the longest article.

The silo exists to answer a problem in one formula, on one page, with a drill the reader can run
without leaving it. It is built **problem-first from lessons we already wrote**, so no page needs a
new dataset and no page can ship without a graded exercise (the standing rule in
[overview §6.1](00-overview.md)).

## URL and content shape

`/formulas/<task-slug>`, flat, no nesting, no year, no `excel-` prefix — the same slug discipline as
the lesson paths. Twelve pages in this phase, not five hundred.

Source: `legacy/content/formulas/*.md`, frontmatter mirroring articles so the same parser works:

```
---
title: Look up a value to the left of the lookup column
question: How do I look up a value to the left of the key?
summary: ...
description: ...
function: INDEX
drills: index-match-look-left-of-the-key, two-way-index-match
updated: 2026-11-14
---
```

Body sections, all four required: `## Answer`, `## Why it works`, `## What goes wrong`,
`## Practice`. `## Answer` must lead with a single formula in a code span and one sentence saying
what it returns — that is the answer-first rule the article validator already enforces, applied to a
different intent.

## Deliverables

| # | Change | File |
|---|---|---|
| 1 | Loader, parser and rules for the new type | `packages/content/formulas.js` (new) |
| 2 | `formulas` added to `content-lint check`, plus its own `formulas` command | `packages/content-lint/cli.js` |
| 3 | 12 markdown pages | `legacy/content/formulas/*.md` (new) |
| 4 | Static build publishes the pages and the hub | `legacy/src/build.mjs`, `legacy/src/site/formula-page.mjs` (new) |
| 5 | Next route pair | `app/formulas/page.js`, `app/formulas/[slug]/page.js` |
| 6 | Sitemap + search index | `app/sitemap.js`, `packages/search/index.js`, `legacy/src/site/seo.mjs` |
| 7 | `Article` + `BreadcrumbList` JSON-LD with `about` | `legacy/src/site/seo.mjs` |
| 8 | Inbound links, including the 8 currently orphaned function pages | `article-page.mjs`, `formula-page.mjs`, hub pages |

## Work breakdown

1. **Loader.** `packages/content/formulas.js`, modelled directly on `articles.js`: reuse
   `parseMarkdown`, `sectionIds`, `wordCount`. Rules: required sections as above, 500–1,200 words
   (a problem answer is shorter than a function reference and should be), `## Answer`'s first code
   span must start with `=`, exactly one `## What goes wrong` table, `drills` 1–4 slugs, all slugs
   must exist, `function` must be an upper-case function name, `updated` is `YYYY-MM-DD`.
   Slug must be the filename.

2. **Cross-linking rules, enforced not suggested.** The silo's value is internal linking, so lint
   checks it: each problem page must link to at least one `/excel-functions/<slug>` page and at
   least two sibling `/formulas/` pages, and every link must resolve against the build's path set —
   the mechanism `articleProblems` already uses (`articles.js:117–134`). A page with no outbound
   links is refused.

3. **Two builds or it does not exist.** Articles are published twice: statically by
   `legacy/src/build.mjs:236–245` (with `assertSelfContained`) and by Next under
   `app/excel-functions/[slug]/page.js`. The problem silo does the same, and the duplication is
   deliberate — the static edition is a shipped product. Both read from `loadSite()`
   (`lib/site.js`), which gains `formulas`, so the two builds cannot disagree.

4. **The twelve pages.** Each is an existing lesson's problem, named as a person would type it:

   | Slug | Function | Source lesson |
   |---|---|---|
   | `look-up-a-value-to-the-left` | INDEX/MATCH | `index-match-look-left-of-the-key` |
   | `two-way-lookup` | INDEX/MATCH | `two-way-index-match` |
   | `look-up-a-partial-match-with-a-wildcard` | VLOOKUP | `vlookup-with-a-wildcard` |
   | `find-the-last-matching-value` | XLOOKUP | `xlookup-search-from-the-bottom` |
   | `look-up-a-value-that-might-not-exist` | XLOOKUP | `xlookup-with-a-fallback-when-nothing-matches` |
   | `approximate-match-needs-a-sorted-column` | VLOOKUP | `vlookup-approximate-match-needs-a-sorted-column` |
   | `look-across-a-row-not-down-a-column` | HLOOKUP | `hlookup-look-across-a-row` |
   | `total-a-column-by-region` | SUMIF | `sumif-region` |
   | `count-open-tickets` | COUNTIF | `countif-open-tickets` |
   | `count-only-the-cells-with-numbers` | COUNT | `count-numbers-only-and-what-it-skips` |
   | `count-cells-that-are-not-empty` | COUNTA | `counta-count-the-non-empty-cells` |
   | `round-prices-one-way` | ROUNDUP | `roundup-and-rounddown-one-direction-only` |

   Deprioritised but available for a later pass: `two-way-lookup-with-vlookup-and-match`,
   `vlookup-exact`, `xlookup-exact-match-no-column-counting`, `mround-and-floor-round-to-a-multiple`,
   `capstone-margin`. They overlap pages above; adding them now would produce two pages answering one
   query.

5. **Route pair.** `app/formulas/page.js` is the hub: every problem, grouped by family (lookup,
   aggregate, count, round), each row a link plus the one-line question. It is a list page, not a
   landing page — the same standard as `/excel-functions`. `app/formulas/[slug]/page.js` renders the
   answer block, the drill islands from phase 2, the sibling links and the related-function links.

6. **Discovery.** Add `formulas` to `extraKeys` (`seo.mjs:42`) so the sitemap and the reachability
   spec both know about it, add each page to `indexablePaths` with its `updated` date, and add the
   silo to `buildSearchIndex` (`packages/search/index.js`) with the problem question as the indexed
   text so "look up to the left" finds the page without the word `INDEX`.

7. **Fix the orphan defect while here.** `e2e/reachability.spec.js` (DEPTH = 3) currently exempts 8
   `/excel-functions*` pages in its `D14` note: they are sitemapped but only reachable through the
   search page, beyond three clicks. The new hub plus the sibling links give them short inbound
   paths; remove the exemption and make the gate fail on any sitemapped page that needs four clicks.
   This is a bug this phase can close, and closing it is worth more than the twelve pages.

## Acceptance gate

```sh
npm run content:check      # includes the new formulas rules
npm test
npm run verify             # static build + self-containment + link checks
npm run next:build         # Next routes compile, 12 pages prerender
npx playwright test e2e/reachability.spec.js e2e/formulas.spec.js
```

Done when:

- Twelve pages exist, each with at least one live drill that grades on the page.
- Every page passes the four-section, word-band, table, cross-link and slug-existence rules.
- Sitemap contains 12 new URLs and the search index returns the right page for each page's own
  question text (a test per page, not a spot check).
- `reachability.spec.js` passes with the D14 exemption removed.
- Both builds produce identical page text for the same slug (compare rendered HTML bodies in
  `golden.test.js` style).

## Risks

| Risk | Mitigation |
|---|---|
| Twelve near-duplicate pages competing with each other | One page per distinct query shape; the overlap list above is explicitly deferred |
| Content thinness at 500 words | The drill is the substance; the floor plus a required errors table plus outbound links keeps it from being a stub |
| Two builds drift | Both read `loadSite()`; a golden test compares them |
| The silo cannibalises `/excel-functions/` rankings | Different intent, different heading; problem pages link to function pages, which is the direction that helps both |

## Non-goals

- The blueprint's 500–1,000 generated pages ([overview §7](00-overview.md)).
- A programmatic template that emits a page per (function × dataset) pair.
- New datasets; every page reuses its lesson's grid.
- Translated silos.
- A `/formulas` page for a problem we cannot grade — no exercise, no page.

## Gate evidence

Every number below is from a run on the day this phase was closed, on `phase-0-port-shell`.

| Command | Result |
|---|---|
| `npm run content:formulas` | `12 problem pages, 711 words on average — 4 findings (0 blocking)`; the four are `note-coverage` warnings, listed in the deviations log |
| `npm run content:check` | green; the copy, variant, article and formula rules all pass over 12 pages / 8 notes / 88 lessons |
| `npm test` | 1,963 pass, 0 fail (288 suites), including `tests/formulas.test.js` and the updated `build` / `legal` / `metadata-routes` counts |
| `npm run build` + `node legacy/src/verify.mjs` | `built 135 pages`; `verified 88 lesson pages, the index, the dashboard, the pricing page and 16 group pages — 5197 checks passed` |
| `legacy/dist/sitemap.xml` | 132 URLs, 13 of them `/formulas` (the hub plus 12 pages) |
| `npm run next:build` / `npm run next:check` | `next routes: 134 prerendered pages match the shared templates` |
| `npm run budget` | B 68,243 B ≤ 70,000 B, D 138,714 B ≤ 150,000 B — the silo adds no client JS of its own |
| `npx playwright test e2e/formulas.spec.js` | 5 passed: hub lists every question by shelf, page serves the question + `Article`/`BreadcrumbList`, drill grades wrong → hint → right, sibling + note links, phone width |
| `npx playwright test e2e/reachability.spec.js` | 4 passed, including "the sitemap's pages are all reachable in three clicks" over the 132 sitemap URLs |
| `npx playwright test --project=static` | 15 passed, including `e2e-static/static-formulas.spec.js`: the static hub lists all 12 questions and `/formulas/count-only-the-numbers-with-count/` grades `=COUNT(B2:B7)` over plain HTTP with no console error |

Both builds render the same body for the same slug: `scripts/check-next-pages.mjs` compares the
prerendered Next HTML against the static page for all 12 formulas, and it is the same file that gates
the 8 notes.

## Deviations log

1. **Slugs are longer than the plan's table.** The plan sketched `/formulas/vlookup-left-lookup`; the
   shipped pages are `look-up-a-value-to-the-left-of-the-key`, `fall-back-when-a-lookup-finds-nothing`, and
   so on. The slug is a search term on its own — it is the phrase a reader typed — so it is written as the
   problem, not as a function-plus-suffix.
2. **`family` is a new frontmatter field.** The plan had no grouping field; the hub needs shelves. Four
   values (`lookup`, `aggregate`, `count`, `round`) are a closed set in `packages/content/formulas.js`,
   so a typo is a parse error and not a fifth shelf with one page on it.
3. **Cross-links are a `### Where to go next` table, not prose.** `readingEase` scores raw Markdown,
   URLs included, and a paragraph carrying six links drags a 700-word page under the Flesch floor. The
   plan's "cross-link to siblings in prose" is satisfied by the table plus the rendered `Keep going`
   list, which links the nearest three siblings and the note.
4. **The drill islands reuse the note's contract.** ids stay `article-drill-form-N` /
   `article-answer-N` / `article-feedback-N` and the client stays `legacy/src/client/article-drill.js`.
   A `formula-drill.js` would have been a second copy of the grading client; `renderArticleDrill` and
   `drilledIslands` moved to being shared exports of `article-page.mjs` instead.
5. **The `h1` is the short title; the question is the lede and `<title>`.** The plan wrote the page as
   "the question is the page". A heading that is a full question reads as a forum thread and repeats the
   snippet; the title names the answer and the question sits directly under it, where the reader sees it
   before anything else.
6. **Step 7's `D14` exemption did not exist to remove.** `e2e/reachability.spec.js` had already been
   rewritten to build its published-path list from `extraKeys({articles, formulas})`, so the orphan
   defect closed by construction: the new sitemap URLs (hub plus 12 pages) are crawled at depth 3 and
   pass. The hub is reached home → notes hub → `/formulas`, each page one click further from the notes'
   `Where to go next` links.
7. **Four pages carry a `note-coverage` warning as recorded debt.** COUNT, COUNTA, HLOOKUP and ROUNDUP
   have no note yet, so `formulaProblems` requires "at least one `/excel-functions/` link" per page
   rather than "the note for its own function". Each of those four pages says so in prose and points at
   the nearest note that exists (the COUNT page links COUNTIF). Writing those four notes closes the
   warnings; the phase gate does not wait for them.
8. **`MIN_DRILLS = 1`, so every page ships one island today.** All 12 pages borrow exactly one drill,
   which is the floor the plan set ("at least one live drill"). The ceiling is four, and the pages that
   grow will grow into it.
