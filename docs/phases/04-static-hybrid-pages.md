# Phase 4 — Static hybrid pages

**Purpose:** ship the structural idea that beats the incumbent — the drill and the documentation on
one URL, generated from content, with no client-side data fetching for the SEO half.

**Depends on:** phase 2 (content shape).
**Unblocks:** phase 5 (the UI mounts in the generated pages).

## Deliverables

| File | Responsibility |
|---|---|
| `src/build.mjs` | read content, render pages to `dist/`, copy grader + client assets, concat vendor CSS, emit sitemap |
| `src/serve.mjs` | static server with clean URLs (`/excel/sum-basics` → `dist/excel/sum-basics.html`) |
| `dist/index.html` | track landing page: promise, 10 lessons, progress, CTA |
| `dist/excel/<slug>.html` | one hybrid page per lesson |
| `dist/assets/{grader,drill.js,styles.css}` | shared client assets (`styles.css` is one concatenated file) |
| `dist/assets/fonts/*.woff2` | four latin subsets copied from `vendor/fonts/` |
| `dist/sitemap.xml`, `dist/robots.txt` | crawl surface |
| `src/site/{html,config,content,sheet,shell,exercise-page,index-page,assets}.mjs` | the renderers: escaping, `SITE_*` config, content validation, drill mount, document shell + rail, lesson page + JSON-LD, index page + `Course` JSON-LD, stylesheet/sitemap assembly |
| `tests/build.test.js` | 37 tests over the built output, the validation failures, the CLI exit path and the server |

## Page anatomy (per lesson)

Layout, tokens, and component anatomy are specified in
[05a-design-system.md](05a-design-system.md). This phase only has to emit the structure.

```
<body class="light">
<header class="site">        brand · drill counter · "free" badge
<main class="shell">
  <div class="page-head">    ← editorial title block, never a centred hero
    eyebrow:    Excel track · Drill 1 of 10
    h1:         Add a column with SUM
    lede:       one sentence, 58ch max
    byline:     By <name> · Updated 28 Oct 2026 · 10 drills · ~45 min
  </div>
  <div class="layout">       ← 1fr + 260px rail at ≥1024px
    <div class="col-main">
      <section id="drill" class="sheet-card">
        header strip  dataset name + "read-only data"
        grid          A1 headers, values, one target cell
        formula bar   ref chip + input + Check
        feedback      reserved space, never shifts layout
      </section>
      <section class="docs">   ← fully server-rendered text, 68ch measure
        h2 "What it does"       plain-language explanation
        h2 "Syntax"             monospace signature
        h2 "Worked example"     the dataset + the reference formula + result
        h2 "Common errors"      table of code → cause → fix
        h2 "At work"            one paragraph of job context
      </section>
      <nav class="pager">      prev / next lesson
    </div>
    <aside class="rail">       progress: "3 of 10 complete" + 10 lesson rows
  </div>
</main>
<footer>                     one line: what this is, how grading works, contact
```

The byline is not decoration: a named author and a real revision date are the cheapest credibility
signal a lesson page has, and generated pages never have one. Do not invent credentials — use the
real author and the real build date (`<lastmod>` and the byline must agree).

The exercise JSON is injected once as `<script type="application/json" id="exercise-data">` so the
client can mount without a network request, while the docs stay crawlable HTML.

## Structured data

Emit one `LearningResource` per lesson with `name`, `description`, `teaches`, `educationalLevel`,
`isPartOf` (a `Course` for the track), and `inLanguage`. Keep it honest — do not claim ratings or
reviews the site does not have.

## Work breakdown

1. `loadContent()` — read `track.json`, enumerate `content/exercises/*.json`, order them by the
   catalog, validate required fields and fail the build with a clear message (missing `docs`, duplicate
   slug, bad grid).
2. `renderShell({ title, description, canonical, body })` — one HTML template with meta, OG tags,
   canonical, JSON-LD slot, and the asset links.
3. `renderExercise(exercise, prev, next)` — drill mount + docs block + exercise JSON script tag.
4. `renderIndex(track, exercises)` — promise, level grouping, lesson list with durations absent
   (no fake timing claims), CTA to lesson 1.
5. `writeDist()` — clean `dist/`, write pages, copy `src/grader/*.js` and `src/client/*` into
   `dist/assets/`, copy `vendor/fonts/*.woff2` to `dist/assets/fonts/`, concatenate
   `vendor/radix/*.css` → `vendor/open-props/*.css` → `src/styles/tokens.css` → `base.css` →
   `components.css` into a single `dist/assets/styles.css`, inline the four `vendor/icons/*.svg`
   where they are used, write `sitemap.xml` with `<lastmod>`, and `robots.txt` allowing everything.
6. `renderShell()` must emit `<link rel="preload" as="font" type="font/woff2" crossorigin>` for the
   two text faces, `<html class="light">` by default, and no third-party origin anywhere in the
   output. Grep the built HTML for `https://` and expect only the canonical URL and JSON-LD `@id`s.
7. `serve.mjs` — `http.createServer` with `Content-Type` mapping, clean URL resolution, 404 page,
   and `Cache-Control: no-store` in dev so rebuilds are visible.

## Mount contract

The structure is emitted now; phase 5 only wires behaviour to it. These ids are load-bearing and are
asserted by `tests/build.test.js`:

| Selector | Contents |
|---|---|
| `#drill.sheet-card` | the drill card; `aria-labelledby` points at `#drill-heading` |
| `#sheet-grid` | a real `<table role="grid">` with `<th scope="col">` letters, `<th scope="row">` numbers and `data-cell`/`data-kind` on every `<td>`; the answer cell carries `tabindex="0"` and `aria-selected="true"`; `aria-rowcount`/`aria-colcount` include the header row and the row-header column |
| `#formula-bar` | form with `#ref-chip` (the answer address, a `<span>`), `.fx`, `#formula` (input, named by `aria-label`) and `#check` (submit); no control is `name`d, so a no-JS submit reloads instead of leaking the draft into the URL |
| `#feedback` | `role="status" aria-live="polite"` with `#feedback-head` and `#feedback-body` |
| `#hint`, `#hint-text`, `#solution`, `#solution-code` | `aria-expanded`/`aria-controls` hint toggle and the hidden reference answer |
| `#progress-count` | "0 of 10" in the rail, updated client-side |
| `#exercise-data` | `application/json` payload: the exercise plus `track.{name,title,total,number,free,freeLessonCount,nextPath,nextTitle}` |
| `.rail [data-lesson]`, `[data-tick]` | per-lesson tick state |

`<script type="module" src="/assets/drill.js">` is emitted only when `src/client/drill.js` exists, so
the pages stay script-free until phase 5 lands the client module. The docs are always server-rendered.

## Content schema additions

The page header and docs block need four fields the phase-2 schema did not have, now required by
`src/site/content.mjs` and validated in `tests/content.test.js`:

| Field | Limit | Used for |
|---|---|---|
| `docs.outcome` | 120 chars | the one-line promise under the lesson title, meta description, JSON-LD `description` |
| `docs.teaches` | 80 chars | "You'll practise …" chip, index rows, JSON-LD `teaches` |
| `docs.dataset` | 60 chars | the sheet name in the drill header strip |
| `docs.reference` | 120 chars, starts with `=` | the published answer that `grade()` must accept |

The build also enforces the parts of the grading contract a schema cannot express, so a content typo
fails the build instead of shipping a dead or toothless drill:

| Check | Why it must fail the build |
|---|---|
| `answerCell` and `requireRef` parse, are written canonically (`B5`, not `b5` or `$B$5`) and fall inside the grid | the renderer compares raw address strings, so a non-canonical address validates and then matches no cell |
| `require[].func`, `forbid[].func`, `rules[].func` are in `KNOWN_FUNCTIONS` | a typo makes the drill unpassable (`require`) or toothless (`forbid`) |
| `rules[].type` is a rule the grader applies | `grade()` skips unknown types silently, which weakens grading with no signal |
| `rules[].arg` positive, `rules[].values` non-empty, `expect.tolerance` positive | same: a malformed rule never fires |
| `1 <= freeLessonCount <= lessons.length` | `0` contradicts the free entry point; the index prints "Drills 11–10" if a gate is claimed where none exists |

## Acceptance criteria

- [x] `npm run build` produces 11 HTML files plus assets; running it twice is idempotent.
- [x] `node src/build.mjs` prints `built 11 pages (247.6 kB of HTML+CSS)`, 11 concatenated style
      sources, 4 fonts and 9 grader modules, and warns only about the two phase-5 files that do not
      exist yet (`src/client/drill.js`, `src/styles/`).
- [x] Each lesson page contains: the prompt text, the docs headings (`What it does`, `Syntax`,
      `Worked example`, `Common errors`, `At work`), the reference formula, the JSON script tag, and
      valid JSON-LD (parseable by `JSON.parse` in a test). No page carries another lesson's prompt.
- [x] `curl -s localhost:4173/excel/sum-basics | grep -c "SUM"` shows the docs are real HTML, not JS.
- [x] Sitemap lists exactly the 11 URLs, absolute, with the configured base URL and a `<lastmod>`.
- [x] No page ships without an exercise: the index links only to pages that exist on disk.
- [x] `dist/assets/styles.css` is one file: Radix scales, then open-props, then `src/styles/*`. No
      `@import` and no remote `url()` (`buildStyles()` throws on either), no `<link>` to another
      origin.
- [x] `grep -o "https://[^\"']*" dist/**/*.html` returns only the canonical base URL and the
      `https://schema.org` JSON-LD vocabulary URI — nothing else is fetched at runtime.
      `assertSelfContained()` enforces this at build time rather than by grep.
- [x] Build fails loudly (non-zero exit + `build failed: <reason>`) on malformed content.
- [x] `tests/build.test.js` covers pages, idempotency, the mount contract, JSON-LD, stylesheet order,
      sitemap/robots, content-validation failures, the traversal guard, the dotfile sweep, and the
      `PORT`/mount-contract a11y invariants and the symlinked CLI path. `npm test` is 190 tests,
      0 failures.

## Deliberate deviations from this spec

- **`<body class="light">`, not `<html class="light">`.** Radix light files define `:root, .light,
  .light-theme`, so either works, but 5A's component CSS targets `body.light` and the `body` class is
  the one that can carry the `lesson`/`index` page modifier too.
- **No author byline unless `SITE_AUTHOR` is set**, and no duration anywhere. The spec wants a real
  name and the real build date; inventing either would be the fake-credibility failure the whole
  project is avoiding. `SITE_BUILT_AT=YYYY-MM-DD` pins the date for byte-identical rebuilds.
- **"Common errors" is a two-column table** (error code, what it means and how to fix it) because the
  content schema stores `{code, text}` and `text` already contains the cause *and* the fix.
- **`https://schema.org` is the one permitted non-site origin** in the emitted HTML. It is a JSON-LD
  vocabulary URI, never fetched; `assertSelfContained()` allowlists it explicitly.
- **`src/verify.mjs` (5A) owns the vendor hash check.** `vendor/manifest.json` exists now with
  `url`, `sha256`, `bytes`, `licence`, `licenceFile` and `added` for all 25 files, and all 25 were
  confirmed byte-identical to their pinned CDN URLs.

## Risks and traps

- **Client-rendered docs.** If the docs block is injected by JS, the hybrid-page advantage is gone.
  The drill may mount client-side; the text must not.
- **Template-per-page with swapped nouns.** Same failure mode as phase 2 — each page needs its own
  dataset, numbers, and error list.
- **Dist committed to the repo.** Keep `dist/` generated; `.gitignore` covers `dist/` and `.DS_Store`.
- **Hardcoded localhost.** Read `SITE_URL` from the environment with a localhost default so canonicals
  are correct in production.
- **Wrong CSS order.** Radix must be concatenated *before* `tokens.css`; if the semantic aliases land
  first they resolve to nothing and the page renders with inherited black on white.
- **Unpinned vendor files.** Never fetch from a CDN at build time in production; `vendor/` is
  committed and hash-checked so a CDN outage or a moved tag cannot change the site.

## Out of scope

RSS, i18n routes, blog section, pricing page, MDX, image optimisation, CDN config.
