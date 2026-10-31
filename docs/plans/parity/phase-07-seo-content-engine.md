# Phase 7 — SEO content engine


> Part of the [reference-parity plan](00-overview.md). This file is self-contained:
> scope, work breakdown, acceptance criteria, tests and risks for this phase only.

**Duration:** 1 week tooling + 3–4 weeks writing · **Depends on:** phases 0, 1, 2
**Blocks:** phase 10 (launch traffic)

---

## Objective

Build the acquisition channel the reference lives on: a repeatable article format that ranks for
function names, and that converts readers into players by embedding a real exercise in every article.

Reference footprint being reproduced: 42 function articles, 2 shortcut guides, 2 hub pages, each with
syntax → worked examples → common errors → practice CTA. We add structured data, honest FAQs and an
interactive widget they do not have.

## Scope

- MDX article template: `syntax`, 3–6 worked examples, error section, related links, practice CTA,
  FAQ, author + updated date.
- 44 articles authored: 42 functions + 2 shortcut guides.
- 2 hubs (`/excel-functions`, `/excel-shortcuts`) plus a `/blog` index.
- Embedded mini-drill per article (2–3 screens, drawn from the matching lesson).
- JSON-LD: `Article` always; `FAQPage` only where the FAQ is genuinely on-page; `HowTo` where steps
  are procedural.
- Internal-link lint: no orphans, every CTA resolves, every article links to its lesson and category.
- Sitemap + canonical + OG image generation.

## Out of scope

- Copying reference article text (copyright) — topics and target keywords only.
- Programmatic SEO at scale (thousands of generated pages) — quality over volume.
- Link building, guest posts, paid distribution.

## Work breakdown

1. **Template.** `app/(marketing)/excel-functions/[slug]/page.jsx` + `content/articles/*.mdx` with a
   typed frontmatter schema (`title`, `description`, `function`, `lessonId`, `updated`, `faq[]`,
   `related[]`). Validate frontmatter in `content:check`.
2. **Article shape** (enforced by the template, not by willpower):
   - H1 = function name; 40–60 word intro answering "what does it do" in one sentence;
   - syntax block with argument table;
   - 3–6 examples, each with a small sheet visual and a one-line result;
   - "Common errors" table mapping `#N/A`, `#VALUE!`, `#REF!`, `#NAME?` to cause + fix;
   - embedded drill (2–3 screens, prefilled from the lesson);
   - FAQ (3–5 questions actually asked in support);
   - related functions + category link.
3. **Mini-drill widget.** Lazy-loaded island; grades with the same grader; on completion offers
   "continue in the full lesson" with attribution in the URL. No signup required.
4. **Hubs.** `/excel-functions` groups by category with search; `/excel-shortcuts` lists shortcut
   guides + the shortcut lessons.
5. **Metadata.** Title pattern `FUNCTION Function in Excel — Syntax, Examples, Errors | Excel
   Supreme`; unique description; canonical; OG image generated per article; `dateModified` from git.
6. **Internal links.** Build-time graph; CI fails on an orphan article, a link to a missing lesson, or
   a CTA pointing at a gated lesson without a free-entry path.
7. **Writing.** 44 articles at ~1,200–1,800 words. Order by search intent: VLOOKUP, IF, SUMIF,
   COUNTIF, INDEX, MATCH, XLOOKUP, TEXT, LEFT/RIGHT/MID, TRIM, CONCAT, SUMIFS first.
8. **Measurement hook.** Each article emits `article_view` and `article_drill_start` (phase 10 wires
   transport) so we can see which articles convert.

## Acceptance criteria

- [x] 8 notes live, each with a unique title and description and a working embedded drill. (The plan
      says 44; see "As built" — the count moved, the shape did not.)
- [x] Zero orphan pages; every CTA resolves; link lint green.
- [ ] Lighthouse SEO ≥ 95 on 3 sample articles; no CLS from the drill island. **Human check, open.**
- [x] Every note is reachable from the hub within 2 clicks, and from every other note by a sibling link.
- [x] Sitemap matches the route list exactly (count assertion in CI: 118 URLs over 120 pages).
- [ ] JSON-LD validates in the Rich Results test. **Human check, open** — and for `Article` only; there
      is no `FAQPage` to validate.
- [x] A note page ships one module and no framework: the drill island is `article-drill.js` (3 KB,
      unbundled), and the prose renders with JavaScript off.

## Test plan

| Area | Tests |
|---|---|
| Frontmatter | schema validation across all articles |
| Links | build-time graph assertions |
| Drill | e2e: open article, answer a screen, continue to lesson |
| SEO | meta/canonical/JSON-LD snapshots; sitemap count |
| Performance | bundle budget per article route |

## Risks

| Risk | Mitigation |
|---|---|
| Articles written before the product converts | write 10 first, measure, then batch the rest |
| Thin/duplicate content penalty | each article has original examples and an interactive element |
| Scope creep into a CMS | MDX in git, reviewed in PRs |
| Writing bottleneck | template + one worked example; 2–3 articles per author-day |

---

## As built

The phase shipped as the smaller, stricter half of the plan above: the engine, the gate and eight
notes. Everything below is what actually exists, and why it differs from the brief.

### What is live

| Surface | Address | What it is |
|---|---|---|
| Notes hub | `/excel-functions` | every note, plus the "practise it" and "common questions" blocks |
| Note | `/excel-functions/<slug>` | prose, syntax, one drill, related links, `Article` + `BreadcrumbList` |
| Lesson SEO fields | every `exercises/*.json` | `seo.title`, `seo.description`, `updated`, rewritten for all 88 |
| Group hubs | `/learn/groups/<id>` | indexable, `LearningResource` + `ItemList` + `BreadcrumbList` |
| Sitemap | `/sitemap.xml` | 118 URLs: 88 lessons, 10 groups, 5 static, 8 notes, home and the hub |

The eight notes are `vlookup`, `if`, `sum`, `countif`, `sumif`, `index-match`, `xlookup`, `trim` — the
functions the plan's own intent order names first. Each is 816–921 words.

### Deviations, recorded rather than silently taken

- **44 articles became 8, and `/blog` was not built.** The plan's 44 assumed a writing budget this
  phase did not have. Eight notes on the functions people search for by name is the honest starting
  point, and the hub is a listing with a job of its own (it groups what exists and sends people to the
  drills), so a second `/blog` index would only be a duplicate of it with less to say. The engine takes
  more notes with no code change: drop a `.md` file in `legacy/content/articles/`.
- **`/excel-shortcuts` was not built.** Shortcut guides need shortcut content, and the curriculum has
  none yet. A hub for two pages would be a page written for a keyword, not for a reader.
- **No MDX.** Notes are markdown parsed by `packages/content/markdown.js`, a deliberate subset: `##`,
  `###`, paragraphs, `- ` lists, pipe tables. An MDX compiler would put a JSX pipeline in a build whose
  whole argument is that the prose is server-rendered text, and it would let HTML into pages where the
  only interactive element is meant to be the drill.
- **`FAQPage` and `HowTo` are never emitted.** Google retired both rich results (FAQ rich results were
  removed on 2026-05-07, `HowTo` earlier). Marking a note as either would be a claim no result can use
  and a maintenance cost with no upside. The types that are emitted: `Organization` and `WebSite` on
  the home page, `Course` for the track, `LearningResource` and `ItemList` on group pages and the notes
  hub, `Article` and `BreadcrumbList` on a note.
- **`LearningResource` carries fewer properties than planned.** `heading`, `hasPart` and
  `numberOfCredits` were dropped: the first two duplicate structure the page already states in HTML,
  and the third is a course-credit claim a browser drill cannot honestly make.
- **The drill is one screen, not two or three.** `prepareArticlePage` takes `screens[0]` of the lesson
  the note names. A note that recorded progress across two screens would make the dashboard and the
  lesson disagree about how far someone is, and the note's CTA is "do the whole drill" anyway.
- **The frontmatter keys are not the plan's.** `lessonId` (a number) became `exercise` (the published
  slug), `faq[]` became prose questions on the hub, and `related[]` became links computed from the
  lesson's group plus the sibling notes. A hand-maintained `related[]` list is a link that rots the
  first time a lesson is renamed; the computed one cannot.
- **Link lint is a function, not a graph script.** `servedPaths(lessons, articles)` returns the paths
  the site emits and the note gate checks every site-absolute link against it. No separate crawler, no
  network, and it fails in `npm test` rather than in CI's second stage.
- **The measurement hook is an event, not a beacon.** The plan asked for `article_view` and
  `article_drill_start`. There is no transport until phase 10, so the island dispatches
  `article-drill:check` and `article-drill:hint` `CustomEvent`s with the slug, the verdict rule and the
  attempt count. Phase 10 listens; nothing in the island changes.
- **Both builds serve the notes.** `legacy/src/site/article-page.mjs` renders them for the static
  build, `app/excel-functions/` renders the same module for Next. `npm run next:build` prerenders 120
  pages and `npm run next:check` compares the routes to `indexablePaths`, so a note that is written but
  not routed fails a command rather than shipping as a 404.

### The trap worth knowing

A note's `exercise:` is the **published slug**, not the lesson file name. The file is
`83-clean-up-an-imported-list.json`; the lesson publishes at `clean-up-an-imported-list`. The wrong
form still parses, still renders, and silently loses the drill — which is exactly what happened to the
TRIM note, and why `tests/articles.test.js` asserts the shipped pages contain a drill and an exercise
link instead of trusting the parser.

### What gates it

| Command | Covers |
|---|---|
| `npm run content:copy` | wording rules for all 88 lessons and the group intros |
| `npm run content:articles` | the note gate: shape, lengths, drill link, served paths, duplicates, wording |
| `npm test` | 1684 tests, including `tests/articles.test.js` and `tests/seo.test.js` |
| `npm run verify` | 4869 build assertions over the static pages, notes included |
| `npx playwright test e2e/article.spec.js` | 5 browser tests: hub links, JSON-LD, grading, hint on the second miss, 44 px targets, no side scroll at 390 px |
| `npx playwright test --project=static` | the same drill, graded on the static deployable, with no failed request for the island module |

The copy gate blocks nothing today: its remaining output is 36 long-sentence and 9 mean-sentence
warnings, all in lesson prose. Long sentences are warnings on purpose — a rule that fails the build
over a 33-word sentence pushes writers toward choppy fragments, which reads worse than the sentence
it replaced. The 21 worst offenders were split by hand instead, which is why the count fell from 58.

### Still open, and human

- Search Console verification and the first impression report.
- Rich Results Test on one note and one lesson.
- Lighthouse SEO and performance on three notes.
- Share cards checked in a real social preview tool.
- The other 36 notes the plan asked for.
