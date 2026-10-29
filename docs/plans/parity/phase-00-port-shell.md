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
- Lesson and index routes rendering the existing 10 lessons from `content/`.
- Test runner consolidation: the 271 inherited tests run against the new package paths.
- Playwright smoke suite + CI pipeline + preview deployment.
- A redirect/route map stub so later phases can add 301s without rework.

## Status

- [x] **1. Scaffold.** `next@16.4.3` + `react@19.3.0` pinned exactly, App Router, no Tailwind, ESM JS.
      `app/layout.js`, a placeholder `app/page.js` and `app/api/health/route.js` (returns the deploy SHA).
      `npm run next:build` compiles; `/` and `/api/health` both answer on `next start`.
- [x] **2. Move legacy.** `git mv src legacy/src`, `content legacy/content`, `vendor legacy/vendor`, so
      `legacy/src/build.mjs` resolves its own root. `npm run build` / `verify` / `check` / `dev` now point
      there and the site still builds 11 pages and passes 333 checks; `npm test` passes 271.
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
      gate compares all 11 prerendered pages against the templates. Known consequence: an unknown
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
      is the right thing for a deploy to report, and the probe fails loudly ("unknown") if the env is
      missed.
- [x] **10. Playwright.** `e2e/` (not `tests/e2e/` — `tests/` is the `node --test` tree) with 13 tests:
      the index lists ten reachable drills and paints progress only after hydration; the drill accepts a
      correct formula, names the `value` rule, rejects the wrong function, points at a syntax error's
      caret, and keeps progress across a reload; the URL contract covers both 308s, a real 404, the health
      endpoint, the served sitemap/robots pair and the zero-third-party promise. `npm run e2e` builds
      first, because the suite runs against `next start`. The plan's third spec ("the paywall fake door
      fires its event") cannot exist until phase 5 ships the door; the drill and progress tests stand in
      for it.
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
6. **Static export check.** `next build` must emit the same 10 lesson pages and preserve every
   existing URL as either a real route or a `redirects()` entry (`/excel/:slug` →
   `/learn/excel/:slug`).
7. **Tests.** Point `npm test` at `packages/**` and `tests/**`. Add `tests/golden/` capturing today's
   grader verdicts for all 10 lessons (accepted + rejected fixtures) as a byte-stable snapshot.
8. **Playwright.** Three specs: index renders 10 lessons; a drill grades a correct answer and a wrong
   one; the paywall fake door fires its event.
9. **CI.** GitHub Actions: `lint → test → content:check (stub) → build → playwright → deploy preview`.
10. **Observability.** Error boundary at `app/error.jsx`; basic `/api/health` returning build SHA.

## Acceptance criteria

- [x] `npm test` reports **≥280 passing, 0 failing**, including the golden snapshot.
- [x] `npm run build` produces all 11 pages; `next start` serves every legacy URL.
- [x] Golden snapshot diff vs. `packages/grader` is **empty** for every lesson fixture.
- [ ] Playwright suite green locally and in CI. Local: 13/13 (`npm run e2e`); CI is written but has never run — the repo has no remote yet.
- [ ] Preview deploy serves the 10 lessons; `/api/health` returns the SHA.
- [x] `legacy/` still builds and deploys independently (it needs `packages/grader` beside it; its `dist/` output is standalone).
- [x] `/sitemap.xml` and `/robots.txt` list every route the app serves and no address that only
  redirects; `tests/metadata-routes.test.js` and the URL-contract spec hold them to it.
- [ ] Bundle size for a lesson page documented in the PR (baseline for phase 10 budgets).

## Test plan

| Test | Type | Where |
|---|---|---|
| Grader verdict parity | golden snapshot | `tests/golden/` |
| Schema validation rejects malformed lessons | unit | `tests/content.test.js` |
| Index lists 10 lessons | Playwright | `e2e/index.spec.js` |
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
