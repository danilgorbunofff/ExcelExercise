# Phase 0 — Port Shell: Verification Plan

Scope: the Next shell exists beside `legacy/`, both render the same content from one template
layer, both deploy independently, and the grader verdicts are frozen in a golden snapshot.

## Assessment

**Solid, with one High-Risk accounting hole.**

The port itself is proven: 27 pages prerender, `next:check` diffs every fragment against the
static build, `legacy/` still builds standalone, and the golden snapshot is byte-stable. Seven of
the eight Phase-0 acceptance boxes are ticked, each with a test or a real CI run behind it; the
eighth (a preview deploy) needs a deploy provider this checkout does not have.

The High-Risk hole was *accounting*, not code: "bundle size for a lesson page documented" had only
ever been satisfied by measuring the **static** route. The Next route is 3.9× larger raw (3.6×
gzip). The criterion
was met, but the number every future budget will be compared against was never written down with its
route attached. *Closed in this verification run:* the phase doc now carries a `## Bundle baseline`
table with both routes labelled.

## Critical Failure Modes

**1. Bundle accounting is ambiguous and under-measured.**
A lesson page costs 52,125 B gzip of JS on the static route and 176,017 B gzip of Next chunks on the
Next route (plus 16,276 B gzip for the same two client scripts, 10,057 B gzip of CSS and 14,359 B
gzip of HTML). Phase 10 budgets will be written against
whichever number someone finds first. The static route is the correct denominator — it is the one
that deploys — but the doc must say so, and the Next route must not be quoted as "the page".

*Measured provenance, added during this verification run:* both figures reproduce, but under
different rules. The static figure is the `drill.js` entry graph (20 modules, excluding the separately
loaded `feedback.js`); the Next figure is framework + app chunks, excluding the two `/assets/client/`
scripts the page also fetches. Both were taken on `30629e8`. On this tree the same rules give
156,694 B raw / 52,125 B gzip for `drill.js` — 910 B / 283 B more, because defect (a) added the
storage probe — and 573,138 B / 176,017 B for the Next chunks, unchanged. Counting every script each
page loads, like for like, the Next route is 625,089 B / 192,293 B gzip against 161,188 B / 53,917 B
gzip, i.e. **3.9× raw, 3.6× gzip** — slightly worse than the 3.4× implied by comparing the two
different rules. Phase 10 should re-measure rather than inherit either number.

**2. `/api/health` returns `"sha":"unknown"` unless `GIT_SHA` is set at build time.**
It is prerendered: `.next/server/app/api/health.body` is baked during `next build`. A deploy that
does not set the env var serves a health endpoint that is healthy but anonymous. Nothing in the
gate fails — `verify` does not require a SHA — so this is a silent deployment-identity failure.
Proof it works: build with `GIT_SHA=abc123` and assert the body echoes it.
*Closed in this verification run:* the env vars still win, and an unset env now falls back to
`git rev-parse --short HEAD` at build time, with `unknown` reserved for a non-git checkout. Evidence
in gate row 8.

**3. The workflow had never executed.** `git remote -v` was empty, so all three CI jobs (`check`,
`e2e`, `static`) were unrun prose while it pinned **Node 24** against a local **25.9.0**.
*Closed in this verification run:* the remote is `github.com/danilgorbunofff/ExcelExercise`, and both
pushes went green on the first attempt under Node 24 / `ubuntu-latest` — every pinned number
reproduced (`tests 643`, `suites 104`, `pass 643`, `fail 0`; `content: 16 of 88 …268 fixtures
replayed`; `111 accepted and 157 rejected`; `built 27 pages (732.3 kB of HTML+CSS)`; `next routes:
27`; `verified … 817 checks passed`; `48 passed (16.8s)`; `vendor: 25 files match manifest.json`).
The workflow file itself — runner image, caches, artifact upload, job order — is now executed
evidence, not prose. Evidence in gate row 9.

**4. Browser coverage was one deployable wide.** 45 Playwright tests hit `next start` on 4174;
`legacy/dist` was crawled, never opened in a browser, and `next:check` compares markup fragments, not
layout or focus order — so a defect that only shows up in a browser on the static build was invisible
to the ~1,550 passing checks in the gate.
*Closed in this run:* the `static` project (`e2e-static/`, project baseURL `http://127.0.0.1:4175`,
server `scripts/serve-static.mjs`, no dependencies) drives `legacy/dist` itself: module graph over
HTTP with no console error, 404 or MIME failure; `=SUM(B2:B4)` graded correct; the blocked-storage
sentence present at `#rail-blocked` and the drill still grading; progress surviving a reload. Three
tests, `48 passed (7.7s)` total. Not vacuous: serving `.js` as `application/octet-stream` from the
file server fails the first test, so the console-error assertion bites. Narrower than the Next half on
purpose — one lesson, not sixteen — and the index, dashboard and group pages remain Next-only in the
browser.
*A flaw inside the covered half, still open:* the hint/reveal test in `e2e/keyboard.spec.js` fails
intermittently — twice in ~7 full runs, once before any change in this run — and never in 12 isolated
repeats or a `--repeat-each=3` suite. **Cause unknown; it is not fixed.** Hardened: `waitForClient()` waits for the
client-only `#progress-fill[data-full]` before the first Tab, and `tabTo()` keeps a focus trail, fails
fast when focus falls back to `body`, and names the trail when the walk misses. `retries: 1` is set
for CI only, so the first CI run can still hide a recurrence.

**5. The golden guard depends on a clean tree.** CI asserts `git status --porcelain -- tests/golden`
is empty. That is correct, but it means a legitimate fixture change must be committed *before* the
run, and a stale `golden:update` on a dirty tree fails in a way that reads like a real regression.

**6. Stale prose in the phase contract.** The doc still said "11 pages" and "Local: 13/13". The
real numbers were 27 pages and 45 browser tests (48 once the `static` project landed). A reviewer
checking the box against the text would have looked for the wrong thing.
*Closed in this verification run:* `docs/plans/parity/phase-00-port-shell.md` now quotes 27 pages,
817 checks, 643 unit tests and 48/48 browser tests. Expected values in *this* doc moved with that,
all upward: row 2 from `tests 639` to `tests 643`, row 6 from `44 passed` to `45 passed` (defect (a)),
then to `48 passed` when the `static` project was added (three tests driving `legacy/dist` in a
browser). Nothing was lowered — the counts here are a floor the code has to meet, and every one is
now higher than when this doc was written.

**7. Two build warnings that never fail anything.** `npm run next:build` exited `0` but emitted
`Turbopack build encountered 2 warnings: … Dynamic filesystem access causes tracing of the whole
project` at `legacy/src/site/assets.mjs:48` (the `existsSync` stylesheet filter, present since
`4e31493`, not new). Static analysis therefore traces the whole project into the server output,
which inflates a hosted deploy and can trip provider size limits. Options are an inline
`/*turbopackIgnore: true*/`, a static path, or explicitly accepting the trace. Nothing in the gate
fails on it, so it will not be noticed unless it is recorded — it is recorded here, not fixed.
*Closed in this verification run:* the inline form was applied to both dynamic calls (the `join`
and the `existsSync`); `npm run next:build` now prints **0** `Dynamic filesystem access` warnings and
still `built 27 pages (732.3 kB of HTML+CSS)`. Turbopack requires the comment as the first token
inside the call, which is why it sits before `stylesDir` and before `file` rather than after them.

The warning count alone is a weak proof — a silenced warning that still traced the project would look
identical — so the trace graph was measured both ways. Summing `.next/**/*.nft.json`:

| Build | `Dynamic filesystem access` warnings | `.nft.json` files | total traced entries | entries for `learn/excel/[lesson]/page.js.nft.json` |
|---|---|---|---|---|
| comments removed | 2 | 11 | 6690 | 784 |
| comments present | 0 | 11 | 4954 | 536 |

`legacy/dist` was hashed on both builds: all 58 files identical, so the fix changes no emitted asset.
Per-lesson-page trace drops by 248 entries (~32%); the remaining 536 are the real app imports.

## Verification Gate

Run in order from the repo root. Each row: command → expected → what a failure means.

| # | Command | Expected | If it fails |
|---|---|---|---|
| 1 | `vendor:check` | `25 files match manifest.json` | A vendored grader/sheet input was edited by hand. Nothing else catches this. |
| 2 | `npm test` | `tests 643`, `suites 104`, `pass 643`, `fail 0` | The golden snapshot, schema or build contract drifted. Check `tests/golden/` first — it is the byte-stable one. |
| 3 | `next:build` | `built 27 pages (732.3 kB of HTML+CSS)` then a 27-route table, exit `0` | A route disappeared or a template threw. `27` is the floor: 16 lessons + index + dashboard + 9 group pages. |
| 4 | `next:check` | `next routes: 27 prerendered pages match the shared templates` | Next and static fragments diverged. This is the port's core invariant. |
| 5 | `node legacy/src/verify.mjs` | `verified 16 lesson pages, the index, the dashboard and 9 group pages — 817 checks passed` | A markup pin, link, budget or style rule broke on the static build. Verify is silent per-check on success; the failing check prints its own message and the exit code is non-zero. |
| 6 | `npx playwright test` | `48 passed` (45 Next + 3 static) | Either deployable broke in a real browser: `chromium` drives `next start` on 4174, `static` drives `legacy/dist` over HTTP on 4175. Chromium only — a WebKit/Firefox-specific break is not covered. |
| 7 | `npm run check` | steps 2–6 green, wall ≈ 6 s | Steps interfere; usually a stale `.next/` or a temp-root test leaking. |
| 8 | `GIT_SHA=abc123 npm run next:build && cat .next/server/app/api/health.body` | `{"status":"ok","sha":"abc123"}` | The health endpoint is prerendered without the SHA — the deploy cannot be identified. |
| 9 | `git remote -v` then push a branch | non-empty remote, workflow runs green | Closed on `origin`: a CI failure is a gate failure, not a flaky local run. The workflow runs every command in this table itself, so it never proves something the developer could not run. |
| 10 | `curl -s $PREVIEW_URL/api/health` | `sha` equals the deployed commit | Still unticked — no deploy provider is connected, so `$PREVIEW_URL` is undefined. |

**Still not closable, and must stay unticked:** a preview deploy serving 16 lessons and a health SHA
read from a real deployment (item 10). Item 9 is closed — see the closure table below.

**Closeable now, and worth closing:** item 8 (the deterministic half of the SHA criterion) and the
bundle baseline — record the **page totals** for both routes, labelled by route, in the phase doc:
`161,188 B raw / 53,917 B gzip` static and `625,089 B raw / 192,293 B gzip` Next (**3.9× raw, 3.6×
gzip**). Quoting the static `drill.js`-entry closure (`156,694 B / 52,125 B`) against Next's
framework+app chunks (`573,138 B / 176,017 B`) is what produced the earlier "3.4×" — two different
rules. The honest ratio is slightly worse, not better.

## Closure evidence (this verification run)

Run from `/Users/danil/Desktop/excelsupreme` on `30629e8`, Node `v25.9.0` (macOS, arm64).

| Row | Status | Evidence |
|---|---|---|
| 1 | **closed** | `npm run vendor:check` → `vendor: 25 files match manifest.json` |
| 2 | **closed** | `npm test` → `ℹ tests 643`, `ℹ suites 104`, `ℹ pass 643`, `ℹ fail 0` |
| 3 | **closed** | `npm run next:build` → `built 27 pages (732.3 kB of HTML+CSS)`, exit `0`, 0 Turbopack warnings |
| 4 | **closed** | `npm run next:check` → `next routes: 27 prerendered pages match the shared templates` |
| 5 | **closed** | `node legacy/src/verify.mjs` → `verified 16 lesson pages, the index, the dashboard and 9 group pages — 817 checks passed` |
| 6 | **closed** | `npx playwright test` → `48 passed (7.7s)`, two projects: `chromium` 45 on 4174, `static` 3 on 4175 (`e2e-static/static-drill.spec.js`) |
| 7 | **closed** | `npm run check` → exit `0`; all of rows 2–5 green in one pass |
| 8 | **closed** | `GIT_SHA=abc123 npm run next:build` → body `{"status":"ok","sha":"abc123"}`. Unset env → body `{"status":"ok","sha":"30629e8"}` (matches `git rev-parse --short HEAD`). Non-git checkout → `"unknown"` (covered by `tests/metadata-routes.test.js`). |
| 9 | **closed** | `origin` is `github.com/danilgorbunofff/ExcelExercise`; pushes to `main` ([run 40929762382](https://github.com/danilgorbunofff/ExcelExercise/actions/runs/40929762382)) and to `phase-0-port-shell` ([run 40929766766](https://github.com/danilgorbunofff/ExcelExercise/actions/runs/40929766766)) both went green on the first attempt, on Node 24 / `ubuntu-latest`. CI reproduced every pinned number exactly: `tests 643` / `suites 104` / `pass 643` / `fail 0`; `content: 16 of 88 catalogued lessons, 16 groups, 18 screens, 268 fixtures replayed`; `111 accepted and 157 rejected`; `built 27 pages (732.3 kB of HTML+CSS)`; `next routes: 27 prerendered pages match the shared templates`; `verified … 817 checks passed`; `48 passed (16.8s)`; `vendor: 25 files match manifest.json`; and the prerendered `/api/health` equalled the pushed `GIT_SHA`. |
| 10 | **still open** | No deploy provider is connected, so there is no preview URL to curl. What a deploy would add — the same build on a different host — is partly covered by CI row 9, which builds and serves the artifact and asserts `sha === GIT_SHA`. |

The bundle baseline rows above are labelled by route in the phase doc (`## Bundle baseline`), so
failure mode 1 is closed as an accounting problem: the static route is documented as the deployed
denominator and the Next route is never quoted as "the page".

## Baseline

| Metric | Value |
|---|---|
| Prerendered pages | 27 |
| Fragment parity | 27/27 |
| Unit tests | 643 |
| Verify checks | 817 |
| Browser tests | 48 (Chromium: 45 Next + 3 static) |
| Static build HTML+CSS | 732.3 kB |
| Static lesson route JS | 155,784 B raw / 51,842 B gzip (20 modules) |
| Next lesson route JS | 573,138 B raw / 176,017 B gzip |
| Next lesson route CSS | 47,488 B raw / 10,057 B gzip |
| Next lesson route HTML | 82,846 B raw / 14,359 B gzip |
| `/api/health` without `GIT_SHA` | `{"status":"ok","sha":"30629e8"}` (git fallback); `"unknown"` only outside a git checkout |
| Vendored files | 25 |
| CI Node pin / local Node | 24 / 25.9.0 |
