# Phase 5 — Drill UI and funnel

**Purpose:** make the page feel like a tool, not a quiz, and instrument the three funnel steps the
business depends on: start → finish → paywall intent.

**Depends on:** phases 1 and 4.
**Unblocks:** phase 6.

## Deliverables

| File | Responsibility |
|---|---|
| `src/client/drill.js` | mounts the drill from `#exercise-data`, grid, formula bar, check flow, progress, paywall |
| `src/styles/tokens.css` | the semantic tokens from 5A §5 — the only file allowed to contain raw values |
| `src/styles/base.css` | reset, type scale, links, focus ring, reduced motion, prose measure |
| `src/styles/components.css` | sheet card, grid, formula bar, feedback, rail, paywall, pager |
| `src/vendor-check.mjs` | recompute `vendor/manifest.json` hashes; called by `src/verify.mjs` |
| `vendor/**` | pinned fonts, palette, icon SVGs from 5A §10 |

## Interaction spec

**Grid**
- Markup: a real `<table>` with `<th scope="col">` for A–E and `<th scope="row">` for 1–6, wrapped in
  `.sheet` (see 5A §7 for the exact CSS). Build it as a table, then add grid semantics on top:
  `role="grid"`, `role="row"`, `role="gridcell"`, `aria-rowcount`/`aria-colcount`, and a roving
  `tabindex` so arrow keys move the selection and `Home`/`End` jump to the row edges.
- Data cells are visible but not editable; the answer cell is the only editable one and is focused
  on load when it is above the fold.
- Clicking a data cell selects it, shows its value in the bar as read-only, and never opens an inline
  editor. Editing happens in one place, the formula bar — that is what keeps mobile usable.
- Row/column headers highlight for the selected cell using `--surface-sunk` and `--text`; the target
  cell carries the only 2px inset ring (`--jade-9`).

**Input**
- Typing in the formula bar updates a draft; `Enter` checks it; `Escape` restores the cell value.
- Paste of a leading `=` is normalised (trim, strip zero-width characters) before grading.
- A `<textarea>`-free single-line input keeps mobile keyboards sane.

**Feedback**
- Success: jade fill and 2px inset ring on the cell, value written into the grid, streak increments,
  primary CTA becomes "Next lesson".
- Failure: the rule message appears under the bar with the caret position when it is a syntax error;
  the specific hint replaces generic copy; attempts counter increments.
- After 3 failures, "Show me the answer" reveals the reference formula and marks the lesson as
  "completed with help" (still counts for progress, not for the certificate placeholder).

**Funnel and gating**
- Lessons 1–5: open. Lessons 6–10: if no local trial, the drill is replaced by a paywall card —
  free text explaining what the full track adds, an email field, and "Start free trial".
- Submitting the email records `paywall_email` and sets `es.trial = { startedAt }` for 7 days.
- Progress lives in `localStorage` under `es.progress` and survives reload; the index page reads the
  same key and renders the progress bar.

**Events** (pushed to `window.__esEvents` and `console.debug`, so PostHog can be attached later
without touching the drill):

`drill_view`, `drill_start` (first keystroke), `drill_check`, `drill_hint`, `drill_solution`,
`drill_complete`, `paywall_view`, `paywall_email`, `trial_start`.

## Visual contract

Everything visual is specified in [05a-design-system.md](05a-design-system.md) — tokens, type scale,
component anatomy, grid CSS, motion, copy voice, and the vendoring procedure. Phase 5 implements it;
it does not redesign it. The non-negotiables:

- Type: Newsreader for `h1`/`h2`, IBM Plex Sans for UI and prose, IBM Plex Mono for formulas and cell
  references. No fourth family, no system-ui as the primary face.
- Colour: paper `--bg`, ink `--text`, ink-filled primary button, jade for success and progress, amber
  for hints, red for rejections. Three hues total, under 5% of the page, no gradients.
- Geometry: 1px hairlines, 3–5px radii, one shadow, 4px spacing steps. No card hover lift, no glass.
- The sheet is the artwork: hairline grid, tabular numerals, right-aligned numbers, corner marker on
  formula cells, selected-cell ring. This is the thing that must look like a real tool.
- Feedback is inline with reserved height, never a toast or a modal. Copy names the mistake and the
  fix in one sentence; "Incorrect" is banned (5A §9).
- Motion: only the four transitions in 5A §8, 120–180ms, `--ease`, all disabled under
  `prefers-reduced-motion`.
- Focus is always visible (2px `--focus` ring, 2px offset) and never removed.

Do not ship a page whose only styling is browser defaults plus a font swap — that reads as unfinished,
and it is the failure mode this phase exists to prevent.

## Responsive

- Desktop (≥1024px): two tracks — main column plus a 260px sticky progress rail at `top: 24px`.
  Drill card sits directly under the byline and is capped at ~60vh before the docs begin.
- Tablet (768–1023px): rail collapses to an inline progress bar above the sheet card.
- Mobile (≤767px): grid scrolls horizontally inside its own card (never the page); the formula bar
  and Check button stick to the bottom of the viewport while the sheet is in view, so the answer is
  reachable with a thumb without scrolling back up.

## Work breakdown

0. Vendor the assets exactly as in 5A §10, write `vendor/manifest.json`, and wire the CSS
   concatenation into `build.mjs`. Then write `tokens.css` → `base.css` → `components.css` in that
   order; do not write a component style before its tokens exist.
1. `readPayload()` — parse the JSON script tag, guard against missing data.
2. `renderGrid(exercise, selectedCell)` — build the table, lock data cells, handle click/arrow keys.
3. `commit(value)` → `grade()` from the shared grader module (same file the tests exercise).
4. `renderOutcome(result)` — message, hint, attempts, solution reveal.
5. `progress` module — load/save/streak, `completed` set, `trial` state.
6. `paywall` module — gate check by lesson index against `track.freeLessonCount`.
7. Instrument the events; no third-party script required to demo the funnel.

## Acceptance criteria

- Lesson 1: `=SUM(B2:B4)` passes; `=B2+B3+B4` fails with the SUM hint; `=SUM(B2:B3)` fails with the
  range hint; `=sum(` fails with a syntax caret message.
- Lesson 7: `=VLOOKUP("E-104",A2:C6,3)` fails with the exact-match hint.
- Lesson 6 opens the paywall; an email unlocks the trial and the drill for 7 days.
- Reloading keeps completed lessons and the trial; clearing `localStorage` resets cleanly.
- Keyboard-only run of lesson 1 is possible end to end.
- No layout shift when the hint appears (reserve space under the bar).
- The 5A §11 visual gate passes: desaturated screenshot keeps its hierarchy, 320px has no page
  scroll, 200% zoom does not overlap, blocked fonts stay readable, reduced motion is static,
  focus is visible on every interactive element, and no feedback string says "Incorrect".
- `vendor/manifest.json` hashes match on disk and `dist/assets/styles.css` is a single file.

## Risks and traps

- **Grading logic duplicated in the client.** Import `../grader/index.js`; never re-implement
  comparison in `drill.js`.
- **localStorage as a source of truth for money.** It is fine for a fake door; it must be replaced by
  server entitlements the moment Stripe exists (phase 7).
- **Autofocus stealing scroll** on long pages — only focus the answer cell when the drill is in view.
- **Disabled inputs on wrong answers.** Never disable the input; let the learner retry immediately.
- **`innerHTML` for anything that came out of the grader.** `grade()` echoes the learner's own input
  into `message` (`formatValue` of a string argument), so `=<img src=x onerror=alert(1)>` returns a
  message containing live markup. Write messages, hints, and the expected value with
  `textContent`/`createTextNode`, or a small `el(tag, props, children)` helper that only assigns
  `textContent`. The same applies to exercise text loaded from JSON if it ever moves to a CMS.
- **A thrown `FormulaError` reaching the keystroke handler.** `grade()` is contractually throw-free
  for learner input (invariant D in phase 3), but the drill should still wrap the call in `try/catch`
  and render a generic "that formula stopped the checker" outcome — cheap insurance, not a substitute
  for the invariant.

## Out of scope

Real auth, real payments, team seats, leaderboards, certificates beyond a placeholder, AI hints,
Excel keyboard shortcuts (browser key capture is a separate, Chromium-limited feature).

## What was built

- `src/client/state.js` — pure, DOM-free state: gating (`isGated`), progress/attempts storage with
  corrupt-value tolerance, formula normalisation, and `caretLine()`.
- `src/client/drill.js` — the browser module: mounts against the SSR markup, imports `grade` from
  `../grader/index.js` (no duplicated grading), renders feedback with `textContent`, handles hints,
  the three-miss reveal, keyboard shortcuts, grid navigation, the paywall sheet and the event buffer.
- `src/vendor-check.mjs` + `npm run vendor:check` — re-hashes every file listed in
  `vendor/manifest.json` and reports byte, digest, URL and licence drift.
- `tests/client.test.js` (32), `tests/vendor.test.js` (8), `tests/styles.test.js` (16), and the
  client-asset assertions inside `tests/build.test.js`.

Total suite: **248 tests**.

### Deviations from the plan above, and why

| Plan | Built | Reason |
|---|---|---|
| Client re-renders the grid | Grid stays server-rendered; the client only marks the answer cell | Progressive enhancement, no layout shift, one source of truth for markup |
| Success CTA button | `.next-cta` link to the next lesson | It is navigation; a button that navigates needs script to work |
| Separate tablet progress bar | The rail doubles as the progress bar via `order: -1` | One element, no duplicate state |
| Streak counter | Omitted | Nothing honest to count until there are sessions |
| Sticky formula bar on phones | Not implemented; the sheet body scrolls inside a `60vh` box and `keepVerdictInView()` scrolls the page to the verdict | `.sheet-card` clips its corners (`overflow: hidden`), which makes sticky children impossible; `overflow: clip` fixes sticky but stops `scrollIntoView` reaching descendants. The bar sits directly under the grid, so it needs no pinning. |
| Nine funnel events | Ten, adding `drill_exhausted` (all three attempts used, then reveal shown) | The reveal and the exhaustion are different signals for the metrics |

### Defects found by the browser verification pass

1. **Caret offset.** `grade()` reports `position` against the string with a leading `=` stripped, so
   every blamed token was underlined one character to the left. `caretLine()` now adds a one-character
   lead offset, clamped to the input length, and a contract test pins it against the real grader
   (`=SUM(B2:B4))` → column 11, `=SUM(` → 1, `=1+` → 3).
2. **Email in the event buffer.** `paywall_email` carried the raw address into `window.__esEvents`,
   contradicting the form's promise that nothing is sent anywhere. It now emits `{ id }` only, and a
   source-level test forbids `email`/`input.value` in that call.
3. **Escape died after a click.** The keydown listener was on the input, so it stopped firing once
   Check moved focus. It is bound to `#formula-bar` instead.
4. **Wrong retry erased a solved cell.** `markTarget("wrong")` stripped `cell-correct`, so Escape
   restored an empty string on an already-solved lesson. `markTarget` now returns early when the drill
   is solved, and Escape/`selectCell` read the `solved` flag instead of the class list.

### Defects found by the second review pass

A stricter read of `drill.js` found the bar/Check state machine leaking a *gradable* state while the
input was read-only. All five items below are fixed and covered by `tests/client.test.js`.

1. **Check graded a value the learner could not edit.** Selecting a data cell disables `#formula` but
   left `#check` enabled, so Check submitted whatever the read-only field held (the cell's value,
   `1200`) → "Not accepted", and burned one of the three attempts. `selectCell` now mirrors the disable
   state onto `#check`, and `check()` early-returns unless the new pure predicate
   `canGrade({ selected, answerCell, disabled })` holds — so a programmatic submit cannot grade either.
2. **A solved lesson showed the answer's value in the bar.** The bar was seeded with
   `display(payload.expect.value)` (`3580`), so reloading a solved lesson and pressing Check reported a
   correct lesson as wrong and burned another attempt. A new `barText()` helper returns the reference
   *formula* (and an empty string when unsolved) and is the only thing written to the bar.
3. **The reveal button vanished after a reload.** `#show-answer` was restored only inside `onWrong`, so
   a learner who had already used all three attempts had to miss a fourth time to see the answer again.
   Mount now unhides it when `attemptsFor(...) >= MAX_ATTEMPTS`. The server still ships it `hidden`, so
   the no-JS page is unchanged.
4. **`drill_exhausted` fired on every attempt past the limit.** The guard was `attempts >= MAX_ATTEMPTS`,
   which re-fires on attempts 4, 5, …; it is now `=== MAX_ATTEMPTS`, so one lesson emits one exhaustion.
5. **Success copy reused the failure label.** `attemptLabel()` counted the just-recorded completion, so a
   one-miss solve read "2 attempts. The reference answer is available below." A separate
   `successLabel(missed)` takes the wrong-attempt count captured *before* `registerCompletion` and says
   "Solved on the first attempt." or "Solved after N wrong attempts."

Two smaller cleanups came with them: `vendor-check.mjs` now guards each byte/sha comparison with
`typeof`, so a manifest entry missing one field reports one problem instead of a cascade, and the
dead `export { … }` block plus two now-unused imports were removed from `drill.js`.

**Known limitation.** A lesson solved on the second try records `tries: 1`, because `registerCompletion`
stores `Math.max(previous, attempts) || 1` and a first-try solve must also record one attempt. The
persisted record therefore cannot distinguish "solved first try" from "solved after one miss"; the
success copy avoids the problem by taking the pre-completion count, and nothing in the UI reads the
stored value. `drill_complete.attempts` in the event buffer inherits the same conflation.
