# Phase 6 — End-to-end verification

**Purpose:** prove the prototype works as a stranger would use it, and leave a runbook so the
project can be picked up cold. No feature work happens in this phase.

**Depends on:** phases 3, 4, 5.
**Unblocks:** the validation decision (build more content vs change niche).

## Deliverables

- Green `npm test` and `npm run build`.
- A recorded browser walkthrough of the four journeys below.
- Screenshots of lesson 1 at 1440px and 375px in `docs/screenshots/`, kept as the visual baseline.
- `README.md`: run commands, architecture map, "how to add lesson 11", known limits, port note,
  and the design tokens pointer (5A) so styling decisions are not rediscovered later.
- Funnel numbers from the four journeys, quoted in the README.

## Journeys to verify

1. **Cold visit, lesson 1.** Load `/excel/sum-basics` from the index. Type `=SUM(B2:B4)`, press
   Enter. Expect: cell fills, success state, streak 1, "Next lesson" CTA.
2. **Wrong answer path.** Reload, type `=B2+B3+B4`. Expect: `func-sum` hint naming SUM. Then
   `=SUM(B2:B3)`. Expect: value hint mentioning the range. Then `=sum(`. Expect: syntax message with
   a caret position and no crash.
3. **Paywall.** Navigate to lesson 6. Expect: paywall card instead of the grid, docs still visible.
   Enter an email, expect trial start, drill mounts, reload keeps it.
4. **Docs/crawl check.** `curl` each lesson page: prompt, docs headings, reference formula, JSON-LD
   all present in the raw HTML; `sitemap.xml` lists 11 URLs.

## Automated checks

| Check | Command | Pass condition |
|---|---|---|
| Grader + fixtures | `npm test` | exit 0, per-exercise summary |
| Build | `npm run build` | 11 pages, sitemap, assets, exit 0 |
| Repeatable build | `npm run build` twice | identical file list, no duplications |
| HTML contains drill + docs | `node src/verify.mjs` | every page has prompt, docs, payload, valid JSON-LD |
| Server | `npm run dev` + `curl -I` | 200 for index and each lesson URL, 404 for unknown |
| Vendored assets | `node src/vendor-check.mjs` | every hash matches `vendor/manifest.json`, every licence file present |
| No third-party runtime | `grep -o "https://[^\"']*" dist/**/*.html dist/assets/*.css` | only the canonical base URL appears |

Write `src/verify.mjs` as part of this phase — a 60-line assertion script beats a manual checklist,
because it can be rerun after every content change.

## Manual checks that automation misses

- Visual gate (5A §11), run once at the end: desaturated screenshot, 320px, 200% zoom, blocked
  fonts, reduced motion, CLS 0 while feedback appears.
- Screenshot at 1440px and 375px and put them side by side with the reference shelf in 5A §2. If the
  page looks like a generic landing template next to those, the design is not done — fix it before
  declaring the phase complete.
- Keyboard: Tab order reaches the formula bar in ≤3 tabs, Enter checks, arrows move selection,
  Escape restores, and focus is visible at every stop.
- Mobile width (375px): formula bar and Check reachable with a thumb; the page itself never scrolls
  horizontally.
- Slow network: page still usable because the payload is inline and the fonts have `swap` fallbacks.
- Copy pass: read every string aloud — no exclamation marks, no emoji, no "Oops", no invented
  statistics, no claim the site cannot evidence.

## Acceptance criteria

- All four journeys pass in a fresh browser profile with storage cleared.
- `npm test`, `npm run build`, `node src/verify.mjs` all exit 0.
- README instructions reproduce a working local site from a clean checkout with only Node installed.
- Zero external network requests at runtime (fonts, scripts, analytics) — verify in DevTools.
- Lighthouse on one lesson page: performance ≥95, accessibility 100, best-practices ≥95. Record the
  four numbers in the README rather than asserting "it's fast".

## Risks and traps

- **Verifying on a warm cache.** Use a fresh profile; stale `localStorage` hides gating bugs.
- **Trusting the build log.** Grep the emitted HTML; a page can build "successfully" with an empty
  docs block.
- **Skipping the failure paths.** Journeys 2 and 3 are the product; journey 1 is the demo.

## Out of scope

Cross-browser matrix beyond Chrome + Safari smoke, Lighthouse as a CI gate (spot-check it, record the
numbers), and any automated visual-regression service — the screenshots in `docs/screenshots/` are
the baseline until there is a reason to pay for pixels.

---

## What was built

| Deliverable | Where | Result |
|---|---|---|
| Crawl-style assertion script | `src/verify.mjs` | `verified 10 lesson pages and the index — 333 checks passed` |
| Tests for the verifier | `tests/verify.test.js` | 9 tests: two on a good build, one on a missing build, six mutations that must fail |
| Run commands | `package.json` | `verify` = build + assert; `check` = test + build + assert |
| Browser walkthrough | this document, below | four journeys, fresh profile, seen in Chrome |
| Visual baseline | `docs/screenshots/lesson-1-{1440,375}.png` | solved state, 375px has no horizontal scroll |
| Runbook | `README.md` | commands, architecture, lesson 11 recipe, known limits, funnel numbers, Lighthouse |

`src/verify.mjs` reads `dist/` and never rebuilds, so it cannot accidentally bless a stale page. Per
lesson page it asserts the `<h1>`, the prompt, the five docs section ids, the reference formula block,
the syntax block, the `#exercise-data` payload (`id`, `answerCell`, `expect`, `docs.reference`,
`track.*`), the JSON-LD node (`@type`, `url`, `@id`, `position`, `isAccessibleForFree`, `isPartOf`) and
the existence on disk of every `/assets/…` it links. Across the site it asserts the index headings and
lesson links, the sitemap's URL count and membership, the `robots.txt` sitemap line, the stylesheet
size, the presence of the four client and grader modules, and the absence of a foreign origin.

Ten of the thirteen tests in `tests/verify.test.js` are negative by design: each copies `dist/` to a
temp directory, applies one realistic mutation (drop a docs id, empty the reference, corrupt the
payload, drift `answerCell`, drop a sitemap URL, add a foreign `<link>`, strip the task statement,
rename the index heading, add a protocol-relative script to a lesson or to the index), and asserts the
exact failure text.
A verifier whose tests only prove it passes on good input proves nothing.

## Defects found by this phase

**One copy defect, fixed.** Journey 3 walked lesson 6 (`round-markup`), which requires both ROUND and
SUM. Typing `=ROUND(1234.5,-2)` produced *"This lesson is about SUM. Your formula does not use SUM."* —
grammatically fine, pedagogically wrong: ROUND *is* used, and the message names a lesson that is not
the one being read. The default rule message is `This lesson is about ${rule.func}`, which is only true
for single-function lessons.

Fixed in content, not code: `06-round-markup.json` and `10-capstone-margin.json` now carry a per-rule
`message` (`grade.js` already preferred `rule.message` when present, and the content validator ignores
extra keys, so no schema change was needed). The replacement reads *"The total is summed before it is
rounded: wrap the range in SUM."* Verified in the browser afterwards.

**One unresolved acceptance criterion.** Lighthouse's default mobile preset measures **94** for
performance where this phase asked for ≥95. Accessibility, best practices and SEO are 100 on both
presets, TBT is 0 ms, CLS is 0. Desktop is 100/100/100/100. The mobile LCP element is the `.lede`
paragraph, and 84% of its budget is render delay: the swap webfont repaints the paragraph after the
45 kB and 58 kB text faces arrive behind 50 kB of render-blocking CSS. Inlining the stylesheet was
measured to reach exactly 95 (FCP 1.8 s, LCP 2.7 s) and rejected — 50 kB of duplicated CSS per page
and no cross-page caching to buy one point on a synthetic preset. Recorded in the README with the
alternatives, rather than asserting the site is fast.

**Decision on the mobile number (owner-approved).** Ship at 94 on the mobile preset and record it, instead
of inlining the stylesheet to reach 95. Rationale: the failure is payload under simulated throttling, not
script cost — TBT 0 ms, CLS 0, a11y/BP/SEO 100, and desktop 100 across the board — so the criterion is
being missed by a synthetic preset rather than by anything a learner on a real connection would feel.
The alternatives stay available and are listed in the README's known limits; if a real Core Web Vitals
field sample ever disagrees, the first fix to try is subsetting the two text faces, not inlining.

## Journey results

| Journey | Result |
|---|---|
| 1. Cold visit, lesson 1 | `=SUM(B2:B4)` + Enter → cell fills `3580`, success state, "Correct", next CTA "Next: AVERAGE: mean of a score list". Events: `drill_view, drill_start, drill_check, drill_complete`. **Deviation:** the plan expects "streak 1"; the streak counter was cut in phase 5 (see its deviation table) and the rail reads "1 of 10 complete" instead. |
| 2. Wrong-answer path | `=B2+B3+B4` → names SUM and what the answer needs; `=SUM(B2:B3)` → "returns 2650, but this lesson expects 3580"; `=sum(` → "The formula cannot be read" with the caret under the missing bracket. Three misses reveal the reference formula. No crash, no console error. |
| 3. Paywall | Lesson 6 shows the card in place of the grid with the docs still readable; email starts a trial; the drill mounts; reload keeps the trial; `=ROUND(SUM(B2:B4)*1.08,2)` → `4450.4`. |
| 4. Crawl | `verify.mjs` green on all 10 pages; `/sitemap.xml` lists 11 `<loc>` entries. |

Funnel counts for the whole session (one fresh profile, `window.__esEvents`):
`track_view` 1, `drill_view` 3, `drill_start` 3, `drill_check` 5, `drill_hint` 1, `drill_solution` 1,
`drill_exhausted` 1, `drill_complete` 2, `paywall_view` 1, `paywall_email` 1, `trial_start` 1.

## Acceptance criteria, as measured

| Criterion | Status |
|---|---|
| Four journeys pass in a fresh profile | pass (journey 1's streak line deviates as noted) |
| `npm test`, `npm run build`, `node src/verify.mjs` exit 0 | pass — 268 tests, 11 pages, 333 checks |
| README reproduces a working site from a clean checkout with only Node | pass — no install step exists |
| Zero external network requests at runtime | pass — no third-party origin in HTML, CSS or payload |
| Lighthouse: performance ≥95, a11y 100, best practices ≥95 | **desktop 100/100/100/100; mobile 94/100/100/100.** Performance is one point short on the mobile preset; accepted as a documented deviation (see the decision below) rather than bought with duplicated CSS |
| Screenshots + side-by-side with the 5A shelf | pass — the pages read as a workbook, not a template |

## Deviation log

| Planned | Actual | Why |
|---|---|---|
| `src/verify.mjs` "60-line assertion script" | ~200 lines, exported function + CLI, mutation-tested | One walk of the DOM per page is not enough to catch an emptied reference block; the negatives are what make the green run trustworthy |
| Journey 1 shows "streak 1" | rail shows "1 of 10 complete" | streak counter cut in phase 5 |
| Lighthouse performance ≥95 | desktop 100, mobile 94 | see above; the preset is named in the README rather than the number being rounded up |
| README written last | written last, as planned | — |

## Review round (strict code review, after sign-off)

Seven findings, all fixed. The two that mattered were holes in the verifier's own claims:

| Finding | Fix |
|---|---|
| The prompt check was `html.includes(prompt)` — but the same string sits in `#exercise-data`, so deleting `<p class="task">` still passed. Proved by mutation (0 failures). | Anchored to `<p class="task">${esc(prompt)}</p>`; new mutation test deletes the class. |
| The index heading was checked as a bare `<h1>`, so any h1 passed. | Anchored to `<h1>${esc(track.title)}</h1>`; new mutation test renames the heading. |
| The origin scan skipped `index.html` — the page a crawler lands on first. | Index is now scanned alongside the lessons; a `<script src="//cdn…">` there fails (`refers to //cdn.example.net/x.js`). |
| Neither the build gate, the CSS gate, the verifier, nor the build test matched protocol-relative URLs, which fetch remotely without a scheme. | `(?:https?:)?//` in `build.mjs`, `assets.mjs` (inside `url(…)`), `verify.mjs` and the built-output test; `assertSelfContained` is exported so a test can pin all four cases. |
| `JSON.stringify(expect) === JSON.stringify(payload.expect)` fails on key order, not on content. | `isDeepStrictEqual` from `node:util`. |
| The lesson-6/10 `message` override answered arity failures too, so `=ROUND(SUM(),2)` was told to *add* SUM. Also "1 arguments". | `message` is spoken only when the function is absent; `minArgsMessage` covers the arity branch; the default pluralises. Pinned by four grader tests and one content test. |
| Two of the new messages were themselves inaccurate ("two decimals" on a one-decimal answer, "the lookup" in a SUMIF-only capstone). | Reworded to "one decimal" and "wrap the calculation in IFERROR". |

Suite grew 257 → 268 (90 grader, 48 fixtures, 42 build/server, 32 client, 19 content, 16 styles,
13 verify, 8 vendor); the crawl count is unchanged at 333 because the fixes re-anchor existing checks
rather than add pages.

