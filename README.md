# Excel Supreme

A zero-signup, browser-only micro-learning site for Excel formulas. Ten drills, each one a small
spreadsheet with a single answer cell: the learner types a formula, a deterministic grader in the page
says exactly what is wrong — wrong value, wrong function, malformed syntax, with a caret under the
offending token.

Nothing is sent anywhere. There is no account, no backend, no analytics endpoint and no third-party
request: the grader, the state and the styling all ship as first-party files.

**Stack:** static HTML rendered by Node, native ES modules, `node --test`. No bundler, no framework,
no runtime dependency. Node serves `dist/`; the same directory is what you upload to any static host.

---

## Quick start

```bash
node --version          # 22 or newer — `node --test` expands the test globs; built on v25.9.0
npm test                # 268 tests, no install step
npm run build           # writes dist/ — 11 pages, one stylesheet, the assets
npm run verify          # build, then assert the emitted HTML is really complete
npm run dev             # build, then serve dist/ at http://localhost:4173
```

There is nothing to install. `npm install` is not part of the workflow and there is no
`node_modules`; if one appears, something has gone wrong.

| Command | What it does | Pass condition |
|---|---|---|
| `npm test` | Grader fixtures, content validation, build, server, client, styles, vendor pins, build verification | 268 pass, 0 fail |
| `npm run build` | Renders `dist/` from `content/` and `src/` | 11 pages, exit 0 |
| `npm run verify` | Build, then read `dist/` the way a crawler would | 333 checks pass |
| `npm run check` | `test` + `build` + `verify` | the one command to run before shipping |
| `npm run vendor:check` | Re-hash every vendored file against `vendor/manifest.json` | 25 files match |
| `npm run dev` | Build, then serve on port 4173 | `curl -I localhost:4173/excel/sum-basics` → 200 |

**Port note.** 4173 is not arbitrary: `src/site/config.mjs` falls back to `http://localhost:4173` as
`SITE_URL`, which is what canonical links, the sitemap and the JSON-LD `@id`s are built from. Serve on
a different port and those URLs stop matching the page. `PORT=5000 node src/serve.mjs` works for a
throwaway look; use `SITE_URL=https://your.host npm run build` for a real deployment.

Deploying is `npm run build` plus uploading `dist/`. There is no server-side anything.

---

## Architecture

```
content/                  the product, in JSON
  track.json              order, free-lesson count, track title and promise
  exercises/NN-slug.json  one lesson: grid, prompt, answer cell, expect, require/forbid rules, docs
src/
  grader/                 the part that must never lie
    tokenize.js parse.js  formula → tokens → AST, with positions so the caret can point
    evaluate.js functions.js values.js address.js   the tiny spreadsheet it evaluates against
    grade.js              value + rule checks → { ok, code, message, position, hint }
  client/
    state.js              pure, DOM-free: gating, progress, attempts, formula normalisation
    drill.js              the browser module: mounts on the SSR markup, renders feedback
  site/                   server-side rendering: one function per page region
    content.mjs           loads and validates content/; a malformed lesson fails the build
    shell.mjs exercise-page.mjs index-page.mjs sheet.mjs    the templates
    assets.mjs html.mjs config.mjs                          CSS concatenation, escaping, env
  styles/                 tokens.css → base.css → components.css (design system: docs/phases/05a)
  build.mjs               writes dist/, refuses third-party origins
  verify.mjs              reads dist/ and asserts the pages are complete
  serve.mjs               static server for dist/ only
vendor/                   fonts, icons, Radix colours, Open Props, licences, manifest.json (hashes)
tests/                    node --test suites, one per layer
docs/phases/              the plan each phase was built from, with what was built and what changed
docs/screenshots/         the visual baseline: lesson 1 at 1440px and 375px
```

The layer rule that keeps this honest: **the grader never touches the DOM, the client never
re-implements grading, and the templates never contain a value `content.mjs` did not validate.**

### How grading works

`grade()` in `src/grader/index.js` is a pure function. It strips one leading `=`, tokenises, parses,
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

1. Copy a neighbouring file in `content/exercises/`, rename it `11-your-slug.json`. `id` must equal
   the file name; `slug` must be lowercase kebab.
2. Fill in `grid` (rows of raw values, `startCell`), an `answerCell` inside that grid, `prompt`
   (≤160 chars) and `expect.value`.
3. Add the rules that make the lesson teach one thing: `require` the function, `forbid` the shortcut
   you do not want, `requireRef` the cell the answer must depend on.
4. Write `docs`: `dataset`, `syntax`, `reference` (a formula starting with `=`), `explain`, `errors`
   (`code` + `text`), `atWork`, `teaches`, `outcome`.
5. Append the id to `lessons` in `content/track.json`. The build fails if an exercise exists that the
   track does not list, so this is not optional.
6. Add fixtures: `tests/fixtures.test.js` grades saved inputs per lesson — at minimum one accepted
   answer, one off-by-value, one wrong-function and one syntax error.
7. `npm test && npm run verify`. The index, the rail, the pager, the sitemap and JSON-LD `position`
   all follow from `track.json`; nothing else needs editing.

Free vs paid is one number: `freeLessonCount` in `track.json` (currently 5).

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
| `npm test` | **268 passing**, 0 failing — 90 grader, 48 fixtures, 42 build/server, 32 client, 19 content, 16 styles, 13 verify, 8 vendor |
| `npm run build` | 11 pages, 280.2 kB HTML+CSS, 14 style sources, 4 fonts, 9 grader modules, 2 client modules |
| `node src/verify.mjs` | **333 checks passed** across 10 lesson pages + the index |
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
