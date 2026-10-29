# Phases 0–3 Foundation Verdict and Verification Plan

Review and verification plan for parity **Phases 0, 1, 2 and 3** only. Phases 4+ are out of
scope by instruction.

Measured on `30629e8`, Node `v25.9.0` (macOS, arm64). Every number below is reproducible with
the command shown next to it; nothing here is estimated.

## Verdict

**VALID AS-IS.**

The 0 → 1 → 2 → 3 ordering is sound and does not create a broken intermediate state at any
seam. Phase 2 and Phase 3 are mutually independent (the player never imports the dashboard),
so either order works; the chosen order is the more useful one because Phase 2's session
recording is what Phase 3's dashboard reads.

No phase needs to be reordered or consolidated, and no step leaves the system broken while the next
one starts. What is red is **scope**, not sequencing: Phase 0 has three criteria that no machine in
this checkout can close (no git remote, no preview deploy), Phase 1 is 16 of 88 lessons, and Phase 2
builds five screen types that only two of its lessons ever render.

## Per-phase summary

| Phase | Doc | Assessment | Blocking gap that a machine cannot close |
|---|---|---|---|
| 0 — Port shell | [show](./phase-00-port-shell-verification-plan.md) | **Solid**, one accounting hole | CI has never run (no remote); no preview deploy; "bundle size documented" was measured as static bytes only |
| 1 — Content factory | [show](./phase-01-content-factory-verification-plan.md) | **Solid tooling / High Risk on scope** | 16 of 88 lessons; 9 of 16 groups have drills |
| 2 — Exercise engine | [show](./phase-02-exercise-engine-verification-plan.md) | **Solid engine / High Risk on coverage** | 3 of 5 screen types appear in no shipped lesson; manual shortcut matrix has no production page |
| 3 — Dashboard | [show](./phase-03-dashboard-verification-plan.md) | **Solid**, two recorded deviations | No server-side progress and no `/api/feedback` — a product decision, recorded |

Verification gate chain (both deployables), in order. Run from the repo root.

| # | Command | Expected | Proves |
|---|---|---|---|
| 1 | `vendor:check` | `25 files match manifest.json` | Vendored sheets/grader inputs are unmodified |
| 2 | `npm test` | `tests 643`, `suites 104`, `pass 643`, `fail 0` | Engine, content factory, session, progress, build contracts |
| 3 | `content:check` | `content: 16 of 88 catalogued lessons, 16 groups, 18 screens, 268 fixtures replayed` then `✓ content passes — 111 accepted and 157 rejected formulas agree with the grader` | Content and grader agree |
| 4 | `next:build` | `built 27 pages (732.3 kB of HTML+CSS)` then a 27-route table, exit `0` | Both deployables render |
| 5 | `next:check` | `next routes: 27 prerendered pages match the shared templates` | Next and static fragments are byte-identical |
| 6 | `node legacy/src/verify.mjs` | `verified 16 lesson pages, the index, the dashboard and 9 group pages — 817 checks passed` | Static dist, markup pins, links, budgets. Silent per-check; a failure prints its own line and exits non-zero |
| 7 | `npx playwright test` | `48 passed` | Both deployables work in a real browser: `chromium` drives the Next app on 4174, `static` drives `legacy/dist` on 4175 |

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
2. **Phase 2's engine is broader than the content that uses it.** All 18 shipped screens are
   `formula` (17) or `picture` (1); no lesson uses a chord, a sequence or a workbook, so those three
   renderers — and the keyboard layer that exists for them — are proven only against fixture builds.
   Anything learned about them in a browser is learned on a page the user cannot visit.
3. **Phase 1's content debt is the single largest parity gap** and it is invisible to a green gate.
   `content:check` prints `16 of 88` on every run and passes anyway. Anyone reading only "✓" will
   believe the curriculum is complete. The number is recorded as unmet in the phase-1 doc rather
   than being allowed to drift silently.
4. **The two deployables differ by ~4× in first-load JavaScript.** Measured on the same rules
   (page totals, not one route's closure against the other's framework): the static lesson page is
   161,188 B raw / 53,917 B gzipped including its two client scripts; the same lesson through Next is
   625,089 B raw / 192,293 B gzipped — **3.9× raw, 3.6× gzip**. The static `drill.js`-entry closure
   alone is 156,694 B / 52,125 B over 20 modules. The previously quoted 3.4× compared the static
   closure with a wider Next set; the honest ratio is slightly worse, not better. Phase 0's "bundle size documented"
   criterion was satisfied by measuring the static route. That is defensible — the static route is
   what deploys — but the number must be quoted with its route, never as "the page is 52 kB".
5. **Two proofs mirror the code they check.** `tests/five-types.test.js` re-implements
   `gradeScreen`'s dispatch and `tests/keys.test.js` re-implements `keysLive`. Both can pass while
   the player diverges. The concrete remedy (not applied here; see the phase-2 doc) is to export
   the dispatcher so the test imports one definition instead of copying it.
6. **The CI workflow has never run.** `git remote -v` is empty, so all three jobs in
   `.github/workflows/ci.yml` are unexecuted. It pins **Node 24**; this machine is **25.9.0**. Node
   24 was exercised by hand instead — `npx -y node@24 --test "tests/**/*.test.js"` → `tests 643`,
   `pass 643`, `fail 0`, and `build.mjs` + `next-assets.mjs` + `next build` under 24 → exit `0`,
   `built 27 pages (732.3 kB of HTML+CSS)`, 0 Turbopack warnings. What is still unexecuted is the
   workflow file itself: runner images, caches, artifact upload, job ordering.
7. **`/api/health` is prerendered, so its SHA is a build input, not a runtime read.** Built without
   `GIT_SHA` it emitted `{"status":"ok","sha":"unknown"}`. The CI job sets `GIT_SHA` and asserts the
   echo — that assertion is the only proof a deployed artifact corresponds to a commit, and it has
   never passed or failed here.
   *Closed in this verification run:* the route now falls back to
   `git rev-parse --short HEAD` at build time and keeps `unknown` only for a non-git checkout, so the
   CI contract is untouched while a local build names its commit. Evidence in the phase-0 doc, row 8.

## Baseline table

| Metric | Value | Source |
|---|---|---|
| Unit tests | 643 | `npm test` |
| Verify checks | 817 | `node legacy/src/verify.mjs` |
| Prerendered pages | 27 | `npm run next:build` |
| Fragment parity | 27/27 | `npm run next:check` |
| Browser tests | 48 (Chromium: 45 Next + 3 static) | `npx playwright test` |
| Lesson pages | 16 | `content:check` |
| Groups (catalogued / with drills) | 16 / 9 | `content:check`, build |
| Screens / fixtures | 18 / 268 (111 accepted, 157 rejected) | `content:check` |
| Free lessons | 5 | `track.freeLessonCount` |
| Vendored files | 25 | `vendor:check` |
| Static build bytes (HTML+CSS) | 732.3 kB | build summary |
| Dashboard first paint | 21.4 kB gzip of a 40 kB budget | `verify` |
| Static lesson JS graph | 52,125 B gzip over 20 modules (53,917 B with `feedback.js`) | manual rollup |
| Next lesson JS | 192,293 B gzip as a page total (176,017 B framework+app chunks) | manual rollup |
| Gate wall time | ≈ 6 s | `time npm run check` |
| Node (local / CI) | 25.9.0 / 24 — both measured green (see risk 6) | `node -v`, `ci.yml` |

## Defects recorded in these reviews, and their status

| # | Defect | Status |
|---|---|---|
| a | The drill silently dropped a failed save (`legacy/src/client/drill.js`) | **fixed** — `safeStorage()` is probed once, the dashboard's sentence is rendered at `#rail-blocked` near the rail, write semantics untouched. The note carries its own `.rail-note` class sharing the rail meta type — borrowing `.rail-count` would have been a false name in the stylesheet. Proven in the Next app by `e2e/drill.spec.js`, in the static build by `e2e-static/static-drill.spec.js`, and locked by a `tests/client.test.js` source contract (sentence, wiring, class, CSS selector). |
| b | Two Turbopack `Dynamic filesystem access causes tracing of the whole project` warnings (`legacy/src/site/assets.mjs:48`) | **fixed** — inline `/* turbopackIgnore: true */` on both dynamic calls; `npm run next:build` emits 0 warnings, still `built 27 pages (732.3 kB of HTML+CSS)`. Traced entries in `.nft.json` drop 6690 → 4954 (per lesson page 784 → 536) and `legacy/dist` is byte-identical across 58 files. |
| c | `/api/health` served `"sha":"unknown"` whenever `GIT_SHA` was unset | **fixed** — env vars still win; otherwise `git rev-parse --short HEAD` at build time; `unknown` only for a non-git checkout. CI contract unchanged: `GIT_SHA=abc123 npx next build` bakes `{"status":"ok","sha":"abc123"}`, an env-less build bakes the real short sha. |
| d | Phase 0's contract doc still claimed "11 pages" and "13/13" | **fixed** — prose now quotes 27 pages, 817 checks, 643 unit tests, 48/48 browser tests, plus a route-labelled bundle baseline. Expected counts in the review docs were raised, never lowered: 639→643 (unit), 44→45 (browser, defect a), →48 (browser, the `static` project), 254→255 and 18→19 (phase 2). |

## Still open, and why

| Item | Phase | Why it cannot close here |
|---|---|---|
| CI green on GitHub (row 9) | 0 | `git remote -v` is empty; the workflow has never executed. Remote-blocked. |
| Preview deploy + health SHA from it (row 10) | 0 | No preview deploy exists. Remote-blocked. |
| Manual shortcut matrix | 2 | Needs three operating systems with real keyboards, and no shipped lesson uses a chord. Hardware-blocked **and** content-blocked. |
| Workbook behaviour inside Excel | 2 | Needs Excel; our evaluator is not Excel's. Evaluator-blocked, and content-blocked (no shipped workbook lesson). |
| Manual dashboard checks (private window, reload, gate/reset) | 3 | Need a human; the automated equivalents cover the write path and the unlock but not incognito mode or the reset-preserves-unlock reading. |
| 72 lessons, 7 groups without drills | 1 | Weeks of authoring, not verification. |
| Human accuracy review, cohort two | 1 | 5 of 10; needs a person reading lessons against Excel. |
| Intermittent Playwright failure, the hint/reveal test in `e2e/keyboard.spec.js` | 0 | Seen twice in ~7 full runs, once before any change here; never in 12 isolated repeats or a `--repeat-each=3` suite. **Cause still unknown — do not read this as fixed.** Hardened instead: `waitForClient()` waits for the client-only `#progress-fill[data-full]` before the first Tab, and `tabTo()` records the focus trail, fails fast if focus falls back to `body`, and names the trail otherwise. If it recurs, the message says whether focus was lost or the order changed. `retries: 1` is CI-only, so a first CI attempt can still mask it. |
| Browser coverage of the **static** route, beyond `sum-basics` | 0 | **Mostly closed:** `e2e-static/` runs the static deployable in Chromium against `legacy/dist` (module graph + grading, blocked-storage warning, persistence across reload). Still open: those three tests exercise one lesson, and no static test covers the index, dashboard or group pages — the Next project does. |
| Gate output on Node 24 | all | **Closed by measurement, not by CI:** `npx -y node@24 --test "tests/**/*.test.js"` → `tests 643` / `pass 643` / `fail 0`; `build.mjs` + `next-assets.mjs` + `next build` on 24 → exit `0`, `built 27 pages (732.3 kB of HTML+CSS)`, 0 Turbopack warnings. Playwright was not re-run under 24 (the browser is a separate process from the Node that starts it). |
| `docs/plans/parity/reviews/` is untracked | 0 | The authoritative plan set is not in git. Committing it needs an explicit ask; it is not a verification gap, but a checkout that ignores untracked files loses the source of truth. |

## Stop before content authoring

Everything a machine in this checkout can prove is green. The remaining phase-1 and phase-2 redness is
**content**: 72 authored lessons and shipped chord/sequence/workbook lessons (today's 18 screens are 17
`formula` and 1 `picture`). That is an authoring programme, so it is not started here.

## How to use these documents

Each phase file has the same three sections: **Assessment**, **Critical Failure Modes**, and
**Verification Gate** — a command-by-command checklist where each row says what to expect and what
a failure means. Run the gate chain above first; if it is green, the per-phase gates tell you which
parts of it carry the proof and which claims rest on a recorded deviation instead of a test.
