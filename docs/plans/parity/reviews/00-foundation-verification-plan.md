# Phases 0–3 Foundation Verdict and Verification Plan

Review and verification plan for parity **Phases 0, 1, 2 and 3** only. Phases 4+ are out of
scope by instruction.

Measured on `30629e8`, Node `v25.9.0` (macOS, arm64). Every number below is reproducible with
the command shown next to it; nothing here is estimated. Re-pinned on 2026-10-29 three times: first when
lesson 03 gained a chord and a sequence screen, then when the capstone gained a workbook screen, then
when that screen's preview started printing computed values instead of formula text — `tests 653`,
`21 screens`, `839 checks`, `52 passed`, `740.0 kB`. Every one of those moved up; the content verdict
counts did not move at all.

## Verdict

**VALID AS-IS.**

The 0 → 1 → 2 → 3 ordering is sound and does not create a broken intermediate state at any
seam. Phase 2 and Phase 3 are mutually independent (the player never imports the dashboard),
so either order works; the chosen order is the more useful one because Phase 2's session
recording is what Phase 3's dashboard reads.

No phase needs to be reordered or consolidated, and no step leaves the system broken while the next
one starts. What is red is **scope**, not sequencing: Phase 0 has one criterion no machine in this
checkout can close (a preview deploy — CI now runs on a real remote), Phase 1 is 16 of 88 lessons,
and Phase 2 builds five screen types, all five of which a shipped lesson now renders.

## Per-phase summary

| Phase | Doc | Assessment | Blocking gap that a machine cannot close |
|---|---|---|---|
| 0 — Port shell | [show](./phase-00-port-shell-verification-plan.md) | **Solid**, one accounting hole | No preview deploy; "bundle size documented" was measured as static bytes only |
| 1 — Content factory | [show](./phase-01-content-factory-verification-plan.md) | **Solid tooling / High Risk on scope** | 16 of 88 lessons; 9 of 16 groups have drills |
| 2 — Exercise engine | [show](./phase-02-exercise-engine-verification-plan.md) | **Solid engine / coverage closed** | The manual shortcut matrix and workbook-in-Excel behaviour: both have production pages now, but no machine can stand in for three real keyboards or for Excel |
| 3 — Dashboard | [show](./phase-03-dashboard-verification-plan.md) | **Solid**, two recorded deviations | No server-side progress and no `/api/feedback` — a product decision, recorded |

Verification gate chain (both deployables), in order. Run from the repo root.

| # | Command | Expected | Proves |
|---|---|---|---|
| 1 | `vendor:check` | `25 files match manifest.json` | Vendored sheets/grader inputs are unmodified |
| 2 | `npm test` | `tests 653`, `suites 105`, `pass 653`, `fail 0` | Engine, content factory, session, progress, build contracts |
| 3 | `content:check` | `content: 16 of 88 catalogued lessons, 16 groups, 21 screens, 268 fixtures replayed` then `✓ content passes — 111 accepted and 157 rejected formulas agree with the grader` | Content and grader agree |
| 4 | `next:build` | `built 27 pages (740.0 kB of HTML+CSS)` then a 27-route table, exit `0` | Both deployables render |
| 5 | `next:check` | `next routes: 27 prerendered pages match the shared templates` | Next and static fragments are byte-identical |
| 6 | `node legacy/src/verify.mjs` | `verified 16 lesson pages, the index, the dashboard and 9 group pages — 839 checks passed` | Static dist, markup pins, links, budgets. Silent per-check; a failure prints its own line and exits non-zero |
| 7 | `npx playwright test` | `52 passed` | Both deployables work in a real browser: `chromium` drives the Next app on 4174, `static` drives `legacy/dist` on 4175 |

`npm run check` is steps 2–6 (it runs `test`, `content:check`, `next:build`, `next:check` and
`verify` in that order) and takes about 6 s. Step 1 is **not** part of `check` and must be run by
hand — it is the only thing that catches a hand-edited vendor file. Step 7 is separate because it
needs a built server and Chromium. It starts two servers — `next start` on 4174 and a
dependency-free file server over `legacy/dist` on 4175 (`scripts/serve-static.mjs`) — so the static
deployable is driven in the same browser instead of being crawled as HTML only.

## Sequencing & Architectural Risks

1. **One template layer, two deployables, one of them unproven in a browser.** `legacy/src/site/*.mjs`
   renders to `legacy/dist` (crawled by `verify.mjs`) and through Next routes (diffed fragment by
   fragment by `next:check`). This was the sharpest hole in the plan: 45 browser tests ran against
   Next only, so a page that passed `verify` (HTML), passed `next:check` (fragments) and was broken
   in a browser — layout, focus order, a module graph the crawler never executes — was invisible to
   every gate. **Closed:** the `static` Playwright project now drives `legacy/dist` over HTTP on
   4175 (three tests: module graph + grading, blocked-storage warning, persistence across a reload).
   The narrowing that remains: those three tests cover `sum-basics`, not all 16 lessons, while the
   Next project still covers the whole shell — so "static is proven" means "the static deployable's
   client path is proven", not "every static page was walked".
2. **Phase 2's engine was broader than the content that used it — closed on 2026-10-29.** Of 21
   shipped screens, 17 are `formula`, 1 `picture`, 1 `chord`, 1 `sequence` and 1 `workbook`: the
   keyboard layer has pages a user can visit (lesson 03's chord and sequence, the capstone's
   workbook), each graded in a real browser and scanned by axe. The capstone was the sharpest of the
   three, because scanning it for the first time found a defect no fixture build had been scanned
   for — the workbook preview's scroll region had no keyboard access — so the type that was
   fixture-only was also the type whose accessibility had never been tested.
3. **Phase 1's content debt is the single largest parity gap** and it is invisible to a green gate.
   `content:check` prints `16 of 88` on every run and passes anyway. Anyone reading only "✓" will
   believe the curriculum is complete. The number is recorded as unmet in the phase-1 doc rather
   than being allowed to drift silently.
4. **The two deployables differ by ~4× in first-load JavaScript.** Measured on the same rules
   (page totals, not one route's closure against the other's framework): the static lesson page is
   161,187 B raw / 53,917 B gzipped including its two client scripts; the same lesson through Next is
   621,731 B raw / 190,461 B gzipped of scripts Chromium executes — **3.86× raw, 3.53× gzip** — or
   734,325 B / 229,934 B / **4.56× raw, 4.26× gzip** if the `noModule` fallback chunk the HTML also
   names is counted. The static `drill.js`-entry closure alone is 156,693 B / 52,125 B over 20
   modules. The previously quoted 3.9× / 3.6× (625,089 / 192,293) came from counting that `noModule`
   chunk while omitting the eighteen package modules and `state.js` the Next page also fetches; the
   two errors nearly cancelled, so the ratio was right to two significant figures for the wrong
   reason. Phase 0's "bundle size documented"
   criterion was satisfied by measuring the static route. That is defensible — the static route is
   what deploys — but the number must be quoted with its route, never as "the page is 52 kB".
5. **Two proofs mirror the code they check.** `tests/five-types.test.js` re-implements
   `gradeScreen`'s dispatch and `tests/keys.test.js` re-implements `keysLive`. Both can pass while
   the player diverges. The concrete remedy (not applied here; see the phase-2 doc) is to export
   the dispatcher so the test imports one definition instead of copying it.
6. **The CI workflow had never run.** `git remote -v` was empty, so all three jobs in
   `.github/workflows/ci.yml` were unexecuted while it pinned **Node 24** against a local **25.9.0**.
   *Closed in this verification run:* `origin` exists and both pushes went green on the first attempt
   on Node 24 / `ubuntu-latest` — runner image, `npm ci`, caches, artifact upload and job order are
   now executed, and every pinned number reproduced. See the baseline table's CI row.
7. **`/api/health` is prerendered, so its SHA is a build input, not a runtime read.** Built without
   `GIT_SHA` it emitted `{"status":"ok","sha":"unknown"}`. The CI job sets `GIT_SHA` and asserts the
   echo — that assertion is the only proof a deployed artifact corresponds to a commit, and it has
   now passed for real (both green runs).
   *Closed in this verification run:* the route now falls back to
   `git rev-parse --short HEAD` at build time and keeps `unknown` only for a non-git checkout, so the
   CI contract is untouched while a local build names its commit. Evidence in the phase-0 doc, row 8.

## Baseline table

| Metric | Value | Source |
|---|---|---|
| Unit tests | 653 | `npm test` |
| Verify checks | 839 | `node legacy/src/verify.mjs` |
| Prerendered pages | 27 | `npm run next:build` |
| Fragment parity | 27/27 | `npm run next:check` |
| Browser tests | 52 (Chromium: 49 Next + 3 static) | `npx playwright test` |
| Lesson pages | 16 | `content:check` |
| Groups (catalogued / with drills) | 16 / 9 | `content:check`, build |
| Screens / fixtures | 21 / 268 (111 accepted, 157 rejected) | `content:check` |
| Free lessons | 5 | `track.freeLessonCount` |
| Vendored files | 25 | `vendor:check` |
| Static build bytes (HTML+CSS) | 740.0 kB | build summary |
| Dashboard first paint | 21.4 kB gzip of a 40 kB budget | `verify` |
| Static lesson JS graph | 52,125 B gzip over 20 modules (53,917 B with `feedback.js`) | manual rollup, `zip` rules below |
| Next lesson JS | 190,461 B gzip over the scripts Chromium runs (229,934 B counting the `noModule` fallback; 176,017 B is the framework+app chunks alone) | manual rollup, re-measured 2026-10-29 |
| Gate wall time | ≈ 6 s | `time npm run check` |
| Node (local / CI) | 25.9.0 local / 24 in CI — both measured green, CI by execution | `node -v`; workflow runs 40929762382, 40929766766 |
| CI runs (GitHub Actions) | 2 of 2 green on first attempt; every number above reproduced on Node 24 / `ubuntu-latest` | `gh run list` |

## Defects recorded in these reviews, and their status

| # | Defect | Status |
|---|---|---|
| a | The drill silently dropped a failed save (`legacy/src/client/drill.js`) | **fixed** — `safeStorage()` is probed once, the dashboard's sentence is rendered at `#rail-blocked` near the rail, write semantics untouched. The note carries its own `.rail-note` class sharing the rail meta type — borrowing `.rail-count` would have been a false name in the stylesheet. Proven in the Next app by `e2e/drill.spec.js`, in the static build by `e2e-static/static-drill.spec.js`, and locked by a `tests/client.test.js` source contract (sentence, wiring, class, CSS selector). |
| b | Two Turbopack `Dynamic filesystem access causes tracing of the whole project` warnings (`legacy/src/site/assets.mjs:48`) | **fixed** — inline `/* turbopackIgnore: true */` on both dynamic calls; `npm run next:build` emits 0 warnings, still `built 27 pages (732.3 kB of HTML+CSS)`. Traced entries in `.nft.json` drop 6690 → 4954 (per lesson page 784 → 536) and `legacy/dist` is byte-identical across 58 files. |
| c | `/api/health` served `"sha":"unknown"` whenever `GIT_SHA` was unset | **fixed** — env vars still win; otherwise `git rev-parse --short HEAD` at build time; `unknown` only for a non-git checkout. CI contract unchanged: `GIT_SHA=abc123 npx next build` bakes `{"status":"ok","sha":"abc123"}`, an env-less build bakes the real short sha. |
| d | Phase 0's contract doc still claimed "11 pages" and "13/13" | **fixed** — prose now quotes 27 pages, 817 checks, 643 unit tests, 48/48 browser tests, plus a route-labelled bundle baseline. Expected counts in the review docs were raised, never lowered: 639→643 (unit), 44→45 (browser, defect a), →48 (browser, the `static` project), 254→255 and 18→19 (phase 2). Raised again on 2026-10-29 when two shortcut screens shipped: 643→645 (unit), 48→50→52 (browser), 817→827→839 (verify checks), 18→20→21 (screens), 732.3→735.2→739.4 kB; and once more when the workbook preview began computing its cells: 645→653 (unit), 739.4→740.0 kB. |

## Still open, and why

Closed since this review was first written, with evidence in the phase docs: **CI green on GitHub**
(row 9, two pushes, both green first attempt), **gate output on Node 24** (now executed by CI rather
than measured by hand — the e2e job ran Playwright under 24 too), and **`docs/plans/parity/reviews/`
is tracked** (commit `4beeaa8`, pushed to `origin`).

| Item | Phase | Why it cannot close here |
|---|---|---|
| Preview deploy + health SHA from it (row 10) | 0 | No deploy provider is connected, so there is no `$PREVIEW_URL`. Deploy-blocked, not remote-blocked any more. |
| Manual shortcut matrix | 2 | Needs three operating systems with real keyboards. Hardware-blocked only: lesson 03 ships a chord and a sequence, so the content half of this row closed on 2026-10-29. |
| Workbook behaviour inside Excel | 2 | Needs Excel; our evaluator is not Excel's. Evaluator-blocked only — the capstone now ships a workbook and its `.xlsx`, so there is a production page to run the check on. |
| Manual dashboard checks (private window, reload, gate/reset) | 3 | Need a human; the automated equivalents cover the write path and the unlock but not incognito mode or the reset-preserves-unlock reading. |
| 72 lessons, 7 groups without drills | 1 | Weeks of authoring, not verification. |
| Human accuracy review, cohort two | 1 | 5 of 10; needs a person reading lessons against Excel. |
| Intermittent Playwright failure, the hint/reveal test in `e2e/keyboard.spec.js` | 0 | Seen twice in ~7 local full runs, once before any change here; never in 12 isolated repeats, a `--repeat-each=3` suite, or the first CI runs (no `flaky` line, so no retry was consumed). The 2026-10-29 bisect did not reproduce it either: **110 isolated runs** of `e2e/keyboard.spec.js` (`--repeat-each=15` then `=40` with 6 workers), then **156** and **416** full-suite runs (`--repeat-each=3` and `=8`), then 24 + 312 after the hardening below — zero failures. **Cause still unknown, and un-reproducible on demand — do not read this as fixed.** Hardened instead, twice: `waitForClient()` waits for the client-only `#progress-fill[data-full]` before the first Tab; `tabTo()` records the focus trail, fails fast if focus falls back to `body`, and names the trail otherwise; and the three places that read focus *after* the walk now assert it with a retrying `toBeFocused()` before acting on it, because a client repaint of the rail can move focus between the walk and the read. The last of those is the leading hypothesis (a stolen focus in the gap, not a wrong tab order) and it is still only a hypothesis. `retries: 1` is CI-only, so a future first CI attempt can still be masked. A deliberate overload run (`--workers=12`, 4 cores) flaked a *different* test — the session-clock assertion in `e2e/drill.spec.js`, which tolerates 700 ms of timer drift on a 1,300 ms window. That is the suite's most load-sensitive test and it is recorded, not changed: relaxing it to accommodate an artificial overload would be weakening a timing assertion to fit a condition CI never runs. The hardening's own CI run (`3527213`: [run 40959768932](https://github.com/danilgorbunofff/ExcelExercise/actions/runs/40959768932), [run 40959769042](https://github.com/danilgorbunofff/ExcelExercise/actions/runs/40959769042)) reported `52 passed (22.2s)` with no `flaky` line, so no retry was consumed there either. |
| Browser coverage of the **static** route, beyond `sum-basics` | 0 | **Mostly closed:** `e2e-static/` runs the static deployable in Chromium against `legacy/dist` (module graph + grading, blocked-storage warning, persistence across reload). Still open: those three tests exercise one lesson, and no static test covers the index, dashboard or group pages — the Next project does. |

## Stop before content authoring

Everything a machine in this checkout can prove is green. The remaining phase-1 redness is **content**:
72 authored lessons. Phase 2 no longer contributes to it — all five screen types ship (today's 21
screens are 17 `formula`, 1 `picture`, 1 `chord`, 1 `sequence` and 1 `workbook`, the last three
shipped on 2026-10-29 on lessons 03 and 10), so what is left there is Excel-side verification, not
authoring. The curriculum is an authoring programme, so it is not started here.

## How to use these documents

Each phase file has the same three sections: **Assessment**, **Critical Failure Modes**, and
**Verification Gate** — a command-by-command checklist where each row says what to expect and what
a failure means. Run the gate chain above first; if it is green, the per-phase gates tell you which
parts of it carry the proof and which claims rest on a recorded deviation instead of a test.
