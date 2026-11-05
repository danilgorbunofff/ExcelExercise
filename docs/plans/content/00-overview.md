# Content Plan Overview

**Status:** plan of record for content work. All five phases are shipped.
**Source:** *Product Architecture, UX, Pedagogy, and SEO Blueprint for an Interactive Excel Training
Platform* (28 pages, 60k characters, 97 numbered citations), triaged against this repository on
2026-10-31.
**Phases:** [`1`](phase-01-variant-grading.md) · [`2`](phase-02-article-template.md) ·
[`3`](phase-03-problem-silo.md) · [`4`](phase-04-workbooks-and-shortcuts.md) ·
[`5`](phase-05-markup-and-measurement.md) — see §6 for order and gates.
**Read with:** [`docs/plans/parity/00-overview.md`](../parity/00-overview.md) (product scope) and
[`docs/phases/README.md`](../../phases/README.md) (what is already shipped).

---

## 1. Why this file exists

The blueprint is a competitor teardown of excelexercises.com, excel-practice-online.com, coddy.tech,
exceljet.net, automateexcel.com, sqlbolt.com and datacamp.com. It proposes four structural upgrades:
multi-table anti-hardcoding grading, a split-attention-free workspace, a 7-part copy template per
task, and two-tier programmatic SEO.

It was written without knowledge of this repository, so half of what it says to build is already
built. This file keeps the parts that survive that comparison, puts a date and a verification
command against the baseline, and records what we are deliberately not doing. It is the gate the
content work reads before writing anything: no page ships from the blueprint's suggestions without
appearing in §6.

## 2. Verdict

- **Strong as a feature map and copy template.** The competitive teardown is real work; the 7-part
  page template and the sqlbolt single-workspace checklist are directly usable.
- **Weak as an architecture mandate.** Its prescriptions (HyperFormula or Univer, Web Workers,
  Canvas2D, `scheduler.yield()`, 500–1,000 formula pages) assume a slow, dependency-heavy product
  we do not have, and it never visits the three constraints that actually bind here: licence,
  bundle budget, and content authorship.
- **One idea is worth engineering time:** mutation-based grading (§5). Everything else is copy, UX,
  or SEO, and belongs in the content queue, not in a refactor.

## 3. Baseline — verified, not quoted

Measured on this checkout on 2026-10-31, because `README.md` reports older numbers (794 tests, 30
pages) than the tree now produces.

| Fact | Value | How verified |
|---|---|---|
| Unit/integration tests | **1915 pass, 0 fail** | `npm test` |
| Static pages built | **122 HTML, 119 sitemap URLs** | `npm run build`, `find legacy/dist -name '*.html' \| wc -l` |
| Exercises | **88**, each with `screens[]`, `docs`, `seo` | `legacy/content/exercises/*.json` |
| Function articles | **8** (`sum`, `vlookup`, `xlookup`, `index-match`, `sumif`, `countif`, `if`, `trim`) | `legacy/content/articles/` |
| Free lessons | 3 of 88 | `legacy/content/track.json` |
| Runtime dependencies | 5 (`next`, `react`, `react-dom`, `@supabase/ssr`, `@supabase/supabase-js`) | `package.json` |
| Third-party origins in the shipped build | 0, enforced | `legacy/src/build.mjs`, `npm run origin:check` |
| Structured data | JSON-LD on 9 Next surfaces | `app/**/page.js` |
| Already shipped from the blueprint's list | certificates with public verification, leaderboard, daily challenge, 7-day trend, flashcards, streaks, points, 14-day staleness, zero-signup persistence, clean slugs, sticky/locked table headers, WCAG 2.2 work | `app/`, `lib/certificate/`, `lib/retention/` |

Grading today is four layers: tokenize → parse → evaluate, plus rule checks (`require`, `forbid`,
`requireRef`, `rules`) that inspect the AST. Content currently uses one rule type, `matchType`.
Nothing evaluates a formula against a second dataset, which is exactly the gap §5 closes.

## 4. Triage

| Blueprint idea | Decision | Why | Lands in |
|---|---|---|---|
| Multi-table mutation grading (hidden mutated datasets) | **Adopt** | The only mechanic here that catches what our rules cannot: a formula that is correct on the visible table and wrong on a resent one | [1](phase-01-variant-grading.md) |
| Cause-level error diagnosis (`#NAME?` from localized names, `#N/A` leftmost/4th-arg, `$` drift) | **Adopt** | It is our stated differentiator and it sits on top of `parse.js` with no new dependency | [1](phase-01-variant-grading.md) |
| 7-part copy template per task page | **Adopt** | Executable as written; matches the existing `docs` + `seo` fields on every exercise | [2](phase-02-article-template.md) |
| Faded worked examples, 3–6 progressive drills per page | **Adopt** | Worked-example effect from cognitive-load research is well sourced, and our drills are cheap to embed | [2](phase-02-article-template.md) |
| sqlbolt 3–5 task checklist in one workspace | **Adopt** | Small UI change to an existing surface; a session already holds several screens | [2](phase-02-article-template.md) |
| Realistic business datasets instead of toy numbers | **Adopt** | Lesson datasets are already business-shaped | [3](phase-03-problem-silo.md) |
| Two-tier silo URLs (`/excel-functions/`, `/formulas/`) | **Adapt** | Function silo exists; the `/formulas/` problem silo does not. Build it problem-first, from exercises we already wrote | [3](phase-03-problem-silo.md) |
| `.xlsx` fallback per page | **Adapt** | A workbook writer already exists (`legacy/src/xlsx.mjs`); publish export, do not adopt SheetJS | [4](phase-04-workbooks-and-shortcuts.md) |
| Course List Carousel, Quiz/Flashcard, `SoftwareApplication`, `BreadcrumbList` | **Adapt** | Settled in phase 5: `SoftwareApplication` ships with the real price, the carousel has no third course to list, and `/flashcards` is noindex with a client-rendered deck | [5](phase-05-markup-and-measurement.md) |
| HyperFormula or Univer as the calculation engine | **Reject** | GPLv3 on HyperFormula is a source-disclosure problem for a browser bundle unless commercially licensed; both add a dependency and a UI we do not need for small grids | §7 |
| Web Workers, `scheduler.yield()`, Canvas2D, virtualization for INP | **Reject for now** | Solutions to a measured problem we do not have; `npm run lighthouse` is the gate that would prove otherwise | §7 |
| 500–1,000 programmatic formula pages | **Reject** | Conflicts with our own ship rule (every indexable page carries a real graded exercise); mass thin pages is a content-policy risk, not a growth channel | §7 |
| AI "Formula Assistant" in the drill bar | **Reject** | The blueprint itself criticises competitors' AI assistant for being unreliable, then prescribes one | §7 |
| Institutional logos and testimonials as social proof | **Reject** | Copying a competitor's homepage logos is false social proof and a trademark risk | §7 |
| Free Sheet sandbox, group admin, pre-employment assessments, timed tests | **Defer** | Real product surface, but each is a phase of its own; none is content | §8 |

## 5. The one engineering change

The blueprint's anti-hardcoding idea is the only item here worth code, and it is one extra
evaluation pass: re-run the submitted formula against a hidden mutated copy of the grid, so a
literal `=12500` or a `SUM` over a hand-picked range stops passing. It costs no dependency, no
engine swap, and no worker because the evaluator already takes a cell map.

Executable spec, schema field, lint rules, pilot order and mutation proof: **[phase 1](phase-01-variant-grading.md)**.
The invariants the design must keep, so that later phases do not relitigate them:

- Expectations for each variant are derived at content-lint time from the screen's existing
  `reference` formula, never computed in the browser at runtime.
- A variant whose expected value equals the visible one is rejected by lint — it proves nothing.
- The failure rule is named `hardcoded` and speaks in the grader's existing voice.
- Diagnostics that ride along (localized-name `#NAME?`, the four `#N/A` causes, `$`-drift on a
  copied range) reuse `packages/grader/parse.js`. No new parser.

## 6. The phases

```
1 variant grading ──▶ 2 article template ──▶ 3 problem silo ──▶ 4 workbooks + shortcuts ──▶ 5 markup + measurement
```

Order is deliberate: the template lands before pages are written (so they are written once,
correctly), the problem silo is built from exercises that already exist (so no new datasets), then
distribution, then proof. A phase does not start while the previous one has an open page without a
graded exercise.

| # | Phase | Primarily changes | Done when |
|---|---|---|---|
| 1 | [Variant grading](phase-01-variant-grading.md) — **shipped** (6-screen pilot, deriver for the rest) | `packages/grader`, `packages/content/schema.js`, `content-lint` | A hardcoded answer fails a fixture that passes the visible table, and deleting the pass reddens tests |
| 2 | [Article template](phase-02-article-template.md) — **shipped** (7 sections, 32 drill islands across 8 notes) | `packages/content/articles.js`, `article-page.mjs`, 8 articles | Every function page has 7 parts and 3–6 drills, enforced by `content:articles` |
| 3 | [Problem silo](phase-03-problem-silo.md) — **shipped** (12 pages in 4 families, each with a drill island, a note link and sibling links) | `packages/content/formulas.js`, `formula-page.mjs`, 12 problem pages, `/formulas` + `/formulas/[slug]` | Every problem page grades the answer it asks for and is reachable in three clicks |
| 4 | [Workbooks and shortcuts](phase-04-workbooks-and-shortcuts.md) — **shipped** (148 workbooks with a Solution tab, 6 shortcut families on `/shortcuts`, one chord lesson) | `xlsx.mjs` multi-sheet, download links, shortcut route | Every page's workbook exists and is byte-identical across builds |
| 5 | [Markup and measurement](phase-05-markup-and-measurement.md) — **shipped** (`SoftwareApplication` with the real price, one funnel route, a five-metric report) | `seo.mjs`, `lib/log-event.js`, `proxy.js`, `app/api/events/route.js`, `scripts/content-report.mjs` | Schema validates on every page and the phase-7 funnel numbers are reproducible from a committed fixture |

Each phase file carries the same shape: purpose, dependencies, deliverables table, numbered work
breakdown, acceptance gate with runnable commands, required proof, risks, non-goals and a deviation
log. Two rules across all five: pages reuse existing exercise datasets rather than inventing new
ones, and every phase ends with its gate green before the next begins.

How to author what phases 2 and 3 produce is written down for the next author, not for this plan:
[writing a lesson](../../content-authoring.md), [writing a function note](../../content-authoring.md#writing-a-function-note),
[writing a problem page](../../content-authoring.md#writing-a-problem-page) and [writing a shortcut
page](../../content-authoring.md#writing-a-shortcut-page).

### 6.1 Standing quality bar

Applies in review to every phase:

- No indexable page without a graded exercise.
- No copied prose, questions, or datasets from the reference mirror or any competitor.
- No competitor logos, testimonials, or user counts in our copy.
- Numbers in prose come from our own build or tests, or carry a dated source.
- No new runtime dependency without a licence decision recorded in the phase file.

## 7. What we are not doing, and why

| Rejected | Reason |
|---|---|
| Replacing the grader with HyperFormula/Univer | GPLv3 (HyperFormula) or a UI framework (Univer) for small grids; our evaluator is already AST-inspectable, tested, and dependency-free |
| Web Workers / Canvas / virtualization | No measured INP or DOM problem; `npm run lighthouse` and `npm run budget` are the honest gates |
| 500–1,000 generated pages | Breaks the "every page has an exercise" rule and courts a helpful-content demotion |
| AI assistant in the drill bar | Unreliable by the blueprint's own account; the deterministic grader is the product |
| Competitor social proof | False and legally risky |
| Sequential lesson locks | Already removed; search arrivals must be able to practise any topic |

## 8. Open decisions

1. **Free Sheet sandbox:** in scope or not? It is the largest new build the blueprint asks for, and
   our evaluator could back it without an engine swap, but it is a product surface, not content.
2. **Any external calculation engine, ever:** if yes, the licence question is decided before the
   package is installed, not after.
3. **Assessment/B2B surfaces:** deferred in §4; confirm they stay deferred behind the phase-7
   metrics rather than being pulled forward by this plan.

## 9. Source hygiene

The blueprint's evidence is uneven. Real sources: Google Search Central structured-data docs,
web.dev INP guidance, Panko's spreadsheet-error literature, Sweller/Chandler cognitive-load work.
Not usable: a pirated copy of *Excel 2007 Pocket Guide* on `dokumen.pub` (citation 50), Reddit
threads (65, 66), Medium posts for table UX (54), and the "SEO heist" write-up (88) — the last is a
description of copying a competitor's sitemap, which is precisely what this plan forbids.

Figures like "250,000 users", "29,415 downloads" and "78% of graduates prefer digital diplomas" are
competitor or vendor marketing, unaudited. Nothing in §6 repeats them.
