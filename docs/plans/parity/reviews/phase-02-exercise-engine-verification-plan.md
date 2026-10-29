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

Coverage is the redness, and it is the largest finding in this review: **the shipped curriculum
contains no chord, no sequence and no workbook screen.** The build summary says it outright —
`0 workbooks` — and counting the live content gives 18 screens: **17 `formula`, 1 `picture`**. Three
of the five screen types are exercised only by fixtures built into a temp content root
(`tests/five-types.test.js`, `tests/keys-page.test.js`, `tests/workbook-page.test.js`). Nothing a
visitor can reach today is a shortcut lesson.

## Critical Failure Modes

**1. Three of five screen types are not in production content.** The engine's least-exercised paths
are the ones no live lesson renders, so every browser-level proof of chords, sequences and workbooks
runs against a page built for the test. Consequences: the manual shortcut matrix has no production
page to run on (it needs a fixture build), an accessibility scan never sees a `keys-panel`, and a
regression in those renderers would ship silently. Proven by the build summary line `0 workbooks`
and by counting screen types in `legacy/content/exercises/*.json` (gate row 7).

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
| 2 | `npx playwright test e2e/drill.spec.js e2e/keyboard.spec.js e2e/a11y.spec.js` | `19 passed` (9 + 2 + 8) | A screen type fails to grade, the keyboard layer is unreachable, or an axe scan found a new violation. The a11y spec reports the selector, not just the count. |
| 3 | `node legacy/src/verify.mjs` | `verified 16 lesson pages, the index, the dashboard and 9 group pages — 817 checks passed` | A markup pin moved. The chord/sequence distinction (`keys-panel` vs `keys-panel keys-panel-sequence`) is the most common cause. Silent per-check; a failure prints its own message. |
| 4 | `npm run content:check` | `content: 16 of 88 … 268 fixtures replayed` then `✓ content passes — 111 accepted and 157 rejected formulas agree with the grader` | The grader and content disagree — an engine change altered a verdict. |
| 5 | Manual matrix, per OS | Each shortcut resolves or degrades to `uncapturable()` with the typed fallback offered | Cannot be closed automatically. Steps and rationale are in `phase-02-exercise-engine.md`. |
| 6 | Manual, workbook lesson | Download the `.xlsx`, open in Excel, confirm the shown answer matches a recalculation | Cannot be closed automatically. The evaluator is ours, not Excel's — and there is no shipped workbook lesson, so this needs a fixture build. |
| 7 | `node --input-type=module -e "import{readFileSync,readdirSync}from'node:fs';const d='legacy/content/exercises',c={};for(const f of readdirSync(d))for(const s of JSON.parse(readFileSync(d+'/'+f,'utf8')).screens??[])c[s.type??'formula']=(c[s.type??'formula']??0)+1;console.log(c)"` | `{ formula: 17, picture: 1 }` — i.e. **no** `chord`, `sequence` or `workbook` | This is the expected (bad) baseline, not a failure of the command. Any change here means someone shipped a shortcut lesson — good news, and the manual matrix then has a real page. |

Recorded open, and not to be reported as green: the manual shortcut matrix (hardware-blocked **and**
content-blocked — see failure mode 1), and workbook behaviour inside Excel.

## Closure evidence (this verification run)

Run from `/Users/danil/Desktop/excelsupreme` on `30629e8`, Node `v25.9.0` (macOS, arm64).

| Row | Status | Evidence |
|---|---|---|
| 1 | **closed** | `node --test tests/keys.test.js tests/five-types.test.js tests/workbook-build.test.js tests/workbook-page.test.js tests/keys-page.test.js tests/session.test.js tests/sheet.test.js tests/client.test.js tests/grader.test.js` → `ℹ tests 255`, `ℹ suites 42`, `ℹ pass 255`, `ℹ fail 0` |
| 2 | **closed** | `npx playwright test e2e/drill.spec.js e2e/keyboard.spec.js e2e/a11y.spec.js` → `19 passed (6.8s)` (one earlier run reported `18 passed` plus one retried flake on `keyboard.spec.js:59`; the clean re-run is 19) |
| 3 | **closed** | `node legacy/src/verify.mjs` → `verified 16 lesson pages, the index, the dashboard and 9 group pages — 817 checks passed` |
| 4 | **closed** | `npm run content:check` → `content: 16 of 88 catalogued lessons, 16 groups, 18 screens, 268 fixtures replayed`, `✓ content passes — 111 accepted and 157 rejected formulas agree with the grader` |
| 5 | **still open** | Needs three operating systems and real keyboards; no automated substitute. Hardware-blocked **and** content-blocked (no shipped chord lesson). |
| 6 | **still open** | Needs Excel. Evaluator-blocked; our recalculation is not Excel's. Content-blocked too: no shipped workbook lesson, so it would need a fixture build to even open one. |
| 7 | **closed** | The screen-type census command prints `{ formula: 17, picture: 1 }` — the recorded (bad) baseline, reconfirmed. It is not a failure; it is why rows 5 and 6 cannot close. |

## Baseline

| Metric | Value |
|---|---|
| Screen types implemented | five: `formula`, `chord`, `sequence`, `picture`, `workbook` |
| Screen types in shipped content | two: **17 `formula`, 1 `picture`** (0 chord, 0 sequence, 0 workbook) |
| Screen types in one lesson (test fixture) | all five over seven screens |
| Targeted unit tests | 255 across 42 suites |
| Browser tests for the engine | 19 (`drill` 9, `a11y` 8, `keyboard` 2) |
| Verify checks | 817 |
| Fixtures replayed | 268 (111 accepted, 157 rejected) |
| `DEFAULT_SCORING` | `{ correct: 20, incorrect: 0, cap: 100 }` → completes in 5 screens |
| Player weighting | `ceil(100 / screens.length)` |
| Reserved combinations | detected per OS by `uncapturable()`; degrade to typed fallback |
