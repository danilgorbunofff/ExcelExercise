# Phase 2 — Exercise Engine: Verification Plan

Scope: the player itself — one session over all five screen types (`formula`, `chord`, `sequence`,
`picture`, `workbook`), grading, the keyboard layer, hints and thresholds, per-screen time,
and the session scorer.

## Assessment

**Solid engine, High Risk on coverage.**

The engine is proven at three levels: 255 targeted unit tests, 19 browser tests that grade and type
into a real page, and markup pins in `verify` that hold every screen type's DOM to its contract. One
lesson now carries all five types in a single seven-screen walk to `lesson_complete`, which closes
the "each type works alone but nobody walks the seam" gap.

All acceptance boxes are ticked except the manual browser/shortcut matrix, which carries a written
rationale and its exact steps.

Coverage was the redness, and most of it is now closed. Counting the live content gives 20 screens:
**17 `formula`, 1 `picture`, 1 `chord`, 1 `sequence`**. The chord and the sequence ship on lesson 03
(`countif-open-tickets`), so a visitor can reach both shortcuts, the keyboard layer, the reveal and
the typed fallback on a real lesson instead of on a page built for a test. What remains is the
workbook: the build summary still says `0 workbooks`, and that one type is exercised only by fixtures
built into a temp content root (`tests/five-types.test.js`, `tests/keys-page.test.js`,
`tests/workbook-page.test.js`).

## Critical Failure Modes

**1. The workbook screen type is not in production content.** The engine's least-exercised path is
the one no live lesson renders, so every browser-level proof of workbooks runs against a page built
for the test: the workbook manual check has no production page to run on, and a regression in that
renderer would ship silently. Proven by the build summary line `0 workbooks` and by counting screen
types in `legacy/content/exercises/*.json` (gate row 7). The chord and sequence halves of this
failure mode were closed on 2026-10-29 by shipping two shortcut screens on lesson 03: the census now
prints `{ formula: 17, chord: 1, sequence: 1, picture: 1 }`, `verify` holds their markup (827 checks),
`e2e/drill.spec.js` grades a pressed chord and an out-of-order sequence on the real page, and
`e2e/a11y.spec.js` scans both panels rather than a fixture's.

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

## Verification Gate

| # | Command | Expected | If it fails |
|---|---|---|---|
| 1 | `node --test tests/keys.test.js tests/five-types.test.js tests/workbook-build.test.js tests/workbook-page.test.js tests/keys-page.test.js tests/session.test.js tests/sheet.test.js tests/client.test.js tests/grader.test.js` | `tests 255`, `pass 255`, `fail 0`, `suites 42` | The engine, its keyboard layer or the session loop broke. Start with `client.test.js` — it is the page wiring. |
| 2 | `npx playwright test e2e/drill.spec.js e2e/keyboard.spec.js e2e/a11y.spec.js` | `21 passed` (10 + 2 + 9) | A screen type fails to grade, the keyboard layer is unreachable, or an axe scan found a new violation. The a11y spec reports the selector, not just the count. |
| 3 | `node legacy/src/verify.mjs` | `verified 16 lesson pages, the index, the dashboard and 9 group pages — 827 checks passed` | A markup pin moved. The chord/sequence distinction (`keys-panel` vs `keys-panel keys-panel-sequence`) is the most common cause. Silent per-check; a failure prints its own message. |
| 4 | `npm run content:check` | `content: 16 of 88 … 20 screens, 268 fixtures replayed` then `✓ content passes — 111 accepted and 157 rejected formulas agree with the grader` | The grader and content disagree — an engine change altered a verdict. |
| 5 | Manual matrix, per OS | Each shortcut resolves or degrades to `uncapturable()` with the typed fallback offered | Cannot be closed automatically — hardware, not content: lesson 03 now ships both a chord and a sequence to run the matrix on. Steps and rationale are in `phase-02-exercise-engine.md`. |
| 6 | Manual, workbook lesson | Download the `.xlsx`, open in Excel, confirm the shown answer matches a recalculation | Cannot be closed automatically. The evaluator is ours, not Excel's — and there is no shipped workbook lesson, so this needs a fixture build. |
| 7 | `node --input-type=module -e "import{readFileSync,readdirSync}from'node:fs';const d='legacy/content/exercises',c={};for(const f of readdirSync(d))for(const s of JSON.parse(readFileSync(d+'/'+f,'utf8')).screens??[])c[s.type??'formula']=(c[s.type??'formula']??0)+1;console.log(c)"` | `{ formula: 17, chord: 1, sequence: 1, picture: 1 }` — every type but `workbook` | This row is a census, not a pass/fail: it says which types a visitor can reach. A `workbook` key appearing means the last content-blocked type shipped, and row 6 then has a production page. |

Recorded open, and not to be reported as green: the manual shortcut matrix (hardware-blocked — three
operating systems with real keyboards; it now has a production page, so it is no longer
content-blocked), and workbook behaviour inside Excel (evaluator-blocked, and content-blocked).

## Closure evidence (this verification run)

Run from `/Users/danil/Desktop/excelsupreme` on `30629e8`, Node `v25.9.0` (macOS, arm64).

| Row | Status | Evidence |
|---|---|---|
| 1 | **closed** | `node --test tests/keys.test.js tests/five-types.test.js tests/workbook-build.test.js tests/workbook-page.test.js tests/keys-page.test.js tests/session.test.js tests/sheet.test.js tests/client.test.js tests/grader.test.js` → `ℹ tests 255`, `ℹ suites 42`, `ℹ pass 255`, `ℹ fail 0` |
| 2 | **closed** | `npx playwright test e2e/drill.spec.js e2e/keyboard.spec.js e2e/a11y.spec.js` → `21 passed (7.3s)` (re-pinned 2026-10-29: `drill` gained *a shortcut lesson grades the keys it asks for, and keeps its steps in order*, `a11y` gained *the shortcut panels of a shipped lesson pass*; the original run was `19 passed (6.8s)`, with one earlier run reporting `18 passed` plus one retried flake on `keyboard.spec.js:59`) |
| 3 | **closed** | `node legacy/src/verify.mjs` → `verified 16 lesson pages, the index, the dashboard and 9 group pages — 827 checks passed` (re-pinned 2026-10-29 from `817`: the two new screens added ten markup pins) |
| 4 | **closed** | `npm run content:check` → `content: 16 of 88 catalogued lessons, 16 groups, 20 screens, 268 fixtures replayed`, `✓ content passes — 111 accepted and 157 rejected formulas agree with the grader` (re-pinned 2026-10-29 from `18 screens`; the verdict counts did not move, which is the point) |
| 5 | **still open** | Hardware-blocked: needs three operating systems and real keyboards; no automated substitute. No longer content-blocked — lesson 03 ships a chord and a sequence, so the matrix has a production page. |
| 6 | **still open** | Needs Excel. Evaluator-blocked; our recalculation is not Excel's. Content-blocked too: no shipped workbook lesson, so it would need a fixture build to even open one. |
| 7 | **closed** | The screen-type census command prints `{ formula: 17, chord: 1, sequence: 1, picture: 1 }`. Re-pinned 2026-10-29 from `{ formula: 17, picture: 1 }` — the row's own "good news" condition, met by shipping lesson 03's two shortcut screens. |

## Baseline

| Metric | Value |
|---|---|
| Screen types implemented | five: `formula`, `chord`, `sequence`, `picture`, `workbook` |
| Screen types in shipped content | four: **17 `formula`, 1 `picture`, 1 `chord`, 1 `sequence`** (0 workbook) — 20 screens |
| Screen types in one lesson (test fixture) | all five over seven screens |
| Targeted unit tests | 255 across 42 suites |
| Browser tests for the engine | 21 (`drill` 10, `a11y` 9, `keyboard` 2) |
| Verify checks | 827 |
| Fixtures replayed | 268 (111 accepted, 157 rejected) |
| `DEFAULT_SCORING` | `{ correct: 20, incorrect: 0, cap: 100 }` → completes in 5 screens |
| Player weighting | `ceil(100 / screens.length)` |
| Reserved combinations | detected per OS by `uncapturable()`; degrade to typed fallback |
