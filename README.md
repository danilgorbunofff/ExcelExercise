# Excel Supreme

A zero-signup, browser-only micro-learning site for Excel formulas. Ten drills, each one a small
spreadsheet with a single answer cell: the learner types a formula, a deterministic grader in the page
says exactly what is wrong — wrong value, wrong function, malformed syntax, with a caret under the
offending token.

Nothing is sent anywhere. There is no account, no backend, no analytics endpoint and no third-party
request: the grader, the state and the styling all ship as first-party files.

**Stack:** the shipped site is static HTML rendered by Node, native ES modules, `node --test` — no
bundler, no framework, no runtime dependency. Node serves `dist/`; the same directory is what you upload
to any static host.

That site now lives in `legacy/` and is frozen: it is the deployable artifact while the Next.js app in
`app/` is ported beside it (phase 0 of the [parity plan](docs/plans/parity/00-overview.md)). Everything
in "How grading works", "Adding lesson 11" and the phase-6 verification below still describes `legacy/`.
Until the port lands, `npm test`, `npm run build` and `npm run check` all still run against it.

---

## Quick start

```bash
node --version          # 22 or newer — `node --test` expands the test globs; built on v25.9.0
npm install             # Next.js and React, for the new app shell only
npm test                # 344 tests, no build step
npm run content:check   # every fixture replayed through the grader, plus prompt and link checks
npm run build           # writes legacy/dist — 11 pages, one stylesheet, the assets
npm run verify          # build, then assert the emitted HTML is really complete
npm run check           # all of it, including the Next.js build
npm run dev             # build, then serve legacy/dist at http://localhost:4173
npm run next:dev        # the Next.js shell on http://localhost:3000
npm run e2e             # build, then drive the shell in a real browser (Playwright)
```

`npm install` pulls the three dependencies `app/` needs (`next`, `react`, `react-dom`, pinned exact).
The static site in `legacy/` still has none — it runs on Node alone, which is why it stays deployable
while the port is in progress.

| Command | What it does | Pass condition |
|---|---|---|
| `npm test` | Grader fixtures, golden verdicts, content validation, build, server, client, styles, vendor pins, template fragments, build verification | 344 pass, 0 fail |
| `npm run golden:update` | Rewrites `tests/golden/snapshot.json` — only when a grader change is intended — and prints which verdicts moved | diff reviewed like code |
| `npm run build` | Renders `legacy/dist/` from `legacy/content/` and `legacy/src/` | 11 pages, exit 0 |
| `npm run content:check` | Loads `legacy/content/`, replays every fixture through the real grader, checks prompts and internal links | every fixture agrees, 0 errors |
| `npm run content:fixtures -- --lesson 6` | Prints every fixture for one lesson with declared vs reported rule | one row per fixture, all `✓`/`·` |
| `npm run catalog:reference` | Prints the reference mirror's categories next to our 16 catalog groups | a coverage table; skips cleanly when `reference/` is absent |
| `npm run verify` | Build, then read `legacy/dist/` the way a crawler would | 333 checks pass |
| `npm run check` | `test` + `content:check` + `next:build` + `next:check` + `verify` | the one command to run before shipping |
| `npm run vendor:check` | Re-hash every vendored file against `legacy/vendor/manifest.json` | 25 files match |
| `npm run dev` | Build, then serve on port 4173 | `curl -I localhost:4173/excel/sum-basics` → 200 |
| `npm run next:build` | Builds `legacy/dist/`, copies its assets to `public/assets/`, then `next build` | 11 prerendered routes, exit 0 |
| `npm run next:check` | Compares every prerendered Next page against the shared template fragments | 11 pages match |
| `npm run next:dev` | The same build, then `next dev` on port 3000 | `/learn/excel/sum-basics` renders |
| `npm run e2e` | `next:build`, then Playwright against `next start` on port 4174 | 13 tests pass |

**Port note.** 4173 is not arbitrary: `legacy/src/site/config.mjs` falls back to `http://localhost:4173` as
`SITE_URL`, which is what canonical links, the sitemap and the JSON-LD `@id`s are built from. Serve on
a different port and those URLs stop matching the page. `PORT=5000 node legacy/src/serve.mjs` works for a
throwaway look; use `SITE_URL=https://your.host npm run build` for a real deployment.

Deploying is `npm run build` plus uploading `legacy/dist/`. There is no server-side anything.

---

## Architecture

```
app/                      the ported Next.js shell, built beside the static site (phase 0)
  layout.js page.js       shared document head/body; the index route
  globals.css             imports the 14 stylesheets in the same order the static build concatenates
  learn/excel/[lesson]/   the lesson route: 10 prerendered slugs from generateStaticParams
  api/health/route.js     status plus the deploy SHA
  error.js not-found.js   the two boundaries: a render error, and a 404 that still looks like the site
  sitemap.js robots.js    Metadata routes: every served URL, and the crawler policy that points at them
e2e/                      Playwright: the index, the drill loop, the URL contract (npm run e2e)
.github/workflows/ci.yml  three jobs: unit + build gates, the browser suite, and the static site
lib/
  site.js                 loads config + validated content + icons once, from legacy/, for the routes
scripts/
  next-assets.mjs         copies legacy/dist/assets → public/assets so both builds serve one asset tree
  check-next-pages.mjs    asserts each prerendered page equals the shared template fragments, plus
                          that the sitemap and robots the build emits cover the track
public/assets/            build output (gitignored)
legacy/                   the shipped static site: frozen, still what deploys
  content/                the product, in JSON
    track.json            order, free-lesson count, track title and promise
    exercises/NN-slug.json  one lesson: grid, prompt, answer cell, expect, require/forbid rules, docs
  src/
    client/
      state.js            pure, DOM-free: gating, progress, attempts, formula normalisation
      drill.js            the browser module: mounts on the SSR markup, renders feedback
    site/                 server-side rendering: one function per page region
      content.mjs         the site's view of the track: URLs and prev/next on top of the validated data
      packages.mjs        the single place the build reaches into ../packages/ (named failure, not ERR_MODULE_NOT_FOUND)
      shell.mjs exercise-page.mjs index-page.mjs sheet.mjs    the templates
      assets.mjs html.mjs config.mjs                          CSS concatenation, escaping, env
    styles/               tokens.css → base.css → components.css (design system: docs/phases/05a)
    build.mjs             writes legacy/dist, refuses third-party origins
    verify.mjs            reads legacy/dist and asserts the pages are complete
    serve.mjs             static server for legacy/dist only
  vendor/                 fonts, icons, Radix colours, Open Props, licences, manifest.json (hashes)
packages/
  grader/                 the part that must never lie — npm workspace, imported by the build and the app
    tokenize.js parse.js  formula → tokens → AST, with positions so the caret can point
    evaluate.js functions.js values.js address.js   the tiny spreadsheet it evaluates against
    grade.js              value + rule checks → { ok, code, message, position, hint }
    README.md             the verdict contract: what each field means and what may not change
  content/                reads content/ and refuses anything malformed; every failure names the file
    schema.js             the lesson schema: v2 screens[] plus the v1 flat shape, normalized to one
    index.js              loadContent() → { track, exercises } in track order; validateLesson(); screenAt()
    README.md             what it rejects and why, and why page shape is deliberately not in here
  content-lint/           the authoring gate: can the lesson be shipped, not just rendered
    index.js              lintContent() → { ok, errors, warnings, stats }: fixtures replayed, prompts,
                          links; collects every finding instead of throwing on the first
    cli.js                content-lint check | fixtures --lesson NN
    README.md             the checks, the floor, and what is deliberately left to the schema
tests/                    node --test suites, one per layer
tests/golden/             byte-stable record of every grader verdict (phase 0 tripwire)
docs/phases/              the plan each phase was built from, with what was built and what changed
docs/plans/parity/        the reference-parity program, one file per phase
docs/screenshots/         the visual baseline: lesson 1 at 1440px and 375px
```

The layer rule that keeps this honest: **the grader never touches the DOM, the client never
re-implements grading, and the templates never contain a value `content.mjs` did not validate.**

### How grading works

`grade()` in `packages/grader/index.js` is a pure function. It strips one leading `=`, tokenises, parses,
checks the syntax (reporting a 1-based `position` into the stripped text), evaluates against the grid,
then applies the lesson's rules:

- `expect.value` (with optional `tolerance`) — the number the answer cell must hold.
- `require` — functions that must appear, with `minArgs` and an optional per-rule `message`
  (spoken only when the function is absent) or `minArgsMessage` (spoken when it is present with too few
  arguments — the default already names the count, so most lessons leave it out).
- `forbid` — functions that must not appear (the VLOOKUP shortcut in the INDEX/MATCH lesson).
- `requireRef` — a cell the formula must refer to, so a hard-coded number cannot pass (`requireRefMessage`
  overrides the default copy).
- `rules` — `matchType` checks, which reject text where a number is needed.

The learner's raw text is echoed back in messages; the client only ever writes it with
`textContent`, never `innerHTML`.

Lessons that need more than one function (06 needs ROUND and SUM, the capstone three) override each
rule's `message`, because the generic "This lesson is about X" would name only one of them. That
override is scoped to the absent case on purpose: "wrap the range in SUM" would be false advice from a
formula that does call SUM, so the arity branch keeps its own wording (`SUM needs at least 1 argument
here; yours has 0.`).

---

## Adding lesson 11

1. Copy a neighbouring file in `legacy/content/exercises/`, rename it `11-your-slug.json`. `id` must equal
   the file name; `slug` must be lowercase kebab.
2. Fill in `grid` (rows of raw values, `startCell`), an `answerCell` inside that grid, `prompt`
   (≤160 chars) and `expect.value`.
3. Add the rules that make the lesson teach one thing: `require` the function, `forbid` the shortcut
   you do not want, `requireRef` the cell the answer must depend on.
4. Write `docs`: `dataset`, `syntax`, `reference` (a formula starting with `=`), `explain`, `errors`
   (`code` + `text`), `atWork`, `teaches`, `outcome`.
5. Point the catalog slot at the file. `legacy/content/track.json` is the site map: 16 groups and 88
   lesson slots. A slot that is still planned carries `title` + `level`; authoring it means replacing
   those two with `{ "id": "11-your-slug", "group": "lookup" }` — the title, slug and level then come
   from the lesson file and are no longer written twice. A brand-new lesson adds a slot in the group it
   belongs to. The build fails if an exercise exists that the catalog does not list, so this is not
   optional.
6. Add fixtures: `tests/fixtures.test.js` grades saved inputs per lesson — at minimum one accepted
   answer, one off-by-value, one wrong-function and one syntax error.
7. `npm test && npm run verify`. The index, the rail, the pager, the sitemap and JSON-LD `position`
   all follow from `track.json`; nothing else needs editing.

`npm run catalog:reference` prints the reference site's lesson inventory next to our 16 groups, which
is how the remaining 78 slots were chosen.

Free vs paid is one number: `freeLessonCount` in `legacy/content/track.json` (currently 5).

### Styling

Every visual decision is specified in [docs/phases/05a-design-system.md](docs/phases/05a-design-system.md):
tokens, type scale, component anatomy, motion, copy voice. Read it before changing a colour.
`tests/styles.test.js` enforces the invariants — no raw colours outside `tokens.css`, no gradients,
one shadow, radii ≤5px, `!important` only for `[hidden]`, every `var()` defined, fixed source order.

---

## Verification (phase 6)

Run on Node v25.9.0, Chrome, macOS, `dist/` built with the default `SITE_URL`.

| Check | Result |
|---|---|
| `npm test` | **344 passing**, 0 failing — 90 grader, 48 fixtures, 44 build/server, 32 client, 32 content-lint, 20 content, 17 styles, 17 schema, 13 track schema, 13 verify, 8 vendor, 4 metadata routes, 2 fragments, 2 golden, 2 site paths |
| `npm run build` | 11 pages, 280.2 kB HTML+CSS, 14 style sources, 4 fonts, 9 grader modules, 2 client modules |
| `node legacy/src/verify.mjs` | **333 checks passed** across 10 lesson pages + the index |
| `npm run vendor:check` | 25 files match `vendor/manifest.json` |
| axe-core 4 on a lesson | 0 violations, 50 passes |
| Console | no errors or warnings, only the `[es]` debug funnel lines |
| Page weight | ≈289 KiB over 16 requests, no third-party origin |
| Horizontal scroll at 375px | none (`scrollWidth === clientWidth === 375`) |

**Lighthouse 12.8.2 on `/excel/sum-basics`** (`npx lighthouse@12`, one page, local build):

| Preset | Performance | Accessibility | Best practices | SEO | FCP | LCP | TBT | CLS |
|---|---|---|---|---|---|---|---|---|
| Desktop | **100** | **100** | **100** | **100** | 0.5 s | 0.6 s | 0 ms | 0 |
| Mobile (default: 4× CPU, slow 4G) | **94** | **100** | **100** | **100** | 2.0 s | 2.9 s | 0 ms | 0 |

The mobile number is the one honest gap: the plan asked for ≥95 and the default preset measures 94,
reproducibly, with accessibility, best practices and SEO at 100. The cause is payload under simulated
throttling, not script cost — TBT is 0 ms and CLS is 0, and 84% of LCP is attributed to render delay.
The LCP element is the `.lede` paragraph repainting when the webfont swaps, so it waits on the 45 kB
Plex Sans and 58 kB Newsreader faces queued behind 50 kB of render-blocking CSS. Inlining the
stylesheet (measured: performance 95, FCP 1.8 s, LCP 2.7 s) buys one point for 50 kB of duplicate CSS
per page and loses cross-page caching, so it was not taken. See "Known limits" for the real options.

### Funnel numbers, measured on one fresh profile

The four journeys below were walked in a browser with `localStorage` cleared. Every event the client
buffers (`window.__esEvents`, mirrored to `console.debug`) was counted afterwards.

| Journey | Observed |
|---|---|
| 1. Cold visit → index → lesson 1 → `=SUM(B2:B4)` → Enter | Cell fills `3580`, jade success state, "Correct", next CTA points at lesson 2 |
| 2. Wrong-answer path | `=B2+B3+B4` names SUM and what the answer needs instead; `=SUM(B2:B3)` → "returns 2650, but this lesson expects 3580"; `=sum(` → "cannot be read" with the caret under the missing bracket; three misses reveal the reference formula |
| 3. Paywall → lesson 6 | Card replaces the grid, docs stay readable, email starts a trial, the drill mounts, reload keeps the trial, `=ROUND(SUM(B2:B4)*1.08,2)` → 4450.4 |
| 4. Crawl | `verify.mjs`: prompt, five docs sections, reference formula, syntax block, payload and JSON-LD present on all 10 pages; sitemap lists 11 URLs |

Counted events for that session: `track_view` 1, `drill_view` 3, `drill_start` 3, `drill_check` 5,
`drill_hint` 1, `drill_solution` 1, `drill_exhausted` 1, `drill_complete` 2, `paywall_view` 1,
`paywall_email` 1, `trial_start` 1.

Read plainly: every lesson view started a drill, 5 checks produced 2 completions, and the one gated
view reached the email field. These are single-user samples proving the instrumentation fires in the
right order, not evidence of demand. Eleven events exist; nothing leaves the page.

---

## Known limits

- **No JavaScript, no grading.** The sheet, the docs and the reference formula are server-rendered, so
  a no-JS reader can still learn from the page, but Check needs the in-page grader. That is the price
  of keeping the network out of the grading path.
- **The trial is a fake door.** `paywall_email` records nothing outside the page; `es.trial` is a
  seven-day local timestamp. Lessons 6–10 are gated to test whether the copy converts, not to sell
  anything.
- **Progress lives in `localStorage`** (`es.progress`, `es.trial`), per browser and per origin. Clear
  storage and the learner is a stranger again. Corrupt values, bad dates and future-dated trials are
  handled rather than trusted.
- **`tries` cannot tell 1 attempt from 2.** A solved lesson stores `Math.max(previous, attempts) || 1`,
  because a first-try solve must still record an attempt. The success copy uses the pre-completion
  count, so the learner sees the truth; anything reading the stored number later should know this.
- **Mobile Lighthouse performance is 94, not ≥95** (details above) — an accepted, recorded deviation:
  the miss is synthetic throttling of a 289 KiB payload, not script or layout cost. If it ever matters:
  inline the critical CSS, drop a mono weight and subset the display face, or set `font-display:
  optional` on the two text faces — the last removes the swap repaint that inflates LCP, at the cost of
  showing a fallback on a slow first visit.
- **Fonts are not subset**; the vendored woff2 files carry full Latin coverage, which is the largest
  single share of the payload.
- **Verified in Chrome only**, plus a manual Safari smoke test. No cross-browser matrix and no visual
  regression service: `docs/screenshots/` is the baseline.
- **No analytics collector.** Events are buffered in memory and logged; attaching a provider later
  means forwarding `window.__esEvents`, not touching the drill.
- **Ten lessons.** Volume, not the engine, is the limit: the build, the grader and the client handle
  any number of lessons listed in `track.json`.

## Screenshots

- [Lesson 1 at 1440px](docs/screenshots/lesson-1-1440.png)
- [Lesson 1 at 375px](docs/screenshots/lesson-1-375.png)

Both are the solved state, captured in the phase-6 run. If a change makes the page look like a generic
landing template beside them, the change is the problem.

## Where the plan lives

[docs/phases/](docs/phases/README.md) holds the phase plan in order, each document updated after the
fact with what was actually built, what deviated and why, and which defects the review passes found.

Phases 1–6 are complete. Phase 7 (add a second niche vs. deepen this one) is a decision to make from
the funnel numbers, not a backlog item — it starts when someone has looked at real traffic.
