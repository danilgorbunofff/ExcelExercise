# Phase 2 — Exercise engine parity


> Part of the [reference-parity plan](00-overview.md). This file is self-contained:
> scope, work breakdown, acceptance criteria, tests and risks for this phase only.

**Duration:** 2.5–3 weeks · **Depends on:** phases 0, 1 · **Blocks:** phases 3, 7, 8

---

## Status

**Landed — the engine, the first multi-screen player, every screen type, the help a miss earns, and a
keyboard route through all of it.** Items 1–12 ship: the loop and the event sink as a tested package
(`packages/session`, `docs/player-contract.md`), screen dispatch, a `formula` player, a `picture` player,
the chord/sequence keyboard player, a `workbook` player, the hint vocabulary, reveal threshold and
per-screen notes, and the accessibility pass, proven end to end by `16-xlookup-search-from-the-bottom` —
the first lesson with three screens, the last of them a picture. Every screen type now ships: chord and
sequence on lesson 03 (2026-10-29), a workbook on the capstone `10-capstone-margin` (same day), each one
graded by `tests/content.test.js`, `e2e/drill.spec.js` and the accessibility scan. The seven-screen
all-five-types lesson built from a temp content root stays as the coexistence proof. The clock is read but
not enforced.

- [x] **11. Events.** `packages/session/events.js` owns the vocabulary (17 names, the phase-10 list) and a
      `createSink({ write, context, now })` with a flat-primitive schema, `type`/`ts` written last and a
      500-event cap. The drill now emits through it instead of its own `track()`, and its `drill_*` names
      were renamed to the canonical ones — `drill_check` split into `check_correct`/`check_wrong`, since a
      failed check is the funnel step and a check is not. The package ships at `dist/assets/session/` the
      same way the grader ships, so the client imports the source rather than a bundle.
- [x] **8. Score loop.** `score.js`: `createSession` / `recordVerdict` / `emitAll` with configurable
      `{ correct, incorrect, cap }`, `incorrect` bounded to `[-100, 0]`, and recycling from `recycleFrom`
      (default screen 4) clamped into the lesson. Termination is a construction-time invariant —
      `correct >= 1` and a finite cap are validated, so the zero-weight "recycles forever" bug cannot be
      built. A verdict after completion returns the unchanged session and no events.
- [x] **9. Timers (the clock half).** `clock.js`: wall-clock session budget (default 60 min), idempotent
      `pause`/`resume` for `visibilitychange`, backwards clock steps clamped to zero. The player mounts
      one clock, pauses it while `document.hidden` and resumes on `visibilitychange`, and stamps
      `elapsed` (whole seconds on task) on the working events, so the funnel sees time spent practicing
      rather than time the tab sat open — and each screen keeps its own tally, stamped on the events that
      screen produces and restarted every time it is entered, so the funnel can say which screen cost the
      time rather than only how long the lesson took. The budget is deliberately not enforced — a
      wall-clock stop would throw away a local learner's unfinished lesson.
- [x] **2. Formula screen (multi-screen).** The lesson page server-renders every screen into
      `#drill-screens` and the client advances by toggling `hidden`. The section, one drill per screen,
      is the same graded object: `createSession` → `recordVerdict` → `emitAll`. Screens carry their own
      `answerCell`, `expect`, `rules`, `fixtures` and `reference`, and a multi-screen lesson must give
      each screen its own reference — `packages/content-lint` fails the copy that would reveal the same
      formula twice. The grid both halves read is `packages/sheet`: `gridModel({ grid, answerCell })`
      resolves every address once from `startCell`, so the template that paints the cells and the
      keyboard handler that moves across them cannot disagree about which cells exist, and
      `moveSelection` answers for an arrow, Home or End — `null` at the edge rather than a wrap onto a
      cell the page did not draw. Recorded deviation: the markup renderer stayed in
      `legacy/src/site/sheet.mjs`. It needs the site's escaping and number formatting, and moving it
      would rewrite golden-pinned bytes without buying a second consumer.
- [x] **1. Screen router.** `type` picks the panel at build time — `renderScreens` in
      `legacy/src/site/exercise-page.mjs` writes a `<div class="sheet">` for a formula and a
      `<div class="picture-body">` for a picture — and picks the grader at runtime: `gradeScreen` in
      `legacy/src/client/drill.js` sends a picture to `gradeAnswer` and everything else to `grade`. Both
      dispatches are a two-way switch on purpose; a registry would need something to register, and the
      plan's component contract (`{ screen, grid, onSubmit, onHelp, state }`) arrives with the third type,
      when its shape is known from two implementations rather than guessed from none.
- [x] **6. Picture screen.** Image, prompt, one bar, accepted answers from content. First-party SVG at
      `legacy/content/images/xlookup-third-argument.svg`, copied by the build to `assets/img/`. Graded by
      `gradeAnswer` (`packages/grader/answers.js`): case, spacing, `$` and a leading `=` folded, the first
      answer is the reference, and a miss never echoes it. The bar renders with no target chip and
      `aria-label="Your answer"`, and the note under the sheet says "the bar" instead of naming a cell.
      A picture screen without `hints.value` warns in the gate (item 10 gives the formula path a
      stricter rule — an unknown hint key is an error there, since only a formula screen has rules to key
      on). **Zoom is
      deferred** — the plan asked for it, but the pilot image is a 640 px vector that is legible at 100 %
      on a 375 px viewport, so a zoom control would be a button with nothing to reveal until a raster
      screenshot forces one. The `alt` text is required and carries the whole image, so the screen is
      solvable without seeing it.
- [x] **3, 4, 5.** Chord and sequence screens, with capability detection and a fallback. The key model is
      `packages/keys` — `parseChord`/`parsePress`, `labelsOf`/`chordText`, `matchesEvent`, `matchesTyped`
      (`matchesTypedSteps`), `isReserved` — so the template, the client and the gate cannot disagree about
      what `Ctrl+Shift+L` means. `renderKeys` draws the presses as `kbd` caps and the panel takes the
      focus, because a press only reaches the document while a field does not have it; `paintKeys`
      re-labels every cap for the platform, so a Mac reads `⌘⇧L` from the same content. Grading is
      `matchesEvent` for a press and `matchesTyped` for the bar, and only a *deliberate* press spends an
      attempt (the first of a sequence, one with a modifier, or a named key), so a plain letter on its way
      to the bar does not burn one. A missed step restarts the sequence; `Escape` restarts it for free;
      a held key does not grade the screen it just advanced to; a non-Latin layout falls back to
      `event.code`. Two decisions did not follow the plan, deliberately: the fallback is the formula bar
      rather than a multiple-choice panel — the bar already exists, it grades the same list, and a
      generated distractor set is content nobody authored — and no `chord_fallback` event is emitted,
      since the bar is not a mode the learner switches into. Nothing is *blocked* on either.
      **No shortcuts group exists yet**: `track.json` has none, because the reference's 13 shortcut
      lessons are phase-9B scope. Two shortcut screens do ship, on lesson 03 (2026-10-29), so the server
      half is proven against real content as well as by `tests/keys-page.test.js` from a temp copy.
- [x] **7. Workbook screen.** The screen ships rows, not a file: `sheet: { name, startCell, rows }` is the
      single source, and the build writes the `.xlsx` from it with `legacy/src/xlsx.mjs` — a dependency-free
      ZIP of the six parts Excel reads, deterministic byte for byte, `fullCalcOnLoad` set because nothing
      caches a value. That keeps the download and the preview from drifting, and it means no binary is
      committed to review. The generated file has no `Content-Disposition` to set: it is a static asset
      under `/assets/files/`, linked with `download` so the browser saves it instead of opening it, and the
      preview is the same rows rendered by `renderDataGrid` into a plain table — no iframe, no third party,
      no fetch, so it works offline. Those rows are first passed through `legacy/src/site/preview.mjs`,
      which evaluates every `=`-prefixed cell with the grader's own evaluator and settles
      formula-to-formula chains over repeated passes, so the preview prints `44.8` where the file opens on
      `44.8` rather than the `IFERROR(ROUND(SUMIF(…` that produced it; the panel then names the formulas it
      computed, so the value does not hide how it was made. Formula screens keep raw authored rows:
      `renderSheet` does not call it. The preview is deliberately *not* `role="grid"`: the drill's delegated
      click and keydown handlers would treat a preview cell as selectable, disable the bar and fill it with
      a cell's text, so `renderDataGrid` takes an `interactive` option and the preview passes `false`.
      Graded by `gradeAnswer`, exactly like a picture: `answers` is the whole grade and the first is the
      reveal. `sheet` is rejected on any other screen type by `packages/content/schema.js` rather than
      dropped, so an author who writes one always sees the file. Proved by `tests/xlsx.test.js` (the ZIP
      parts, cell XML, determinism, name sanitisation), `tests/workbook-page.test.js` (the rendered page,
      payload and non-interactive preview) and `tests/workbook-build.test.js` (a build from a temp content
      copy: one file per screen, the link on the page, `verify()` clean, and two screens whose ids collapse
      to one file name throwing instead of one silently winning).

- [x] **10. Hints and help.** Three surfaces, each with one owner. The *hint* is the grader's: `hintFor` in
      `packages/grader/grade.js` answers with the failing rule's own line, then its alias (`require-ref` →
      `requireRef`, `matchType` → `match`), then the screen's `hints.value`, and `outcome` attaches it to the
      verdict — so the player only displays `result.hint` and cannot drift from the grader about which
      failure the learner is looking at. The client keeps `hints.value` as its own fallback for a rule the
      grader says nothing about, because an empty panel under a wrong answer is worse than a general
      nudge. The *reveal* threshold moved into content: `showAnswerAfter` in `track.json`, normalised by
      `packages/content/schema.js` to an integer 1–10, carried in the drill payload with the track, and read
      by the client as `revealAfter` — the `MAX_ATTEMPTS` constant it replaced is gone. **Default is 3, not
      the plan's 1**, deliberately: one miss would hand over the answer, and the reveal exists for a
      learner who is stuck, not for the first typo. The *notes* are the screen's: an optional `docs` block
      (`syntax`, `explain`, `reference`, capped at 120/400/200 characters) rendered by `renderScreenDocs`
      inside the screen's own panel, so an explanation of a formula shape sits next to the sheet it
      describes. Recorded deviation: the plan asked for a docs *drawer*; the drawer is one lesson-wide
      block (`#docs`, unchanged), and putting a second body of text behind a toggle inside a three-screen
      lesson hides the one thing the screen is teaching. The schema range-checks the block rather than only
      rendering it — this is what caught two real content bugs: hint keys the corpus never wrote (a
      `hints.<key>` must name a failure the screen can actually report: `value`, `syntax`, `error`, the
      lesson's own rule ids, and `require-ref` only when the screen pins a cell with `requireRef`), and a
      stale syntax hint on lesson 16's second screen that rebuilt the first screen's formula. The golden
      snapshot moved by exactly that one line. Proven by `tests/grader.test.js` (the hint precedence chain),
      `tests/schema-v2.test.js` (the hint vocabulary, the notes block, a v1 screen never gaining `docs`),
      `tests/track-schema.test.js` (the threshold's default and its rejections), `tests/screen-docs.test.js`
      (the notes render in the right panel, hidden with it, once, and never leak into the drawer or the
      payload) and `tests/client.test.js` (the player reads the threshold from the track and falls back to
      `hints.value`).

Every acceptance criterion below is closed but the manual browser matrix. "A lesson with several screens
terminates at 100" passes in `tests/client.test.js` and again in `e2e/drill.spec.js`, which walks lesson
16's three screens in a browser, grades a near miss on the picture screen and completes on typed text.
The five-type lesson is `tests/five-types.test.js`, and the reserved-shortcut fallback is the last block
of `tests/keys.test.js`. The matrix is waiting on content rather than on code.

---

## Objective

Reproduce the reference's learner loop — five screen types, score-to-100 progression with screen
recycling, hints and solutions, a real grid, and workbook exercises — on top of our grader, in our
design system, with accessibility and browser-resilience the reference does not have.

## Scope

- Screen player for `formula`, `chord`, `sequence`, `picture`, `workbook`.
- Score loop: correct/incorrect scoring to 100, recycling from screen 4, per-screen and session
  timers.
- `packages/sheet`: grid rendering, selection, keyboard navigation, formula bar, highlight ranges,
  active cell, postcondition swap, result write-back.
- Hint, show-answer and docs panels wired to our authored hint codes.
- Capability detection + fallback for keyboard chords; mobile helper bar.
- Workbook screens: first-party `.xlsx` download + read-only preview.
- Attempt→feedback state machine with no double-grading.

## Out of scope

- Points, streaks, leaderboards (phase 5).
- Persisting attempts server-side (phase 4) — phase 2 emits events, phase 4 stores them.
- Shortcut *curriculum* (13 lessons) — the mechanics land here, the lessons land with phase 1 content.
- SQL player (phase 8).

## Work breakdown

1. **Screen router.** `components/player/Screen.jsx` switches on `type`; each type is a component
   with the same contract: `{ screen, grid, onSubmit, onHelp, state }`.
2. **Formula screen.** Grid + formula bar; Enter and the Check button both submit; grader verdict
   drives the feedback panel (message, position, caret); on success, write the computed value into
   the result cell and advance.
3. **Chord screen.** Key model:
   - normalise `Control`/`Ctrl`, `Meta`, `Shift`, `Alt`, left/right variants;
   - prefer `event.code` for layout independence, fall back to `event.key`/`which`;
   - ignore `event.isTrusted === false`, ignore auto-repeat, `preventDefault` on matched combos;
   - require holds to be down when the push key lands;
   - `solutionMac` overrides on macOS.
4. **Capability detection.** On mount, test whether the target combination can be observed (some
   browser/OS combos swallow them, and Safari reserves several). If not observable, render the
   `mobileFallback` (multiple choice or picture) and log `chord_fallback` — never block the lesson.
5. **Sequence screen.** Ordered keystrokes with a picture per step; wrong key resets the sequence with
   a gentle message; progress dots.
6. **Picture screen.** Image with zoom, prompt, text input, accepted-answer list from content.
7. **Workbook screen.** Download link (first-party, `Content-Disposition: attachment`), collapsible
   read-only preview rendered from the XLSX at build time (no runtime iframe, no third party), formula
   prompt, text answer graded against accepted answers.
8. **Score loop.** `score` starts 0; correct → advance and add the configured weight; the reference
   uses +15/+20 with a 100 cap, but implement as `scoring: { correct, incorrect, cap }` in the track
   file so we can tune. At `score >= cap`: complete. If the next screen does not exist, recycle to
   screen 4 and continue — the loop must always terminate.
9. **Timers.** Per-screen elapsed time (for attempts), session timer (60 min default, configurable),
   pause on tab hidden.
10. **Hints and help.** Hint panel keyed by grader `code` (`value`, `func`, `syntax`, `error`,
    `exact`); show-answer unlocks after N wrong attempts (`showAnswerAfter` in track config, default
    1); docs drawer from the screen's `docs` block.
11. **Events.** Emit a typed event stream (`screen_view`, `check_correct`, `check_wrong`,
    `hint_open`, `solution_reveal`, `screen_complete`, `lesson_complete`) through a single sink
    interface; phase 10 supplies the transport, phase 4 the persistence.
- [x] **12. Accessibility.** Focus management on screen change, `aria-live` for feedback, full keyboard
      operation of the grid, 44 px targets, visible focus ring, reduced-motion respected. Entering a
      screen hands the focus to that screen's control — the answer cell, the keys panel, or the bar — and
      finishing a drill hands it to the one way forward, since otherwise a keyboard user tabs back past
      the bar and the hint row to find it. Scrollable code blocks (the solution, the syntax and the
      reference notes) take `tabindex="0"`, because a box that scrolls has to be reachable without a
      mouse. `e2e/a11y.spec.js` scans the index, the dashboard empty and populated, a formula drill
      before and after a miss, and a multi-screen lesson's picture screen; `e2e/keyboard.spec.js`
      completes a drill with Tab, typing and Enter only, checks the focus ring is drawn by the keyboard,
      and takes the hint and the reveal without a mouse. Two deliberate deviations: the scan runs under
      emulated reduced motion, because axe measures the verdict mid-fade otherwise and calls a passing
      pair a contrast failure; and the in-bar Check button stays at 32 px instead of 44, which still
      clears WCAG AA's 24 px target minimum. Chord and workbook screens are covered by their own page
      tests but not by axe, because no catalog lesson ships one.

## Acceptance criteria

- [x] A 7-screen lesson exercising all five types reaches 100 and completes. `tests/five-types.test.js`
      is that lesson: it swaps lesson 16 for a seven-screen copy (two formulas, the shipped picture, a
      chord, a sequence, a workbook and a second chord), builds the site from a temp root, and then walks
      the published payload the way the player does — each screen graded with the answer the lesson
      itself carries, by the same modules `gradeScreen` dispatches to, through
      `createSession`/`recordVerdict` with the player's own weighting. The build writes the one workbook
      file, `verify()` is clean, the page carries three keyboard panels, one picture panel, one workbook
      panel and two sheets, and the walk finishes on screen 7 with one `lesson_complete` and seven
      `screen_complete`. This criterion is about the engine carrying the five types together; all three
      non-`formula` types now also ship on real lessons — chord and sequence on lesson 03, the workbook
      on the capstone — built by the same path.
- [x] Recycling works: a lesson with 5 screens still terminates at 100.
- [ ] Chord drills pass manual matrix on Chrome/Safari/Firefox × macOS/Windows. **The one criterion a
      machine cannot close here, now for one reason only.** The content half closed on 2026-10-29 —
      lesson 03 ships a chord and a sequence — but the matrix is a claim about real browsers on two
      platforms, and Playwright's Chromium is neither Safari nor Windows. What is left for a human: open
      that lesson in each of the six cells, press the chord, confirm the screen advances rather than the
      browser acting on it, and repeat with the sequence; then type both in the bar. The
      capability detection both paths depend on is covered (`tests/keys.test.js`,
      `tests/keys-page.test.js`), so what remains is a deployment check rather than an open question.
- [x] At least one real browser-reserved combination degrades to the fallback instead of dead-ending.
      `tests/keys.test.js` proves the player's own rule (`keysLive` in `drill.js`): every chord in the
      list reserved means no listener and the bar instead, and one reserved step drops a whole sequence
      to the bar, because a sequence missing a press can never complete. The fallback is not a dead end —
      the reveal is printed in words, so `matchesTyped` grades `Ctrl+T`, `ctrl + t` and `CTRL+T` alike.
      Proven at the module level rather than in a browser on purpose: no shipped lesson carries a
      reserved shortcut, and in a browser the press would first have to be swallowed to be worth testing.
- [x] Wrong answer shows the authored hint for the actual failure mode, not a generic message. Proven in
      `tests/grader.test.js`, which walks the precedence chain (own rule → alias → `hints.value`), and in
      `tests/client.test.js`, which pins that the player shows `result.hint` and falls back to the screen's
      general line rather than to nothing.
- [x] Show-answer threshold is configurable and respected. `showAnswerAfter` is content
      (`tests/track-schema.test.js` pins the default and the 1–10 bounds), travels in the payload, and the
      player gates the reveal and its restore path on it (`tests/client.test.js`; the visible counter in
      `e2e/drill.spec.js` reads "Attempt N of 3" from that same value).
- [x] Workbook preview renders offline, with no third-party request. Proven in
      `tests/workbook-page.test.js`, whose fixture asserts the preview table is server-rendered markup.
- [x] axe: zero critical/serious on the player. `e2e/a11y.spec.js`, five scans, all clean.
- [x] Keyboard-only learner completes a full lesson. `e2e/keyboard.spec.js` does it in one drill, from
      the tab walk to the next drill's link.
- [x] Session timer pauses when the tab is hidden. `e2e/drill.spec.js` hides the tab, waits, and
      asserts the next event's `elapsed` did not grow by the hidden second.

## Test plan

| Area | Tests |
|---|---|
| Scoring | unit: correct/incorrect weights, cap, recycling termination, timer expiry |
| Key model | unit: normalisation table (40 cases), untrusted events ignored, hold ordering |
| Grader integration | every screen fixture renders the right verdict in the UI |
| Screens | component tests per type with a fixture lesson |
| E2E | one Playwright spec per screen type + a full lesson run |
| A11y | axe on each screen type |
| Fallback | simulated unsupported capability renders the fallback |

## Risks

| Risk | Mitigation |
|---|---|
| Chord capture differs per browser/OS | capability test + fallback + documented matrix, re-run each release |
| Recycling loop burns users out | cap total screens per session, surface progress, allow exit with saved state |
| Grid reimplementation scope creep | `packages/sheet` is read-only + selection only; no editing engine |
| Localisation of key names | `Mac`/`Win` label sets from one source, never inline strings |

## Handoff artifacts

- `docs/player-contract.md` — screen component contract and event schema.
- Browser/OS chord matrix with pass/fail per combination.
- `packages/sheet/README.md`.
