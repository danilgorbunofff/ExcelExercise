# Phase 0 — Port the shell


> Part of the [reference-parity plan](00-overview.md). This file is self-contained:
> scope, work breakdown, acceptance criteria, tests and risks for this phase only.

**Duration:** 1–1.5 weeks · **Depends on:** nothing · **Blocks:** everything
**Owner:** engineering

---

## Objective

Stand up the Next.js application beside the current static build, move the grader into a reusable
package **without changing a single behaviour**, and get the 10 existing lessons rendering and grading
through the new shell with CI and a preview deploy.

This phase exists to de-risk the stack move before any product work. At the end of it the site looks
identical, but the foundation for accounts, payments and 600 screens is in place.

## Scope

- Next.js 16 (App Router) scaffold in the repo root, current static build moved to `legacy/`.
- `packages/grader`: current `legacy/src/grader` extracted, exports unchanged.
- `packages/content`: current content reading and schema checks from `legacy/src/site/content.mjs`,
  messages unchanged.
- Lesson and index routes rendering the existing 16 lessons from `content/`.
- Test runner consolidation: the 271 inherited tests run against the new package paths.
- Playwright smoke suite + CI pipeline + preview deployment.
- A redirect/route map stub so later phases can add 301s without rework.

## Status

- [x] **1. Scaffold.** `next@16.4.3` + `react@19.3.0` pinned exactly, App Router, no Tailwind, ESM JS.
      `app/layout.js`, a placeholder `app/page.js` and `app/api/health/route.js` (returns the deploy SHA).
      `npm run next:build` compiles; `/` and `/api/health` both answer on `next start`.
- [x] **2. Move legacy.** `git mv src legacy/src`, `content legacy/content`, `vendor legacy/vendor`, so
      `legacy/src/build.mjs` resolves its own root. `npm run build` / `verify` / `check` / `dev` now point
      there, and the tree still builds and passes its checks (today: 27 pages and 851 checks;
      `npm test` passes 653).
- [x] **7. Golden.** `tests/golden/` recorded every fixture verdict before any code moved — 196 verdicts,
      byte-stable, proven to bite.
- [x] **3. Grader extracted.** `git mv legacy/src/grader packages/grader` (9 modules, zero logic edits) plus a
      `package.json` and `README.md` documenting the verdict contract. Root `package.json` declares
      `workspaces: ["packages/*"]`, so `import { grade } from "@excelsupreme/grader"` resolves. Legacy imports
      the package by relative path instead, so `node legacy/src/build.mjs` still works with no `npm install`.
      The client is the exception and keeps `../grader/index.js`: client modules are authored in their shipped
      position (`dist/assets/client/`), and `build.mjs` now copies the package to `dist/assets/grader/` — the
      196 verdicts in `tests/golden/snapshot.json` are byte-identical (sha `0bf3a043…`).
- [x] **4. Content package extracted (move-and-rewire only).** Reading plus schema validation moved
      verbatim into `packages/content/index.js`: `loadContent(dir)` → `{ track, exercises }` in track
      order, the now-exported `validateLesson(exercise, file)`, and `LEVELS`. Every `content/…` message is
      byte-identical because the tests and the build assert them. **Page shape stayed behind** — the
      `index` entries with `path`/`prevPath`/`nextPath`/`free`/level label are renderer decisions, so
      `legacy/src/site/content.mjs` is now a shim that adds them; no new API was invented beyond the ones
      the plan named. The package imports `../grader/index.js` (sibling path) so `node legacy/src/build.mjs`
      still needs no `npm install`. `legacy/src/site/grader.mjs` became `packages.mjs` and now guards both
      packages with one named failure: "packages/ is missing …" (cause preserved).
- [x] **5. Routes wired (fragments, not JSX).** The Next app renders the *same* template functions the
      static build uses rather than a JSX reimplementation that could drift: `legacy/src/site/shell.mjs`
      gained a `renderChrome({ config, page })` → `{ skip, header, footer }` seam and the two page modules
      split into `prepareExercisePage()`/`prepareIndexPage()` (returning `{ body, page }`) with
      `render*Page()` delegating to `renderDocument()`. `app/page.js` and
      `app/learn/excel/[lesson]/page.js` stitch four `dangerouslySetInnerHTML` fragments plus the JSON-LD
      `<script>`; `lib/site.js` memoizes config, validated content and icons for them. `tests/fragments.test.js`
      proves the fragments reassemble the shipped document byte for byte, and the new `npm run next:check`
      gate compares all 27 prerendered pages against the templates. Known consequence: an unknown
      `/learn/excel/<slug>` is a soft 404 on its *first* request (PPR serves the 200 shell, the resolved
      result is then cached as a hard 404 with `noindex`) — `dynamicParams = false` would fix it and is
      unavailable under `cacheComponents`.
- **Next-specific workarounds worth remembering.** Route segment config (`export const dynamic`,
      `dynamicParams`) is a hard build error under `cacheComponents`, so unknown params render on demand
      instead. `new URL("..", import.meta.url)` makes Turbopack try to bundle `..` as an asset — `lib/site.js`
      uses `process.cwd()`. The client island is still the shipped `<script type="module">` inside a
      server-rendered fragment (it executes on full loads, and every link is a plain `<a>`), so React does
      not own it until phase 5/9.
- [x] **6. Redirect map.** `next.config.mjs` carries the legacy URL map as `redirects()`: `/excel/:slug` →
      `/learn/excel/:slug` and `/index.html` → `/` (both 308, permanent). `npm run next:check` asserts the
      two rules exist with the right destination and `permanent: true`, so a future deletion fails the gate
      and not a 404 in the wild. Verified against `next start`: `/excel/sum-basics` → 308
      `/learn/excel/sum-basics`, `/index.html` → 308 `/`.
- [x] **8. Boundaries.** `app/not-found.js` reuses `renderChrome` + `siteConfig` so a 404 keeps the
      header, rail and footer instead of Next's default page; `app/error.js` is a client boundary with
      its own chrome, a `reset()` retry and the digest echoed as `Reference: …`. The brand name is
      hardcoded inside `error.js` on purpose: a boundary that can throw because configuration broke is
      not a boundary. `tests/styles.test.js` asserts every class the boundary renders exists in the
      compiled CSS, so it cannot drift into an unstyled page. **Known gap:** the boundary markup has no
      runtime test — a production throw is the only way to render it (`next dev` shows its own overlay,
      and a build-time throw fails `next build`), so the plan is a deliberate fault-injection route in
      phase 10's error-handling work.
- [x] **9. CI.** `.github/workflows/ci.yml` runs three jobs: `check` (unit + golden-unchanged + `next:build` + legacy
      verify + `next:check` + a `next start` probe that asserts `/api/health` reports the
      commit the artifact was built from), `e2e` (Playwright against `next start`), and `static` (the
      frozen legacy build and `vendor:check`). `golden:update` is never run here — the snapshot has to
      arrive as a reviewable diff. `/api/health` is prerendered, so its SHA is the *build* identity; that
      is the right thing for a deploy to report. CI exports `GIT_SHA`, so the probe compares the artifact
      against the commit; a local build falls back to `git rev-parse --short HEAD`, and only a non-git
      checkout reports `"unknown"`.
- [x] **10. Playwright.** `e2e/` (not `tests/e2e/` — `tests/` is the `node --test` tree) with 45 tests against the Next app, plus `e2e-static/` with 3 against `legacy/dist`:
      the index lists 16 reachable drills and paints progress only after hydration; the drill accepts a
      correct formula, names the `value` rule, rejects the wrong function, points at a syntax error's
      caret, and keeps progress across a reload; the URL contract covers both 308s, a real 404, the health
      endpoint, the served sitemap/robots pair and the zero-third-party promise. `npm run e2e` builds
      first, because the suite runs against `next start`. The plan's third spec ("the paywall fake door
      fires its event") cannot exist until phase 5 ships the door; the drill and progress tests stand in
      for it. A second project, `static`, serves `legacy/dist` over HTTP (`scripts/serve-static.mjs`,
      no dependencies) and drives the shipped static pages in the same browser: the module graph loads
      with no console error, 404 or MIME failure, a formula grades, the blocked-storage note appears at
      `#rail-blocked` while grading still works, and progress survives a reload.
- [x] **11. Sitemap and robots.** `app/sitemap.js` and `app/robots.js` are metadata routes built from
      the same `loadSite()` the pages use, so the URL set cannot drift from the routes. This closed a
      real gap: `scripts/next-assets.mjs` copies only `legacy/dist/assets`, so the app served neither
      file, and copying the legacy ones would have been wrong anyway — they list `/excel/<slug>`, which
      now only 308s. `tests/metadata-routes.test.js` pins the URL set, the absence of redirect-only
      addresses, and the build-date `lastmod`; the URL-contract spec proves the bytes are actually
      served after `next build`.
- **Path rewrite at the seam.** `lib/site.js` rewrites `path`/`prevPath`/`nextPath` to
      `/learn/excel/<slug>` before the routes render, so links, `<link rel=canonical>`, the pager and the
      JSON-LD `@id` point at the route that actually serves the page. The legacy build keeps `/excel/*`
      untouched, and `next:check` now loads the same `loadSite()` the routes do — otherwise it compared
      the template's paths against the app's and reported 11 false mismatches.
- **Decision — no `export default`.** The step-3 sketch asked for a default `grade()` export. The module
      already has a stable named surface (`grade`, `compute`, `structure`, …), and a lone default export would
      make `import grade from` and `import { grade } from` two ways to say the same thing. The contract is
      documented in `packages/grader/README.md` instead.
- **Caveat on "`legacy/` builds independently".** After step 3 the *output* (`legacy/dist`) is still fully
  self-contained, but building it needs `packages/grader`, so the two directories travel together. Copying
  `legacy/` alone into a temp tree is no longer enough — `tests/build.test.js` copies both packages beside it
  for exactly this reason. The failure is now legible rather than a bare `ERR_MODULE_NOT_FOUND`: build-time
  access to the packages goes through `legacy/src/site/packages.mjs`, which imports them once and rethrows as
  "packages/ is missing …" (cause preserved), asserted by its own test.
- [x] `.gitignore` covers `.next/`, `out/`, `next-env.d.ts`, `*.tsbuildinfo` and `.env*` (with
      `!.env.example`); `npm run check` now runs `next:build` too, so the shell cannot rot between here
      and the CI work in step 9.
- **Pinned: `cacheComponents: true` + `partialPrefetching: true`** (the Next 16 template default). It
      changes caching semantics globally and forbids route-level `export const dynamic`, so phase 4's
      authenticated routes must be written against it rather than around it. Revisit only in a dedicated
      upgrade phase.

## Out of scope

- Any new feature, any new screen type, any visual redesign.
- Auth, payments, database, analytics.
- Authoring new lessons.
- Touching the grader's rules or messages.

## Work breakdown

1. **Scaffold.** `npx create-next-app` with TypeScript off (repo is native ESM JS — keep it),
   App Router on, no Tailwind (we have `tokens.css`). Pin versions in `package.json`.
2. **Move legacy.** `git mv src legacy/src`, `content legacy/content`, `vendor legacy/vendor` — the
   whole tree, so `legacy/src/build.mjs` still resolves its own root and the old site can deploy during
   the transition. Test imports and the npm scripts move with it.
3. **Extract the grader.** Create `packages/grader/` from `legacy/src/grader/` — all nine modules, no
   logic edits, internal `./x.js` imports untouched because they are siblings. Publish one entry point:
   `grade(lesson, formula) → { ok, rule, message, hint, value, expected, code, position }` (see the
   decision on the missing default export in §Status).
4. **Extract content.** `packages/content/` owns reading and validation; the schema checks move out of
   `legacy/src/site/content.mjs` verbatim. `loadTrack()`/`loadLesson()` as separate entry points wait for the
   route work that needs them — today one `loadContent(dir)` returns the track and its ordered lessons.
5. **Wire routes.** `app/page.js` (index), `app/learn/excel/[lesson]/page.js` (shell + client
   island), `app/layout.js` (stylesheet order `tokens → base → components`).
6. **Static export check.** `next build` must emit the same 16 lesson pages and preserve every
   existing URL as either a real route or a `redirects()` entry (`/excel/:slug` →
   `/learn/excel/:slug`).
7. **Tests.** Point `npm test` at `packages/**` and `tests/**`. Add `tests/golden/` capturing today's
   grader verdicts for all 16 lessons (accepted + rejected fixtures) as a byte-stable snapshot.
8. **Playwright.** Nine spec files, 48 tests today: the index renders 16 lessons, a drill grades a
   correct and a wrong answer, the paywall fake door fires its event, plus a11y, keyboard order,
   routes, the gate, the dashboard, feedback and the static deployable (`e2e-static/`).
9. **CI.** GitHub Actions, three jobs: `check` (`npm test` → `content:check` → golden unchanged →
   `next:build` → `verify.mjs` → `next:check` → health echoes `GIT_SHA`), `e2e` (build, then
   `npx playwright test`), `static` (`npm run verify` + `vendor:check`). No deploy job is wired —
   there is no deploy provider.
10. **Observability.** Error boundary at `app/error.jsx`; basic `/api/health` returning build SHA.

## Acceptance criteria

- [x] `npm test` reports **≥280 passing, 0 failing**, including the golden snapshot.
- [x] `npm run build` produces all 27 pages (16 lessons, the index, the dashboard and 9 group pages); `next start` serves every legacy URL.
- [x] Golden snapshot diff vs. `packages/grader` is **empty** for every lesson fixture.
- [x] Playwright suite green locally and in CI. Local: 50/50 (`npm run e2e` — 47 `chromium` on the Next app, 3 `static` on `legacy/dist`); CI: green on `origin/main` ([run 40942379949](https://github.com/danilgorbunofff/ExcelExercise/actions/runs/40942379949)) and on `phase-0-port-shell` ([run 40942364882](https://github.com/danilgorbunofff/ExcelExercise/actions/runs/40942364882)), `50 passed (21.1s)`, after the two shortcut screens were added.
- [ ] Preview deploy serves the 16 lessons; `/api/health` returns the SHA. (No deploy provider is connected; CI builds the artifact and asserts `/api/health` echoes `GIT_SHA`, which is the same claim minus the host.)
- [x] `legacy/` still builds and deploys independently (it needs `packages/grader` beside it; its `dist/` output is standalone).
- [x] `/sitemap.xml` and `/robots.txt` list every route the app serves and no address that only
  redirects; `tests/metadata-routes.test.js` and the URL-contract spec hold them to it.
- [x] Bundle size for a lesson page documented, labelled by route (baseline for phase 10 budgets) —
  recorded in the section below, which now travels with the repo on `origin`.

## Bundle baseline

Re-measured on this tree with a production build (`legacy/dist` from `npm run build`, `.next` from
`npm run next:build`), summing every byte the page actually fetches. `node scripts/bundle-measure.mjs`
prints all of it, rules and file lists included; the rule letters below are its output. The **static**
route is the one that deploys and is the denominator phase-10 budgets must be written against; the
Next route is quoted only next to it. gzip means `zlib.gzipSync` at its default level; fonts are
excluded on both sides (each route loads two woff2 files).

| Route | JS | CSS | HTML |
|---|---|---|---|
| `legacy/dist` lesson page (`/excel/sum-basics`, served at `/learn/excel/…`) | (A) `drill.js` entry graph: 20 modules, 156,693 B raw / 52,125 B gzip. (B) The page also loads `feedback.js`, so the page total is 21 files, 161,187 B raw / 53,917 B gzip | `/assets/styles.css`: 65,765 B raw / 13,746 B gzip | 31,612 B raw / 6,090 B gzip |
| Next lesson page (`/learn/excel/sum-basics`) | (C) every `/_next/static/chunks/*.js` the HTML names: 7 files, 573,138 B raw / 176,017 B gzip — one of them carries `noModule` and no modern browser fetches it. (D) without it: 6 files, 460,544 B raw / 136,544 B gzip. (E) the page a browser runs: D + B = 621,731 B raw / 190,461 B gzip. (F) every named script: C + B = 734,325 B raw / 229,934 B gzip | 47,822 B raw / 10,122 B gzip | 82,846 B raw / 14,360 B gzip |

Compare like with like, and say which rule you are comparing: the page a browser runs is **3.86× raw
(621,731 / 161,187) and 3.53× gzipped (190,461 / 53,917)**; counting every script the HTML names it is
**4.56× / 4.26×**. Quoting the Next framework chunks against the static page's full graph — the
"3.4×" this doc used to defend — mixes the two rules and understates the shell. An earlier revision
of this table said 3.9× / 3.6×; that figure counted the `noModule` chunk *and* dropped the eighteen
package modules and `state.js` the Next page fetches, and the two mistakes nearly cancelled. The
corrected number is slightly worse, not better, and the direction matters more than the digits.

The gap is the known cost of the shell, not a regression, and it is why "the page is 52 kB" is never a
correct sentence without the route and the rule.

The numbers this doc inherited from `reviews/phase-00-port-shell-verification-plan.md`
(`155,784 B / 51,842 B gzip`, 20 modules) were taken on `30629e8` under the `drill.js`-only rule; the
1,909 B raw / 283 B gzip growth since is the storage probe defect (a) added to `drill.js`, with the
module count unchanged.

## Test plan

| Test | Type | Where |
|---|---|---|
| Grader verdict parity | golden snapshot | `tests/golden/` |
| Schema validation rejects malformed lessons | unit | `tests/content.test.js` |
| Index lists 16 lessons | Playwright | `e2e/index.spec.js` |
| Correct/wrong drill verdict renders | Playwright | `e2e/drill.spec.js` |
| Every legacy URL resolves | crawl (`npm run verify`) + Playwright | `legacy/src/verify.mjs`, `e2e/routes.spec.js` |
| Error boundary and 404 render as the site | Playwright (404) / gap (error boundary) | `e2e/routes.spec.js` |

## Risks

| Risk | Mitigation |
|---|---|
| Framework churn (Next major) | pin exact versions; upgrade only in a dedicated phase |
| Grader behaviour drift during extraction | golden snapshots written *before* the move |
| Losing the zero-origin guarantee | keep the build gate: fail if any page references a third-party origin |
| Two builds drifting | `legacy/` frozen; no feature work lands there |

## Handoff artifacts

- `packages/grader/README.md` documenting the verdict contract, and `packages/content/README.md` documenting
  what the loader rejects.
- `docs/adr/0001-nextjs-supabase-stripe.md`.
- `tests/golden/` snapshot set.
- Baseline bundle-size report.
