# Phase 2 — The 7-part article template

**Status:** shipped.
**Depends on:** phase 1 (a drill embedded on a page should not be passable by typing the number).
**Unblocks:** phase 3 (problem pages copy the same page shape), phase 4 (downloads attach to it).
**Size:** one content-rule change, one page-template change, 8 articles rewritten.

---

## Purpose

The external blueprint's page template is the part of it that survives contact with this repository.
Six of its seven parts already exist in `legacy/content/articles/*.md` by convention; two do not
exist at all, and one ("3–6 drills per page") contradicts our current rule of exactly one.

The job of this phase is to make the template **enforceable** rather than aspirational: today
`packages/content/articles.js` refuses an article without an errors table, so a missing table cannot
ship. After this phase, a missing alternatives block or a page with one drill cannot ship either.

## The template, mapped to what exists

| Blueprint part | Today | This phase |
|---|---|---|
| 1. Answer-first summary + mental model + hero formula | Enforced: first block must be a paragraph, `## Syntax` carries the signature | Unchanged |
| 2. Syntax with argument traps | Enforced: `## Syntax` required, `syntax:` must start with `=` | Unchanged |
| 3. Progressive worked examples | Enforced: 2–4 `### Example N` | Unchanged |
| 4. 3–6 embedded drills, fading guidance | **Missing**: exactly one drill, linked by `exercise:` slug | New `drills:` list, N islands |
| 5. Error troubleshooting from real messages | Enforced: `## What goes wrong` must contain a table | Unchanged, but the table is generated from `messages.mjs` |
| 6. Modern alternatives and version notes | **Missing** | New required `## Alternatives` |
| 7. Google Sheets / VBA parity | **Missing** | New required `## Other apps` |

Parts 1, 2, 3 and 5 are already gated. Only 4, 6 and 7 need code plus copy.

## Deliverables

| # | Change | File |
|---|---|---|
| 1 | `REQUIRED_SECTIONS` gains `alternatives` and `other-apps` | `packages/content/articles.js:27` |
| 2 | `exercise:` → `drills:` (1–6 slugs), with `exercise:` kept readable for one release | `packages/content/articles.js` (`FIELDS`, `parseArticle`, `articleProblems`) |
| 3 | Word ceiling raised 1,400 → 1,800 | `packages/content/articles.js:81` |
| 4 | N numbered drill islands instead of one | `legacy/src/site/article-page.mjs` |
| 5 | Client script grades each island independently | `legacy/client/article-drill.js` (or its successor) |
| 6 | 8 articles rewritten to the template | `legacy/content/articles/*.md` |
| 7 | Authoring note for the new sections | `docs/plans/content/00-overview.md` §6.1 + this file |

## Work breakdown

1. **Frontmatter.** Replace `exercise: sum-basics` with:

   ```
   drills: sum-basics, sum-basics-column, sum-across-sheets
   ```

   Parsed into an array, 1–6 entries, no duplicates (`parseArticle`), each slug must exist and each
   must belong to a lesson whose function matches `function:` (that check needs the corpus, so it
   goes in `articleProblems`, next to the existing "the exercise does not exist" check at
   `articles.js:127`). Accept the old single `exercise:` key for one release and warn, so the 8 files
   can be migrated without a flag day; delete it in the same phase once all 8 use `drills:`.

2. **Sections.** Add `"alternatives"` and `"other-apps"` to `REQUIRED_SECTIONS`. The ids come from
   `sectionIds`, so the headings are `## Alternatives` and `## Other apps`. Content requirements
   that the parser can actually check, rather than prose guidance:

   - `## Alternatives` contains at least one inline code span naming a function (`=XLOOKUP(`,
     `=INDEX(`, `=SUMPRODUCT(`) and at least one sentence with a version marker (`2019`, `365`,
     `Excel 2021`, `Sheets`).
   - `## Other apps` contains at least two of the words `Sheets`, `VBA`, `Google`, and at least one
     code span. This is deliberately loose: it blocks an empty stub without dictating phrasing.

3. **Word ceiling.** 1,400 → 1,800, with the reason recorded in the file's header comment: the
   template now asks for two sections that did not exist, and a compliant article on `XLOOKUP`
   cannot say everything it must in 1,400 words. The 700-word floor stays — it is what stops thin
   pages, and thin pages are the actual risk.

4. **Page rendering.** `renderArticleDrill` (`article-page.mjs:43`) renders one island with fixed
   ids (`article-answer`, `article-feedback`, `article-drill-form`). Two islands with the same ids
   is a broken document and a broken accessibility tree. Therefore:

   - The island takes an index and suffixes every id: `article-answer-1`, `article-feedback-1`,
     `article-drill-form-1`.
   - The cut point stays the same (after the practice prose), and the islands are numbered
     `Try it — drill 1 of 3`, with the last one carrying the "Do the whole drill" link to the full
     lesson. Earlier ones get "Open this drill in the lesson" so a reader can go deeper without
     leaving practice behind.
   - Each island embeds its own `screenPayload` (`exercise-page.mjs`) and its own slug, so the client
     can post the right lesson.
   - Guidance fades across the islands exactly as the blueprint describes: island 1 renders its
     `details` solution open, island 2 renders it closed, island 3 renders no solution until
     feedback has been shown twice. The screen's `hints` are passed through unchanged; the fading is
     a rendering decision, not new content.

5. **Client.** `article-drill.js` currently assumes one form. It becomes: query all
   `.article-drill-form`, attach a submit handler per form, grade against that form's payload, write
   into that form's `[role=status]`. It must not use `document.getElementById` on the fixed ids, and
   it must post lesson-slug + screen-id so progress recording stays accurate. Progress for an island
   is recorded against its own lesson — a reader who clears three islands has cleared three screens,
   not one lesson.

6. **The 8 articles.** Rewrite `sum`, `vlookup`, `xlookup`, `index-match`, `sumif`, `countif`, `if`,
   `trim` in this order (most contested query first): `vlookup`, `xlookup`, `index-match`, `sumif`,
   `countif`, `sum`, `if`, `trim`. Each gains:

   - `drills:` with 3–5 real lesson slugs, in fading order (easiest screen first). All slugs must
     already exist — no new lessons in this phase.
   - `## Alternatives` comparing the modern replacement, with the version where it arrived and the
     one case where the old function is still the right answer. `VLOOKUP`'s section must say why
     `INDEX/MATCH` still exists (leftward lookup, no column counting) instead of pretending it is
     obsolete.
   - `## Other apps` with the Sheets function name and the VBA equivalent (`Application.WorksheetFunction.Sum`),
     or an honest "no direct equivalent" where that is true.

7. **Message table.** "What goes wrong" tables must quote the grader's actual strings. Add a lint
   check that every `#`-prefixed error code in that table exists in `packages/grader/errors.js`
   `CODES`, so a table cannot invent `#CALC!` handling we do not have.

## Acceptance gate

```sh
npm run content:articles   # every article obeys the template
npm test                   # articles.test.js + content-lint.test.js
npm run build              # 8 articles still build, byte-stable
npx playwright test e2e/articles.spec.js
```

Done when:

- `content:articles` fails on an article missing `## Alternatives`, on `drills:` with 0 or 7 entries,
  on a duplicate drill slug, and on a drill slug that does not exist.
- A page renders N islands, each with unique ids, each independently gradable. Proven by an e2e test
  that submits a wrong answer to island 1, a right answer to island 3, and asserts the two feedback
  regions disagree.
- All 8 articles pass with `drills:` set and no `exercise:` key remaining.
- The 700–1,800 band is enforced in both directions by a test that feeds 650 and 1,850 words.

## Risks

| Risk | Mitigation |
|---|---|
| Raising the ceiling invites padding | The floor and the section checks stay; padding shows up as a review problem, not a lint one, and the template's sections are specific enough that filler is obvious |
| Six drills on one page competes with the reading | Cap at 6, put them after the practice prose, and fade guidance; the islands are short, the payload is already client-side |
| Duplicate ids silently break screen readers | Suffixed ids plus an e2e assertion that every id on the page is unique |
| Progress recording double-counts | Each island records against its own lesson and screen; the completion percentage is per lesson, unchanged |
| Rewriting 8 articles changes their rankings | Targeted edits inside existing sections where possible; keep every existing H2 that a search result snippet depends on |

## Non-goals

- Adding new lessons to reach 3–6 drills — use screens that already exist.
- Translating articles into other languages.
- An article for every one of the ~450 Excel functions (that is the "500–1,000 pages" rejection in
  [overview §7](00-overview.md)).
- Changing the drill island's visual language; this phase changes how many there are, not how they
  look.

## Deviations log

1. **`exercise:` is not deleted.** The plan said "accept the old key for one release and warn, … delete it
   in the same phase". It is read, normalised to `drills: [slug]`, and reported by the gate as a
   `legacy-field` **warning** — not deleted. Deleting it means a note written yesterday breaks on the
   day the parser changes, and the eight shipped notes are not the only copy of the template (an author
   mid-draft has one too). The check that matters is the one that is now an error: a note that sets
   **both** keys, which would render one drill twice.
2. **One drill has to practise the note's function, not all of them.** The plan said "each must belong to
   a lesson whose function matches `function:`". A note's later islands are deliberately neighbours — a
   SUMIF note that ends on `SUMIFS` teaches more than one that repeats SUMIF four times. `practises()`
   therefore passes if **at least one** listed drill requires, or documents, the note's function
   (`screen.require[].func│fn`, or `screen.docs.reference[].func│name`, case-insensitive). A note whose
   drills are all contrast lessons still fails.
3. **The word ceiling is enforced at 1,800 from 1,800, not raised from 1,400.** There was no 1,400
   ceiling left to raise: `WORD_FLOOR = 700` and `WORD_CEILING = 1800` are new exports and both
   directions are tested (a 650-word stub and an 1,850-word note). The eight notes land between 983 and
   1,101 words, so the ceiling is headroom for the next author, not a target.
4. **The e2e file is `e2e/article.spec.js`**, singular; the plan names `e2e/articles.spec.js`.
5. **An island records no progress.** Plan item 5 asked the client to "post lesson-slug + screen-id so
   progress recording stays accurate". It does not post: the note's islands are graded locally and
   announce `article-drill:check` with `{ slug, path, ok, rule, attempts, drill }` for whoever listens,
   exactly as the single island did before this phase. Progress lives on the lesson, and the last
   island's link ("Do the whole drill") is the door to it. Turning a note into a progress surface is a
   different change (it needs a lesson screen id per island, and it would make the note gateable content
   without the lesson's other screens).
6. **Section 7's table is checked by code, not by generation.** The plan's table row says the "What goes
   wrong" table "is generated from `messages.mjs`". It is not generated; the parser reads every
   backticked `#`-prefixed span in that table and refuses one that is not in `packages/grader/errors.js`
   `CODES`. Generation would have rewritten eight hand-written tables into strings the grader happens to
   emit, which is a worse read and a bigger diff.
7. **`## Other apps` needs a code span as well as two app names.** The plan asked for two names; the
   implementation also requires one code span, because "Google Sheets supports this" with nothing
   checkable is the stub the rule was meant to block.
8. **`## Alternatives` is checked for a function, not a version sentence.** The plan asked for "one
   sentence with a version marker"; the parser checks the section contains a version marker from
   `2019 / 365 / Excel 2021 / Sheets` and a code span shaped like a call (`/[A-Z][A-Z0-9.]*(/`). Sentence
   boundaries are the copy gate's job (`long-sentence`, `mean-sentence`), not the parser's.

## Gate evidence

| Gate | Result |
|---|---|
| `npm run content:articles` | 8 notes, 1,034 words on average, **0 findings** — now part of `npm run check` and of the unit job in `ci.yml` |
| `npm test` | **1,947 pass, 0 fail** (was 1,941; +6 for the template rules and islands) |
| `npm run content:check` | 88 lessons, 152 screens, **1,952 fixtures replayed**, 903 accepted / 1,049 rejected |
| `npm run build` | **122 pages**, 14 styles, 10 grader modules |
| `node legacy/src/verify.mjs` | **5,002 checks** — per-note island count and one link per listed drill |
| `npx playwright test e2e/article.spec.js` | **7 passed** |
| `npx playwright test e2e-static/static-drill.spec.js` | **7 passed** |

The rules were proved by mutation while implementing: each of the eight `structure` findings below was a
real draft failing a real check, and the fixtures in `tests/articles.test.js` now fail if a rule is
removed — a missing `## Alternatives`, 0 drills, 7 drills, a duplicated slug, a slug that is not
kebab-case, both drill keys, an unknown `#CODE`, a 650-word note and an 1,850-word one.

The renderer was proved the same way, after the fact: making `prepareArticlePage` render only the first
drill island turned `tests/articles.test.js` red with `countif: the page renders 1 of 3 drills`. Restored,
19 of 19 pass. So the island count is asserted against the note, not against the renderer's own opinion.

| Note | Words | Drills |
|---|---|---|
| `sum` | 1,076 | 5 |
| `vlookup` | 1,101 | 5 |
| `xlookup` | 1,038 | 4 |
| `index-match` | 1,044 | 5 |
| `sumif` | 983 | 4 |
| `countif` | 1,010 | 3 |
| `if` | 1,020 | 3 |
| `trim` | 998 | 3 |

