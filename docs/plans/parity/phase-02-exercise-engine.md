# Phase 2 — Exercise engine parity


> Part of the [reference-parity plan](00-overview.md). This file is self-contained:
> scope, work breakdown, acceptance criteria, tests and risks for this phase only.

**Duration:** 2.5–3 weeks · **Depends on:** phases 0, 1 · **Blocks:** phases 3, 7, 8

---

## Status

**Landed — the engine, the first multi-screen player, and a second screen type.** Items 1, 2, 6, 8, 9
and 11 ship: the loop and the event sink as a tested package (`packages/session`, `docs/player-contract.md`),
screen dispatch, a `formula` player and a `picture` player that drive them, proven end to end by
`16-xlookup-search-from-the-bottom` — the first lesson with three screens, the last of them a picture.
Items 3–5, 7, 10, 12 are untouched, and the clock is read but not enforced.

- [x] **11. Events.** `packages/session/events.js` owns the vocabulary (14 names, the phase-10 list) and a
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
      rather than time the tab sat open. The budget is deliberately not enforced — a wall-clock stop
      would throw away a local learner's unfinished lesson. Per-screen elapsed time is not implemented:
      it belongs to the screen component, which does not exist.
- [x] **2. Formula screen (multi-screen).** The lesson page server-renders every screen into
      `#drill-screens` and the client advances by toggling `hidden`. The section, one drill per screen,
      is the same graded object: `createSession` → `recordVerdict` → `emitAll`. Screens carry their own
      `answerCell`, `expect`, `rules`, `fixtures` and `reference`, and a multi-screen lesson must give
      each screen its own reference — `packages/content-lint` fails the copy that would reveal the same
      formula twice.
- [x] **1. Screen router.** `type` picks the panel at build time — `renderScreens` in
      `legacy/src/site/exercise-page.mjs` writes a `<div class="sheet">` for a formula and a
      `<div class="picture-body">` for a picture — and picks the grader at runtime: `gradeScreen` in
      `legacy/src/client/drill.js` sends a picture to `gradeAnswer` and everything else to `grade`. Both
      dispatches are a two-way switch on purpose; a registry would need something to register, and the
      plan's component contract (`{ screen, grid, onSubmit, onHelp, state }`) arrives with the third type,
      when its shape is known from two implementations rather than guessed from none.
- [x] **6. Picture screen.** Image, prompt, one bar, accepted answers from content. First-party SVG at
      `legacy/content/images/xlookup-third-argument.svg`, copied by the build to `assets/img/`. Graded by
      `gradeAnswer` (`packages/grader/answers.js`): case, spacing and `$` folded, the first answer is the
      reference, and a miss never echoes it. The bar renders with no target chip and `aria-label="Your
      answer"`, and the note under the sheet says "the bar" instead of naming a cell. **Zoom is
      deferred** — the plan asked for it, but the pilot image is a 640 px vector that is legible at 100 %
      on a 375 px viewport, so a zoom control would be a button with nothing to reveal until a raster
      screenshot forces one. The `alt` text is required and carries the whole image, so the screen is
      solvable without seeing it.
- [ ] **3–5, 7, 10, 12.** Chord and sequence screens, capability detection and the fallback, workbook
      screens, `packages/sheet` as a module, the hint/docs panels, accessibility. Next up, in that order.

Two acceptance criteria are now true of the site — "a lesson with several screens terminates at 100"
passes in `tests/client.test.js` and again in `e2e/drill.spec.js`, which walks lesson 16's three screens in
a browser, grades a near miss on the picture screen and completes on typed text, and "the session timer
pauses when the tab is hidden" is proven there too: the spec hides the tab, waits, and asserts the next
event's `elapsed` did not grow by the hidden second.

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
12. **Accessibility.** Focus management on screen change, `aria-live` for feedback, full keyboard
    operation of the grid, 44 px targets, visible focus ring, reduced-motion respected.

## Acceptance criteria

- [ ] A 7-screen lesson exercising all five types reaches 100 and completes.
- [ ] Recycling works: a lesson with 5 screens still terminates at 100.
- [ ] Chord drills pass manual matrix on Chrome/Safari/Firefox × macOS/Windows.
- [ ] At least one real browser-reserved combination degrades to the fallback instead of dead-ending.
- [ ] Wrong answer shows the authored hint for the actual failure mode, not a generic message.
- [ ] Show-answer threshold is configurable and respected.
- [ ] Workbook preview renders offline, with no third-party request.
- [ ] axe: zero critical/serious on the player.
- [ ] Keyboard-only learner completes a full lesson.
- [x] Session timer pauses when the tab is hidden.

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
