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

- [ ] 44 articles live, each with a unique title and description and a working embedded drill.
- [ ] Zero orphan pages; every CTA resolves; link lint green.
- [ ] Lighthouse SEO ≥ 95 on 3 sample articles; no CLS from the drill island.
- [ ] Every article is reachable from a hub within 2 clicks.
- [ ] Sitemap matches the route list exactly (count assertion in CI).
- [ ] JSON-LD validates in the Rich Results test for one Article and one FAQPage.
- [ ] An article page loads in < 100 KB JS before the drill is interacted with.

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
