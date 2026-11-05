# Phase 4 — Workbooks and shortcuts

**Status:** shipped (2026-11-01).
**Depends on:** phase 3 (the pages the workbooks attach to).
**Unblocks:** phase 5 (nothing here needs markup, but the downloads are one of the metrics).
**Size:** one writer extension, one download link per page, one new content type and route.

---

## Purpose

Two pieces of distribution, both half-built already:

- **A real `.xlsx` on every page.** `legacy/src/xlsx.mjs` writes deterministic workbooks today, but
  `spreadsheet()` is single-sheet and no article or problem page links to a file. Downloads are the
  artefact competitors report as their stickiest; ours costs one function call.
- **A shortcuts silo.** `packages/keys` parses chords and produces labels with no DOM dependency, the
  build renders chord and sequence screens — and no catalog lesson uses them. Meanwhile "excel
  keyboard shortcuts" is a high-volume query we answer nowhere.

Both are content-shaped additions to machinery that exists. Neither adds a dependency.

## Deliverables

| # | Change | File |
|---|---|---|
| 1 | `workbook(sheets[])` with multiple sheets; `spreadsheet()` becomes a wrapper | `legacy/src/xlsx.mjs` |
| 2 | Exercise + Solution tabs (solution as a live formula, not a value) | `legacy/src/xlsx.mjs`, lesson renderer |
| 3 | Download link on every lesson, article and problem page | `exercise-page.mjs`, `article-page.mjs`, `formula-page.mjs` |
| 4 | Byte-identical rebuild test across two sheets | `tests/xlsx.test.js` |
| 5 | `legacy/content/shortcuts/*.md` + loader | new |
| 6 | `/shortcuts` hub and `/shortcuts/[slug]` pages, both builds | `app/shortcuts/…`, `legacy/src/site/shortcut-page.mjs` |
| 7 | First real chord lesson, using the existing chord screen | `legacy/content/exercises/` |
| 8 | Windows / macOS / Sheets tabs, device banner with a skip | shortcut page renderer |

## Part A — Multi-sheet workbooks

1. **`workbook(sheets)`.** `parts(sheet)` and `zip()` already take one sheet name and one row set.
   Generalise to:

   ```js
   export function workbook(sheets) {
     // sheets: [{ name, origin, rows, columns? }]
   }
   ```

   That means a `workbook.xml` listing the sheets in authored order with `sheetId` 1..n, one
   `worksheets/sheet{n}.xml` each, `workbook.xml.rels` pointing at them, and sheet names sanitised to
   Excel's 31-character / `[]:*?/\\` limits — throwing rather than truncating, because a silently
   truncated tab name is a content bug nobody notices.

   Keep `spreadsheet(sheet)` as `workbook([sheet])` so every existing call site and golden stays
   byte-identical. That is the compatibility test: if any existing `.xlsx` changes bytes, the
   refactor is wrong.

2. **Two tabs, named for what they are.** `Exercise` holds the grid exactly as the learner sees it,
   blanks included. `Solution` holds the same grid with the reference formula in the answer cell —
   the formula string, so the reader can open it in Excel and see how it computes, not a pasted
   number. Use the same reference the grader reveals (`screen.reference` or `docs.reference`), the
   one source of truth already established in phase 1.

3. **Names and links.** `workbookName(slug, screenId)` stays the file-naming authority;
   `workbookUrl` stays the URL authority. The page must link exactly what `build` writes —
   `legacy/src/verify.mjs` already asserts page/files agreement for workbook screens, so extend the
   same assertion to article and problem pages rather than inventing a second check.

4. **Determinism.** The pinning is already there (fixed timestamps, `deflateRawSync`, part order);
   multi-sheet adds a new opportunity to leak `Date` or a `Map` iteration order into the ZIP. Test:
   build twice in one process, compare SHA-256, then build in a fresh process and compare again.

## Part B — The shortcuts silo

1. **Content type.** `legacy/content/shortcuts/*.md`, one page per family
   (`navigation`, `selection`, `formatting`, `formulas`, `data`, `window`). Frontmatter:
   `title`, `summary`, `description`, `platforms`, `updated`. Body: a `## Shortcuts` table of
   `Action | Windows | macOS | Sheets`, one `## When to use it` paragraph, and one
   `## Practice` block naming a chord lesson slug.

   The table is the page. A shortcuts page with prose and no table is refused by lint, the same way
   an article without an errors table is refused.

2. **Route.** `/shortcuts` (hub: the six families, with a search field over the tables) and
   `/shortcuts/[slug]`. Published by both builds, added to `extraKeys`, the sitemap and the search
   index — the same three places the problem silo was added in phase 3. Reuse that checklist rather
   than re-deriving it.

3. **Platform tabs.** Three tabs rendered as real links to `?platform=macos` so the page works
   without JavaScript and each tabbed state is a shareable URL with its own canonical. Windows is
   the default; macOS is the platform whose key names trip people up, so it is a first-class tab, not
   a footnote.

4. **Device banner.** On a touch-primary device (`matchMedia("(pointer: coarse)")`), a dismissible
   banner above the table: a keyboard shortcuts page is a strange thing to land on from a tablet, so
   offer the drill path instead ("Practice formulas instead →"). Dismissal is remembered in
   `localStorage` under the site's existing storage prefix. The banner never covers the table and is
   never announced twice to a screen reader.

5. **One real chord lesson.** `packages/keys` and the chord/sequence screen renderers exist with no
   content using them (`tests/keys-page.test.js` renders a synthetic one, which is how we know). Add
   one lesson — `shortcut-select-to-edge` or similar — so the shortcut pages' `## Practice` link goes
   somewhere real, chord grading is exercised in the catalog rather than only in a test, and the
   fixtures floor applies to it like every other lesson. One lesson, not a curriculum.

## Acceptance gate

```sh
npm test                     # xlsx determinism, keys units, chord screen grading
npm run verify               # build + self-containment + page/file agreement for every download
npm run build && node legacy/src/verify.mjs
npx playwright test e2e/shortcuts.spec.js
npx playwright test --project=axe
```

Done when:

- Every lesson, article and problem page links a workbook that exists in `dist/` and opens in
  Excel/LibreOffice (verify script asserts presence; one manual open per shape is enough).
- Existing `.xlsx` files are byte-identical after the `workbook()` refactor.
- A two-sheet build is byte-identical across processes.
- `/shortcuts` and six family pages build in both editions, are sitemapped, are reachable within the
  reachability spec's three clicks, and pass axe with the tabs operated by keyboard.
- Interactive targets are ≥ 24×24 CSS px (WCAG 2.2 AA), asserted in the e2e spec, not eyeballed.
- The device banner appears on a coarse-pointer emulation, is dismissible, stays dismissed, and is
  absent with a fine pointer.

## Risks

| Risk | Mitigation |
|---|---|
| Multi-sheet refactor changes existing workbook bytes and breaks goldens | `spreadsheet()` is kept as a wrapper; an explicit byte-identity test over all existing workbooks is the refactor's gate |
| Solution tab leaks the answer in a way that undercuts the drill | It is a downloaded file, not on-page; the on-page reveal already behaves this way after three misses |
| Shortcut tables copied from a competitor | Author from Excel's own Help/`F1` list; the quality bar forbids copied content and this file is the obvious place to cheat |
| Platform key names drift between versions | The page says which version each row was checked against; unverified rows are marked, not guessed |
| A second content type for four pages is overkill | Six families justify it, and the loader is a variant of the existing one — if it needs more than that, the design is wrong |

## Non-goals

- A shortcut *curriculum* with progress gating; one lesson proves the machinery.
- Localisation of key names beyond Windows/macOS/Sheets.
- SheetJS or any spreadsheet library — the writer is already here and dependency-free.
- Downloading a `.xlsx` for pages with no grid.
- An account-gated download: the file is part of the page.

## Gate evidence

Every number below is from a run on the day this phase was closed, on `phase-0-port-shell`.

| Command | Result |
|---|---|
| `npm run content:shortcuts` | `6 families, 75 rows — 0 findings (0 blocking)`; every family answers on each tab it offers and ends on a real drill |
| `npm run content:check` | green over 89 lessons / 8 notes / 12 problem pages / 6 shortcut families; the variant, article, formula and shortcut rules all pass |
| `npm test` | 2,000 pass, 0 fail (296 suites), including `tests/shortcuts.test.js` (18 tests) and the updated `build` / `legal` / `metadata-routes` counts |
| `npm run build` + `node legacy/src/verify.mjs` | `built 143 pages` with `148 workbooks` and 8 client modules; `verified 89 lesson pages … 6305 checks passed`, which includes page/file agreement for every download |
| `legacy/dist/sitemap.xml` | 140 URLs, 7 of them `/shortcuts` (the hub plus six families) |
| `npm run next:build` / `npm run next:check` | `next routes: 142 prerendered pages match the shared templates` — the shortcut hub and all six families render byte-identically to the static build |
| `npm run budget` | B 68,243 B ≤ 70,000 B, D 138,714 B ≤ 150,000 B — the silo adds one small client module and no new dependency |
| `npx playwright test --project=chromium` | green, including `e2e/shortcuts.spec.js`: hub filter, tab swap, one canonical per tab, keyboard tabs, no empty Sheets tab, `No default` cells, practice CTA, axe on three URLs, the 24×24 sweep and the coarse-pointer banner with remembered dismissal |
| `npx playwright test e2e/reachability.spec.js` | green with the shortcut paths in `PUBLISHED_PATHS`: every sitemap URL is reachable in three clicks |
| `npx playwright test --project=static` | green, including `e2e-static/static-shortcuts.spec.js`: the shipped `legacy/dist` hub filters, and `/shortcuts/navigation` renders all columns with the Windows tab current and no console error |

## Deviations log

1. **One workbook per screen, not per lesson.** The plan reads as though each lesson would gain a file.
   A file per screen is what the download link and the Solution tab belong to, so `workbookUrl(slug,
   screenId)` stayed the naming authority: the build writes one file for every screen that has a sheet,
   and the page links the file for the screen it is showing. A screen with no grid — a picture or a
   shortcut screen — ships no file and grows no link.
2. **Workbook screens keep one tab.** The Exercise/Solution pair is only written when the screen has a
   reference formula. A screen whose answer is not a formula keeps a single visible sheet rather than a
   Solution tab that repeats the Exercise one.
3. **Both builds render the full table; the client moves the highlight.** `/shortcuts/[slug]` cannot read
   `searchParams` — that would make the route dynamic and break the byte-for-byte `<main>` comparison in
   `scripts/check-next-pages.mjs`. So every page ships all offered platform columns with `data-platform`
   on each cell, the client hides the rest, and only the canonical (via `page.path`) varies per tab. It
   also means the page is complete with no JavaScript and prints as one sheet.
4. **`No default` names the menu instead of inventing a chord.** Where Excel has no default binding the
   cell reads `No default` plus the menu path, rather than a plausible-looking chord nobody verified.
5. **Every family practises the same one lesson.** `shortcut-select-to-edge` is the only chord/sequence
   lesson in the catalog, so all six families link it. One lesson proves the machinery, as the plan
   asked; the alternatives were six lessons or six links to a lesson that does not grade chords.
6. **The canonical rewrite needed a head observer.** A one-shot rewrite during hydration left two
   `link[rel=canonical]` tags that disagreed, because React inserted its own after the script ran.
   `startCanonical()` now keeps exactly one canonical, syncs `og:url` to it and re-runs on a
   `MutationObserver` over `document.head`; it also strips the trailing slash the static server adds, so
   the canonical matches the sitemap path. Both bugs were found by the e2e spec, not by review.
7. **Each page carries `## Checked against`.** The plan left version drift to a risk-row mitigation; the
   section names the Excel build the chords were read off, so a stale row is visible on the page.
8. **The hub's search is client-only and progressive.** The field is hidden until the script un-hides it,
   so the hub is a plain list of six families with no JavaScript; the same shape phase 3's search uses.
