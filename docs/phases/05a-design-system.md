# Phase 5A — Design system ("Ledger")

**Purpose:** make the drill pages look like something a designer at a finance publication shipped,
not like a generated landing page. This phase produces the tokens, the component anatomy, and the
vendored asset list that phase 5 implements.

**Depends on:** phase 4 (page shell exists to style).
**Unblocks:** phase 5 (the UI is built from these parts).
**Rule:** no component in phase 5 may invent a colour, size, radius, or duration that is not in this
document. If something is missing, add it here first.

---

## 1. What "not AI slop" means

Five properties distinguish this from generated design. All five are checkable.

1. **Sourced typography.** A named typeface pair with a point of view, self-hosted, with a real
   display face — not `Inter`/`Geist`/system-ui everywhere.
2. **One hue at under 5% of the page.** Ink and paper do the work. Colour marks state, never decor.
3. **Editorial hierarchy.** Serif headline, byline, dated revision, prose measure. The page reads
   like a lesson, not like a feature grid.
4. **A real artifact above the fold.** The spreadsheet itself is the hero image. No illustration,
   no abstract shapes, no product screenshot of an invented dashboard.
5. **Hairline geometry.** 1px rules, 3–5px radii, one shadow. No glass, no glow, no 24px cards.

The rejected alternative was the dark "developer tool" look (Linear/Vercel/Resend clones). It reads
as a SaaS dashboard rather than a lesson, it dates quickly, and it undercuts the thing the page has
to sell: that these numbers are trustworthy. Paper, ink, and one green is a harder look to fake.

### The tells, and what replaces them

| Tell | Replacement |
|---|---|
| Indigo→violet gradient, gradient headline text | Flat paper `#f9f9f8`, ink `#21201c`, jade only for state |
| Everything is a 24px-radius card with a big soft shadow | Hairline `1px solid var(--line)`, `--r-1: 3px`, one 1px shadow |
| Centred hero, two CTAs, three feature cards | Left-aligned title block, one action, the sheet artifact immediately below |
| Emoji used as icons | Inline Phosphor SVGs at 16px, or no icon at all |
| Glassmorphism / backdrop blur / noise overlays | None. Opaque surfaces only |
| `Inter` + `tracking-tight` + `text-slate-500` | Newsreader display, IBM Plex Sans body, Plex Mono formulas |
| Skeleton screens and spinners | Payload is inlined in the HTML; there is no loading state to design |
| Toast for grading feedback | Inline feedback block with reserved height (zero layout shift) |
| Uppercase 11px labels on every block | Uppercase reserved for grid column headers and at most one eyebrow per page |
| Dark neon by default | Paper light theme is the default; dark theme is a real, equal theme |
| Uniform tile grid | Asymmetry: 68ch prose column, 260px sticky rail, sheet spanning wider than the text |
| "Supercharge your workflow" | "Find the customer whose order number starts with ORD" |

## 2. Reference shelf

Look at these for craft. Do not copy markup, and do not copy their brand.

| Source | Take | Ignore |
|---|---|---|
| Exercism exercise page (`exercism.org`) | Work at top, tests/results directly beneath it, instructions after | Its icon-heavy sidebar |
| Quadratic (`quadratichq.com`) | How A1 headers and selection can look current rather than Excel-2013 | Its dark-first palette |
| Rows (`rows.com`) | Tabular numerals, data cards with hairline borders | Marketing gradients |
| Grist (`grist.com`) | Spreadsheet-as-document framing | Its navy sidebar |
| Josh Comeau (`joshwcomeau.com`) | Progressive disclosure: hint → why → answer | Long intro animations |
| Frontend Masters course pages | Credibility block: byline, level, duration, updated date | Card carousels |
| Linear | Focus rings, 120–180ms easing, no bounce | Dark-only aesthetic |
| Stripe docs | Code block typography and inline code treatment | Gradient marketing pages |

## 3. Library budget

Everything below is vendored as a static file under `vendor/` and committed with its licence. No
runtime CDN, no bundler, no `npm install` (blocked in this environment). Sizes verified 2026-10-28.

### Accepted

| Asset | Version | Licence | Size | Role |
|---|---|---|---|---|
| `@radix-ui/colors` — `sand`, `jade`, `amber`, `red` + `-dark` | 3.0.0 | MIT | 8 × ~1.0 KB | Palette with 12-step semantics and P3 support |
| `open-props` — `sizes.min.css`, `easings.min.css`, `shadows.min.css` | 1.7.23 | MIT | 1.6 / 5.4 / 3.0 KB | Space and easing scale, one shadow |
| `@fontsource-variable/ibm-plex-sans` — latin wght | 5.3.0 | OFL-1.1 | 44.6 KB | UI and body |
| `@fontsource/ibm-plex-mono` — latin 400 / 500 | 5.3.0 | OFL-1.1 | 14.4 + 14.5 KB | Formulas, cell references |
| `@fontsource-variable/newsreader` — latin wght | 5.3.0 | OFL-1.1 | 56.7 KB | Headlines and ledes |
| `@phosphor-icons/core` — 4 SVGs only | 2.1.1 | MIT | ~1 KB | `check`, `arrow-right`, `lightbulb`, `lock` |

Total third-party payload: **≈ 150 KB, zero JavaScript.** That is the entire budget. Adding a runtime
library means removing something else from this table.

### Rejected, with receipts

| Candidate | Why not |
|---|---|
| `handsontable` 18.1.2 | npm licence field is `SEE LICENSE IN LICENSE.txt`; free tier is non-commercial only, package is 33.8 MB. Cannot ship in a paid product without buying it |
| `ag-grid-community` 36.2.0 | MIT, but 21.1 MB package, ~1 MB runtime, and it is an app data-grid: no A1 headers, no sheet feel — ten times the JS of the whole site for the wrong abstraction |
| `jspreadsheet-ce` 5.0.4 | MIT and genuinely good, but 165 KB min + `jsuites` 451 KB + 90 KB CSS ≈ 705 KB, and its default chrome is Excel 2013, which we would then spend a week overriding. Revisit only for an optional free-form sandbox after validation |
| `luckysheet` 2.1.13 | 29.5 MB, jQuery-era, unmaintained |
| `x-spreadsheet` 1.0.4 | MIT, 14.5k★, but canvas-rendered (no text selection, no screen-reader cells) and last pushed 2024 |
| `hyperformula` 3.5.0 | GPL-3.0-only — copyleft in a closed paid product. This is why phase 1 writes its own evaluator |
| `tailwindcss` / `shadcn/ui` | Not a licence problem; the default output *is* the look we are avoiding, and it would be re-styled anyway |
| `prismjs` | Unnecessary: `tokenize.js` already emits typed tokens, and those are what we colour |

## 4. Typography

| Role | Face | Weight | Size | Notes |
|---|---|---|---|---|
| Page title `h1` | Newsreader | 400 | `clamp(2.125rem, 3vw + 1.35rem, 3.25rem)` | lh 1.05, ls −0.022em, `text-wrap: balance`, `font-optical-sizing: auto` |
| Section `h2` | Newsreader | 500 | `clamp(1.5rem, 1vw + 1.25rem, 1.875rem)` | lh 1.15, ls −0.015em |
| Subsection `h3` | IBM Plex Sans | 600 | 1.1875–1.3125rem | lh 1.3 |
| Lede | IBM Plex Sans | 400 | 1.1875rem | lh 1.55, `sand-11`, max 58ch |
| Body | IBM Plex Sans | 400 | 1.0625rem | lh 1.65, max 68ch, `text-wrap: pretty` |
| UI / buttons | IBM Plex Sans | 500 | 0.9375rem | lh 1.2 |
| Meta, byline | IBM Plex Sans | 400 | 0.8125rem | `sand-11`, `font-variant-numeric: tabular-nums` |
| Formula, cell ref | IBM Plex Mono | 400 / 500 | 0.9375rem | No letter-spacing; `=` is part of the text |
| Grid header | IBM Plex Mono | 500 | 0.75rem | Uppercase, ls 0.04em, `sand-11` |
| Grid numbers | IBM Plex Sans | 400 | 0.875rem | `font-variant-numeric: tabular-nums lining-nums`, right-aligned |

Rules:

- Three families maximum. Never a fourth.
- Numbers that a reader compares must be tabular — in cells, in the byline, in progress counts.
- `text-wrap: balance` on `h1`/`h2`, `text-wrap: pretty` on paragraphs (both degrade silently).
- No letter-spaced uppercase outside grid headers and one page eyebrow.
- Line length: prose never exceeds 68ch; the drill card may be wider than the prose column.

## 5. Colour

Radix's 12-step scale is used semantically, not aesthetically: 1–2 page and card surfaces, 3–5
interactive fills, 6–8 borders, 9–10 solid accents, 11 low-contrast text, 12 high-contrast text.
Steps 11–12 are designed for text contrast, which is why the palette is not hand-picked; the only
exceptions are the two state inks below that needed a little more contrast than step 11 ships with,
and they are documented with their measured ratios.

```css
:root {
  color-scheme: light;

  /* surfaces — Radix sand */
  --bg: var(--sand-2);            /* #f9f9f8  page */
  --surface: var(--sand-1);       /* #fdfdfc  sheet card, raised */
  --surface-sunk: var(--sand-3);  /* #f1f0ef  rails, chips, code blocks */
  --line: var(--sand-6);          /* #dad9d6  hairlines */
  --line-strong: var(--sand-8);   /* #bcbbb5  inputs */
  --text: var(--sand-12);         /* #21201c  15.5:1 on --bg */
  --text-muted: var(--sand-11);   /* #63635e   5.7:1 on --bg */

  /* state — darkened Radix 11s so every pair clears 4.5:1 on its own tint */
  --ok: #20715a;      /* jade-11 +18% ink → 5.6:1 on --bg, 5.3:1 on --ok-bg */
  --ok-bg: var(--jade-3);
  --ok-line: var(--jade-7);
  --warn: #925805;    /* amber-11 +18% ink → 5.5:1 on --bg, 5.3:1 on --warn-bg */
  --warn-bg: var(--amber-3);
  --warn-line: var(--amber-7);
  --err: var(--red-11); /* #ce2c31 → 4.95:1 on --bg */
  --err-bg: var(--red-3);
  --err-line: var(--red-7);

  /* action — ink, not brand colour */
  --btn-bg: var(--sand-12);
  --btn-text: var(--sand-1);
  --focus: var(--jade-10); /* 3.36:1 on --bg — jade-8 only reaches 2.2:1 */

  /* type */
  --font-display: "Newsreader", "Iowan Old Style", Georgia, serif;
  --font-ui: "IBM Plex Sans", -apple-system, "Segoe UI", Roboto, sans-serif;
  --font-mono: "IBM Plex Mono", ui-monospace, "SFMono-Regular", Menlo, monospace;
  --fs-meta: 0.8125rem;
  --fs-ui: 0.9375rem;
  --fs-body: 1.0625rem;
  --fs-lede: 1.1875rem;
  --fs-h3: clamp(1.1875rem, 0.4vw + 1.09rem, 1.3125rem);
  --fs-h2: clamp(1.5rem, 1vw + 1.25rem, 1.875rem);
  --fs-h1: clamp(2.125rem, 3vw + 1.35rem, 3.25rem);

  /* geometry */
  --s-1: 4px;  --s-2: 8px;  --s-3: 12px; --s-4: 16px; --s-5: 24px;
  --s-6: 32px; --s-7: 48px; --s-8: 64px; --s-9: 96px;
  --r-1: 3px;  --r-2: 5px;
  --shadow-1: 0 1px 2px #21201c0f, 0 1px 3px -1px #21201c14;
  --dur-1: 120ms; --dur-2: 180ms;
  --ease: cubic-bezier(0.2, 0.7, 0.3, 1);
  --shell: 1080px; --prose: 68ch; --rail: 260px;
}

/* Radix redefines --sand-*, --jade-*, … under .dark, so surface aliases follow
   automatically. Only the three hand-tuned state inks need a dark pair. */
.dark {
  color-scheme: dark;
  --ok: var(--jade-11);   /* #1fd8a4 → 9.6:1 */
  --warn: var(--amber-11); /* #ffca16 → 11.5:1 */
  --err: var(--red-11);    /* #ff9592 → 8.4:1 */
}
```

Measured contrast (WCAG 2.1, computed from the shipped hex values):

| Pair | Light | Dark |
|---|---|---|
| text on page | 15.48:1 | 15.14:1 |
| muted on page | 5.73:1 | 8.39:1 |
| ok on ok-bg | 5.29:1 | 7.96:1 |
| warn on warn-bg | 5.34:1 | 10.26:1 |
| err on err-bg | 4.54:1 | 7.75:1 |
| button text on button | 16.02:1 | 16.26:1 |
| focus ring on page | 3.36:1 (meets the 3:1 non-text minimum) | 6.43:1 |

Colour rules: no gradients anywhere, including buttons and underlines. Green means success or
progress, never decoration. Amber only for hints. Red only for a rejected answer or a syntax error.
Links are ink with a jade underline, not jade text.

## 6. Geometry and layout

- Spacing scale in 4px steps (`--s-*`); no arbitrary margins.
- Radii: 3px on chips and cells, 5px on cards and inputs. Nothing above 5px. No pill buttons.
- Borders are always 1px. There is exactly one shadow in the system (`--shadow-1`), used only on the
  sheet card and the sticky rail.
- Shell: `max-width: var(--shell)`, page gutter 24px mobile / 32px desktop.
- ≥1024px: `grid-template-columns: minmax(0, 1fr) var(--rail)` with 64px gap. Prose column is
  `var(--prose)` inside the first track and left-aligned, not centred.
- The sheet card may exceed the prose measure up to 100% of its track.
- Vertical rhythm: 96px between major sections, 48px between subsections, 24px between blocks.

## 7. Component inventory

| Component | Anatomy | States |
|---|---|---|
| **Sheet card** | 1px border, `--r-2`, `--shadow-1`, header strip with dataset name + "read-only" note, grid | default, scrolled (sticky column headers) |
| **Grid** | Column headers A–E, row numbers 1–6, cells | data, blank, formula cell (corner marker), target cell, selected, correct, wrong |
| **Formula bar** | 44px tall, left ref chip (`B7`, 56px, `--surface-sunk`), `<input>` in mono | idle, focused, typing, disabled (gated), error (caret marker) |
| **Check button** | Ink fill, 36px, `--r-1`, label "Check" | default, hover (black), active (1px down), busy (label stays, no spinner) |
| **Hint disclosure** | Text link with chevron, not a button-looking button | collapsed, expanded (reveals `.hint`, amber left rule) |
| **Feedback block** | 3px left rule in state colour, headline 15px/500, body 15px muted, reserved min-height 84px | idle, correct, wrong-rule, syntax-error, exhausted (offers solution) |
| **Solution panel** | Mono formula with token colours, 2-sentence "why", note that it counts as completed-with-help | revealed |
| **Progress rail** | Sticky at top 24px: "3 of 10 complete", 2px track, 10 rows (number, title, tick) | default, mobile (collapses to inline progress bar above the sheet) |
| **Paywall panel** | Sits where the grid would be; `--surface-sunk`, heading, one sentence, email field, ink button, "no card required" | default, submitted, invalid email |
| **Byline block** | `By <name> · Updated 28 Oct 2026 · 10 drills · ~45 min` | — |
| **Lesson row** (index) | Number (mono), title, one-line outcome, state tick | open, gated, done |
| **Footer** | One line: what this is, how grading works, contact | — |

### Sheet card and grid

The grid is hand-built. A `<table>` is the correct element: it gives real row/column semantics, text
selection, and screen-reader navigation for free, in ~40 lines of CSS. A canvas library cannot.

```css
.sheet { background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-2);
         box-shadow: var(--shadow-1); overflow: auto; max-height: 60vh; }
.sheet table { border-collapse: separate; border-spacing: 0; width: max-content;
               font-variant-numeric: tabular-nums; }
.sheet th { background: var(--surface-sunk); color: var(--text-muted);
            font: 500 0.75rem/1 var(--font-mono); letter-spacing: 0.04em;
            text-transform: uppercase; height: 28px; }
.sheet thead th { position: sticky; top: 0; z-index: 2; }
.sheet tbody th { position: sticky; left: 0; z-index: 1; }
.sheet thead th:first-child { z-index: 3; }
.sheet th, .sheet td { border-right: 1px solid var(--line); border-bottom: 1px solid var(--line);
                       padding: 0 var(--s-3); }
.sheet td { position: relative; height: 32px; min-width: 104px; font-size: 0.875rem; }
.sheet td.num { text-align: right; }
.sheet td.formula::after { content: ""; position: absolute; top: 0; right: 0;
                           border: 5px solid transparent; border-top-color: var(--line-strong);
                           border-right-color: var(--line-strong); }
.sheet td[aria-selected="true"] { box-shadow: inset 0 0 0 2px var(--jade-9); }
```

`border-collapse: separate` with `border-spacing: 0` is deliberate: collapsed borders disappear on
sticky header cells in Safari, and every cell carrying only a right and bottom border still yields a
single 1px line between neighbours.

- Column headers: A…E only as wide as the data; row numbers start at 1.
- Blank cells stay blank — no `0`, no dash.
- Formula cells show the computed value plus the 5px corner marker; hovering is not required to
  understand the sheet.
- The target cell is the only cell with a focus ring and a `tabindex="0"`; everything else is
  `tabindex="-1"` and reachable with arrow keys.
- Correct answer: `--ok-bg` fill, `--ok` 2px inset ring, tick in the corner marker's place.

## 8. Motion

| Moment | Animation | Duration |
|---|---|---|
| Feedback appears | opacity 0→1, translateY 2px→0 | 120ms `--ease` |
| Hint expands | height auto via grid-template-rows 0fr→1fr | 180ms |
| Solution panel | opacity + 2px translate | 180ms |
| Cell accepts answer | background colour only | 120ms |

Nothing else moves. No scroll-triggered reveals, no hover lifts, no parallax, no springs. Under
`prefers-reduced-motion: reduce`, all durations become 0ms and transforms are removed — the state
change still happens.

## 9. Copy voice

- Second person, present tense, specific. Numbers instead of adjectives.
- Errors name the mistake and the fix in one sentence: "You added the cells one by one. The lesson is
  about the SUM function — try `=SUM(B2:B4)`." Never "Incorrect".
- No exclamation marks, no "Great job!", no emoji, no "Oops".
- No invented claims: no ratings, no "trusted by", no learner counts, no fake durations.

| Bad | Good |
|---|---|
| "Incorrect. Try again!" | "You referenced B2:B3. The range stops one row short of B4." |
| "Unlock your full potential" | "Lessons 6–10 cover lookups, rounding, and text splitting." |
| "Master Excel in 5 minutes" | "Ten drills, about 45 minutes, no spreadsheet required." |

## 10. Vendoring procedure

```bash
mkdir -p vendor/{radix,open-props,fonts,icons,licenses}

# palette
for c in sand sand-dark jade jade-dark amber amber-dark red red-dark; do
  curl -fsSL "https://cdn.jsdelivr.net/npm/@radix-ui/colors@3.0.0/$c.css" -o "vendor/radix/$c.css"
done

# space, easing, shadow
for f in sizes easings shadows; do
  curl -fsSL "https://cdn.jsdelivr.net/npm/open-props@1.7.23/$f.min.css" -o "vendor/open-props/$f.min.css"
done

# fonts (latin subsets only)
curl -fsSL "https://cdn.jsdelivr.net/npm/@fontsource-variable/ibm-plex-sans@5.3.0/files/ibm-plex-sans-latin-wght-normal.woff2" -o vendor/fonts/plex-sans-latin.woff2
curl -fsSL "https://cdn.jsdelivr.net/npm/@fontsource-variable/newsreader@5.3.0/files/newsreader-latin-wght-normal.woff2" -o vendor/fonts/newsreader-latin.woff2
curl -fsSL "https://cdn.jsdelivr.net/npm/@fontsource/ibm-plex-mono@5.3.0/files/ibm-plex-mono-latin-400-normal.woff2" -o vendor/fonts/plex-mono-400.woff2
curl -fsSL "https://cdn.jsdelivr.net/npm/@fontsource/ibm-plex-mono@5.3.0/files/ibm-plex-mono-latin-500-normal.woff2" -o vendor/fonts/plex-mono-500.woff2

# icons: four files, inlined into the HTML at build time, never a runtime font
base="https://cdn.jsdelivr.net/npm/@phosphor-icons/core@2.1.1/assets/regular"
for i in check arrow-right lightbulb lock; do curl -fsSL "$base/$i.svg" -o "vendor/icons/$i.svg"; done

# licences travel with the assets
curl -fsSL "https://cdn.jsdelivr.net/npm/@phosphor-icons/core@2.1.1/LICENSE" -o vendor/licenses/phosphor-MIT.txt
curl -fsSL "https://cdn.jsdelivr.net/npm/@fontsource/ibm-plex-mono@5.3.0/LICENSE" -o vendor/licenses/ibm-plex-OFL.txt
curl -fsSL "https://cdn.jsdelivr.net/npm/open-props@1.7.23/LICENSE" -o vendor/licenses/open-props-MIT.txt
# radix colours and newsreader: copy LICENSE from their packages the same way
```

`vendor/manifest.json` records every file with `url`, `sha256`, `licence`, and `added` date.
`src/verify.mjs` recomputes the hashes and fails on drift. This is what makes a vendored dependency
auditable instead of a mysterious blob.

Build rules:

- `build.mjs` concatenates, in order: `vendor/radix/*.css`, `vendor/open-props/*.css`,
  `src/styles/tokens.css`, `src/styles/base.css`, `src/styles/components.css` → one
  `dist/assets/styles.css`. No `@import` in the output (no request waterfall).
- `@font-face` with `font-display: swap`, `font-weight: 100 900` for the variable faces, and
  `src: url(/assets/fonts/…) format("woff2")`. Preload exactly two files: Plex Sans and Newsreader.
- Icons are inlined as `<svg>` at build time; there is no icon font and no icon JS.
- Nothing loads from a third-party origin at runtime, ever.

## 11. Acceptance criteria (the visual gate)

1. Screenshot the lesson page, desaturate it: the hierarchy still reads (serif title, hairline sheet,
   ink button). If it collapses to mush, the design depends on colour — redo it.
2. 320px wide: no horizontal page scroll; the sheet scrolls inside its own card.
3. 200% browser zoom: no overlap, no clipped formula bar, prose still ≤68ch.
4. Block all font requests: the page stays readable and the layout does not shift more than 4px.
5. `prefers-reduced-motion: reduce`: nothing animates.
6. CLS 0 on load, including when feedback appears (reserved min-height).
7. Tab through: focus is always visible (2px jade ring, 2px offset); the formula bar is reachable in
   ≤3 tabs from page top.
8. Every state colour appears only in its defined role (grep the CSS for `--ok`, `--warn`, `--err`).
9. No third-party requests in DevTools; `vendor/manifest.json` hashes match.
10. Lighthouse on a lesson page: performance ≥95, accessibility 100, no contrast failures.
11. No text under 13px except grid headers; no uppercase outside headers and one eyebrow.
12. Read the copy aloud: zero exclamation marks, zero emoji, zero invented statistics.

## 12. Anti-goals

Dark neon SaaS aesthetic, mascots, illustration, icon grids, testimonial sections, gradient CTAs,
pricing tables with a highlighted middle column, confetti on completion, "AI-powered" anything in the
UI, and animation that exists to be noticed.

## 13. What was built

`src/styles/tokens.css` (Radix sand/grass scales + Open Props type ramp, light-first with `.dark`
overrides for `--ok/--warn/--err`), `src/styles/base.css` (reset, prose, focus-visible ring), and
`src/styles/components.css` (page header, lesson rail, sheet card, grid, formula bar, verdict, hint,
paywall sheet, index rows). The three files are concatenated in that order after the two vendored
stylesheet layers.

`tests/styles.test.js` (16 tests) enforces the invariants mechanically, so the design system cannot
drift silently: no raw colour literals outside `tokens.css`, no gradients, the only non-inset
`box-shadow` is `var(--shadow-1)`, radii ≤ 5px, `!important` allowed only on `[hidden]`, 12px allowed
only in the two grid-header rules, every `var()` resolves, and the stylesheet source order is
`radix → open-props → tokens → base → components`.

Verified in a real browser (Chrome, via the automated browser probe): CLS 0.0022 on a lesson page,
FCP/LCP 124 ms, zero third-party origins, four local font faces, reduced-motion honoured
(`scroll-behavior: auto`, transitions `0s`), no horizontal page scroll at 1440 or 320, one
accessibility violation count of zero from axe-core on the lesson, index and paywall pages, and a
2px jade focus ring with 2px offset on the answer cell.

### Known caveats

- The `@font-face` variable-axis ranges (`100 900` for Plex Sans, `200 800` for Newsreader) come from
  the vendor filenames and the licence notes, not from reading each woff2 `fvar` table. If a weight
  ever renders as a synth-bold, read the axis range out of the file and correct it here.
- The grid keeps `font-variant-numeric: tabular-nums lining-nums` rather than a monospace family:
  digits align in columns without the width penalty of a second text face.
- The tenth funnel event (`drill_exhausted`) is documented in
  [05-drill-ui-and-funnel.md](05-drill-ui-and-funnel.md), not in §10 of this document.
