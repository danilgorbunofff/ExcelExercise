# Phase 2 — Exercise Engine: Verification Plan

Scope: the player itself — one session over all five screen types (`formula`, `chord`, `sequence`,
`picture`, `workbook`), grading, the keyboard layer, hints and thresholds, per-screen time,
and the session scorer.

## Assessment

**Solid engine, High Risk on coverage.**

The engine is proven at three levels: 262 targeted unit tests, 23 browser tests that grade and type
into a real page, and markup pins in `verify` that hold every screen type's DOM to its contract. One
lesson now carries all five types in a single seven-screen walk to `lesson_complete`, which closes
the "each type works alone but nobody walks the seam" gap.

All acceptance boxes are ticked except the manual browser/shortcut matrix, which carries a written
rationale and its exact steps.

Coverage was the redness, and it is now closed. Counting the live content gives 21 screens:
**17 `formula`, 1 `picture`, 1 `chord`, 1 `sequence`, 1 `workbook`**. The chord and the sequence ship
on lesson 03 (`countif-open-tickets`) and the workbook on the capstone (`10-capstone-margin`), so a
visitor can reach all five types — the shortcuts, the keyboard layer, the reveal, the typed fallback
and a real `.xlsx` download — on live lessons instead of on pages built for a test. The build
summary's workbook count is no longer `0`, and the fixture builds that used to be the only workbook
proof (`tests/five-types.test.js`, `tests/keys-page.test.js`, `tests/workbook-page.test.js`) now
prove the five types coexist rather than that they exist.

"Reachable" here means the page exists and renders the type on a live lesson; it is not a claim about
how many clicks away it is. `blockingGate()` in `legacy/src/client/drill.js:936` still enforces the
product's own order gate and free-trial paywall, so on a cold load: lesson 03's chord and sequence are
free and open once lessons 01–02 are done, while the capstone's workbook is the tenth lesson and needs
lessons 01–09, or `#gate-unlock` (the documented in-browser unlock, which also stamps the
`gated: true` view event). Both are the intended funnel, not a defect — but an automated proof that
wants the workbook screen has to clear the gate first, and a reader who takes "reachable" to mean
"one click from the index" would be wrong.

## Critical Failure Modes

**1. A screen type that no live lesson renders is a type that ships silently broken — closed.**
This failure mode was the workbook's: the engine's least-exercised path was the one no live lesson
rendered, so every browser-level proof of workbooks ran against a page built for the test, and a
regression in that renderer would have shipped unseen. It was proven by the build summary line
`0 workbooks` and by counting screen types in `legacy/content/exercises/*.json` (gate row 7). All
three halves closed by shipping the screens rather than by relaxing the check: the chord and the
sequence on 2026-10-29 on lesson 03, and the workbook on the same date on the capstone. The census
now prints `{ formula: 17, chord: 1, sequence: 1, workbook: 1, picture: 1 }`, `verify` holds the
markup of all five (839 checks), `e2e/drill.spec.js` grades a pressed chord, an out-of-order sequence
and a downloaded workbook's answer on the real pages, and `e2e/a11y.spec.js` scans every panel a
visitor reaches rather than a fixture's. Shipping the workbook screen also found a live defect no
fixture build had been scanned for: the preview's scroll area had no keyboard access, fixed by
`tabindex="0"` and a name on `.workbook-scroll` (`legacy/src/site/sheet.mjs`).

**2. Two of the newest proofs mirror the code they check.** `tests/five-types.test.js`
re-implements the grader dispatch (`accepts()` per screen type) and the final `keys` block
re-implements `keysLive`. Both can pass while the player diverges, because a copy of the logic
cannot detect that the original changed. The remedy is cheap: export `gradeScreen` and `keysLive`
and have the tests import them. Until then, treat those two as *contract* tests, not *player* tests.

**3. The manual shortcut matrix is open by design and cannot be closed here.** It needs a real
keyboard on three OSes and content whose chords are not reserved by any of them. The automated
`keys` tests deliberately use only unreserved combinations; on a platform where a combination is
taken, the player degrades to the typed fallback and says so (`uncapturable()`), and the matrix is
the only proof that the fallback is what a user actually gets.

**4. Workbook grading uses our evaluator, not Excel.** `workbook-build` and `workbook-page` prove
the `.xlsx` is well-formed and that the page presents what the builder wrote. They do not prove Excel
opens it, and they do not prove our recalculation matches Excel's on every function used. This is a
standing risk, not a regression.

**5. Session scoring has two authorities.** `DEFAULT_SCORING` (`correct: 20, cap: 100`) completes in
**5** screens; the player overrides it per lesson (`correct: Math.ceil(100 / screens.length)`). A test
that walks an N-screen lesson without applying the override finishes early or late and reads as an
engine bug. `tests/five-types.test.js` gets this right; any new walk test must copy that, not
`DEFAULT_SCORING`.

**6. The screen clock is client-side and pause-aware.** A hidden tab is not time on task:
`clock.pause()` on `document.hidden`, resume on visible, both idempotent, and a page that loads
hidden starts paused. Elapsed values in events are therefore not wall-clock, and no server ever sees
them — an analysis that sums `elapsed` across sessions is summing browser estimates.

**7. Reserved DOM ids.** `id="feedback"` belongs to the drill verdict region; the footer dialog had
to be renamed to `#feedback-dialog` after a collision was found by an axe scan. Any new element
reusing `feedback`, `rail`, `bar` or `sheet` will collide the same way, and axe will only catch the
labels, not the collision itself.

**8. Markup assertions are easy to write too narrowly.** The chord panel is
`class="keys-panel"` but the sequence panel is `class="keys-panel keys-panel-sequence"`, so
`/class="keys-panel"/` silently skips sequences. Pins must match the real attribute.

**9. A preview of a workbook that prints formulas is not a preview — closed.** The shipped capstone's
preview printed each cell's own text, so the screen that asks for the gross margin in `B7` showed
`=IFERROR(ROUND((SUMIF(A2:A5,"North",B2:B5)-…` and expected the learner to evaluate it. The panel's
stated purpose — the drill is answerable without downloading the file — was therefore met only for
sheets that had no formulas. Fixed by computing the cells with the grader's own evaluator
(`legacy/src/site/preview.mjs`, `buildCells` + `compute`), which also means the number in a preview and
the number in a verdict cannot disagree; the panel names the formulas it computed, so the lesson is
still about the formula and the value does not hide it. Formula screens are untouched: `renderSheet`
does not call the module, so their bytes and their pins are unchanged.

## Verification Gate

| # | Command | Expected | If it fails |
|---|---|---|---|
| 1 | `node --test tests/keys.test.js tests/five-types.test.js tests/workbook-build.test.js tests/workbook-page.test.js tests/keys-page.test.js tests/session.test.js tests/sheet.test.js tests/client.test.js tests/grader.test.js` | `tests 262`, `pass 262`, `fail 0`, `suites 43` | The engine, its keyboard layer or the session loop broke. Start with `client.test.js` — it is the page wiring. |
| 2 | `npx playwright test e2e/drill.spec.js e2e/keyboard.spec.js e2e/a11y.spec.js` | `23 passed` (11 + 2 + 10) | A screen type fails to grade, the keyboard layer is unreachable, or an axe scan found a new violation. The a11y spec reports the selector, not just the count. |
| 3 | `node legacy/src/verify.mjs` | `verified 16 lesson pages, the index, the dashboard and 9 group pages — 839 checks passed` | A markup pin moved. The chord/sequence distinction (`keys-panel` vs `keys-panel keys-panel-sequence`) is the most common cause. Silent per-check; a failure prints its own message. |
| 4 | `npm run content:check` | `content: 16 of 88 … 21 screens, 268 fixtures replayed` then `✓ content passes — 111 accepted and 157 rejected formulas agree with the grader` | The grader and content disagree — an engine change altered a verdict. |
| 5 | Manual matrix, per OS | Each shortcut resolves or degrades to `uncapturable()` with the typed fallback offered | Cannot be closed automatically — hardware, not content: lesson 03 now ships both a chord and a sequence to run the matrix on. Steps and rationale are in `phase-02-exercise-engine.md`. |
| 6 | Manual, workbook lesson | Download the `.xlsx`, open in Excel, confirm the shown answer matches a recalculation | Cannot be closed automatically. The evaluator is ours, not Excel's. It now has a production page: the capstone ships `capstone-margin-book-1.xlsx`, and `e2e/drill.spec.js` fetches that exact file from the running app. |
| 7 | `node --input-type=module -e "import{readFileSync,readdirSync}from'node:fs';const d='legacy/content/exercises',c={};for(const f of readdirSync(d))for(const s of JSON.parse(readFileSync(d+'/'+f,'utf8')).screens??[])c[s.type??'formula']=(c[s.type??'formula']??0)+1;console.log(c)"` | `{ formula: 17, chord: 1, sequence: 1, workbook: 1, picture: 1 }` — all five types | This row is a census, not a pass/fail: it says which types a visitor can reach. Every key present is the row's own good-news condition; a key disappearing means a type went back to being fixture-only. |
| 8 | `node --test tests/sheet.test.js tests/workbook-page.test.js` then `grep -c 'data-cell="B7" data-kind="data">44.8' legacy/dist/excel/capstone-margin.html` | `tests 36`, `pass 36`, `fail 0`; then `1` | A preview went back to printing the formula text a row holds, or stopped computing a chain. The five `preview:` cases name which: settle order, error code, blank, formula list, circular cut-off. |

Recorded open, and not to be reported as green: the manual shortcut matrix (hardware-blocked — three
operating systems with real keyboards; it has a production page, so it is not content-blocked), and
workbook behaviour inside Excel (evaluator-blocked: our recalculation is not Excel's). Nothing in this
phase is content-blocked any more.

## Closure evidence (this verification run)

Run from `/Users/danil/Desktop/excelsupreme` on `30629e8`, Node `v25.9.0` (macOS, arm64).

| Row | Status | Evidence |
|---|---|---|
| 1 | **closed** | `node --test tests/keys.test.js tests/five-types.test.js tests/workbook-build.test.js tests/workbook-page.test.js tests/keys-page.test.js tests/session.test.js tests/sheet.test.js tests/client.test.js tests/grader.test.js` → `ℹ tests 262`, `ℹ suites 43`, `ℹ pass 262`, `ℹ fail 0` (re-pinned 2026-10-29 from `tests 255` / `suites 42`: six `preview:` cases in `sheet.test.js` and *shows the value the file shows, not the formula the row holds* in `workbook-page.test.js`) |
| 2 | **closed** | `npx playwright test e2e/drill.spec.js e2e/keyboard.spec.js e2e/a11y.spec.js` → `23 passed (7.5s)` (re-pinned 2026-10-29: `drill` gained *a workbook lesson hands over the file and grades the answer it asks for*, `a11y` gained *the workbook panel of a shipped lesson passes*; the run before that was `21 passed (7.3s)`, then `19 passed (6.8s)`, with one earlier run reporting `18 passed` plus one retried flake on `keyboard.spec.js:59`) |
| 3 | **closed** | `node legacy/src/verify.mjs` → `verified 16 lesson pages, the index, the dashboard and 9 group pages — 839 checks passed` (re-pinned 2026-10-29 twice, `817` → `827` for the two shortcut screens, then `827` → `839` for the workbook screen's download link, grid and labels) |
| 4 | **closed** | `npm run content:check` → `content: 16 of 88 catalogued lessons, 16 groups, 21 screens, 268 fixtures replayed`, `✓ content passes — 111 accepted and 157 rejected formulas agree with the grader` (re-pinned 2026-10-29 from `18 screens` → `20` → `21`; the verdict counts did not move, which is the point — a workbook screen ships answers, not formulas) |
| 5 | **still open** | Hardware-blocked: needs three operating systems and real keyboards; no automated substitute. No longer content-blocked — lesson 03 ships a chord and a sequence, so the matrix has a production page. |
| 6 | **still open** | Needs Excel. Evaluator-blocked; our recalculation is not Excel's. No longer content-blocked: the capstone ships `capstone-margin-book-1.xlsx`, the app serves it as `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, and the e2e proof fetches that file. |
| 7 | **closed** | The screen-type census command prints `{ formula: 17, chord: 1, sequence: 1, workbook: 1, picture: 1 }`. Re-pinned 2026-10-29 from `{ formula: 17, picture: 1 }` — the row's own "good news" condition, met by shipping lesson 03's two shortcut screens and the capstone's workbook. |
| 8 | **closed** | `node --test tests/sheet.test.js tests/workbook-page.test.js` → `ℹ tests 36`, `ℹ pass 36`, `ℹ fail 0` (six `preview:` cases plus *shows the value the file shows, not the formula the row holds*); `grep -c 'data-cell="B7" data-kind="data">44.8' legacy/dist/excel/capstone-margin.html` → `1`. New row on 2026-10-29, added with the fix it verifies rather than after it: the preview used to print `=IFERROR(ROUND((SUMIF(A2:A5,…` where the file opens on `44.8`. |

## Baseline

| Metric | Value |
|---|---|
| Screen types implemented | five: `formula`, `chord`, `sequence`, `picture`, `workbook` |
| Screen types in shipped content | five: **17 `formula`, 1 `picture`, 1 `chord`, 1 `sequence`, 1 `workbook`** — 21 screens |
| Screen types in one lesson (test fixture) | all five over seven screens |
| Workbook preview | computed by the grader's evaluator (`legacy/src/site/preview.mjs`); formulas named under the grid |
| Targeted unit tests | 262 across 43 suites |
| Browser tests for the engine | 23 (`drill` 11, `a11y` 10, `keyboard` 2) |
| Verify checks | 839 |
| Fixtures replayed | 268 (111 accepted, 157 rejected) |
| `DEFAULT_SCORING` | `{ correct: 20, incorrect: 0, cap: 100 }` → completes in 5 screens |
| Player weighting | `ceil(100 / screens.length)` |
| Reserved combinations | detected per OS by `uncapturable()`; degrade to typed fallback |
