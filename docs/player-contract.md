# The player contract

Phase 2's handoff artifact: what a screen is, what the score loop promises, what the clock
promises, and what an event looks like once it leaves the player. The engine half of that contract
and the first multi-screen lesson that consumes it both exist today; the player reads the clock, the
budget stays unenforced.

Writing the contract down before the player exists is deliberate. The reference's loop is the one place
where a bug looks like "the lesson never ends", and a typed event name is a database column once phase
10 ships a collector — both are cheaper to pin now than to fix behind a funnel that has already been
read.

## Where the code is

| File | Exports | Runs in |
|---|---|---|
| `packages/session/events.js` | `EVENT_TYPES`, `MAX_EVENTS`, `createSink` | browser (wired) and node (tests) |
| `packages/session/score.js` | `createSession`, `recordVerdict`, `emitAll`, `nextIndex`, `currentScreen`, `isComplete`, `progress`, `DEFAULT_SCORING`, `DEFAULT_RECYCLE_FROM` | browser (wired) and node (tests) |
| `packages/session/clock.js` | `createClock`, `DEFAULT_SESSION_MINUTES` | node tests and the browser player |
| `packages/session/index.js` | everything above | — |

Nothing in the package touches the DOM, `Date.now()` or the network directly: time and the write
destination are injected. That is what lets `node --test tests/session.test.js` cover the loop without
a browser, and it is the reason a Playwright spec is only needed for the parts that render.

`legacy/src/build.mjs` copies the package to `dist/assets/session/` exactly as it copies
`packages/grader` to `dist/assets/grader/`, so the client imports the source, not a bundle:
`legacy/src/client/drill.js` reaches it with `../session/index.js`.

## A screen

A screen is what `legacy/content/exercises/<slot>-<slug>.json` already ships under `screens[0]`
(schema v2). The player reads these fields and nothing else:

| Field | Meaning |
|---|---|
| `id` | stable across edits; the join key for events and saved progress |
| `type` | `formula` \| `chord` \| `sequence` \| `picture` \| `workbook` — picks the component; every type but `workbook` ships |
| `prompt` | the question, plain text |
| `grid` | the sheet the screen renders (columns, rows, highlighted range, locked cells) |
| `answerCell` | the cell the grader reads; also where a successful result is written back |
| `expect` | `{ value }` or `{ error }` — what the answer must evaluate to |
| `require` | rules the formula must satisfy (`func`, `minArgs`, `matchType`, …) |
| `forbid` | rules the formula must not trip |
| `requireRef` | cell references the formula must mention |
| `rules` | per-rule hints, so a wrong answer explains *its own* failure |
| `hints` | the escalating hint list the Hint button reveals |
| `fixtures` | `{ accept: [...], reject: [{ formula, rule, why }] }` — the graded corpus |
| `reference` | the formula the reveal prints; required on every screen of a multi-screen lesson, and compared with whitespace stripped and case folded so two screens cannot show the same answer twice |

A `formula` screen carries every field above. The other type that ships is `picture`: it renders an
image instead of a grid and asks, in the prompt, what the image shows. It has no `grid`, `answerCell`,
`expect`, `require`, `forbid`, `requireRef`, `reference` or `fixtures` — the schema rejects those rather
than ignoring them — and instead carries:

| Field | Meaning |
|---|---|
| `image` | path under `content/`, ending in `.svg`; the build copies it to `assets/img/` |
| `alt` | what the image shows, verbatim (≤240 chars) — the image is the question, so the text has to carry it |
| `answers` | the accepted spellings, first one being the reference answer (≤80 chars each, unique after normalisation) |
| `hints` | `{ value }` only: there is no formula to debrief |

Grading a picture screen is a lookup, not an evaluation: `gradeAnswer` folds case and spacing, drops
`$` and a leading `=`, so `=$B$2:$B$6` and `b2:b6` are the same answer. A miss never echoes the expected
spelling, and a screen with no `hints.value` draws a lint warning, since that miss would teach nothing.
The page still renders a formula bar for it — no target chip, `aria-label="Your answer"`, and the note
under the sheet says "the bar" where a formula screen names a cell.

The two shortcut types are graded by a list of presses instead of by rules, and they are the only
types that read the keyboard:

| Field | Meaning |
|---|---|
| `keys` | a `chord` screen's accepted presses, first one being the reference; each is parsed by `parseChord`, and modifier order is not a spelling (`ctrl+shift+l` and `shift+ctrl+l` are one press, so listing both is a build failure) |
| `steps` | a `sequence` screen's presses, in order; each is parsed by `parsePress`, so a modifier on its own (`alt`) is a step |

No `grid`, `answerCell`, `expect`, `require`, `forbid`, `requireRef` or `reference` — the schema rejects
those rather than ignoring them. `expect.value` is written by the schema from the list itself
(`"Ctrl + Shift + L"`, `"Alt then H then N then O"`), so one field means one reveal on every screen type.

Grading a shortcut screen accepts a press or the same shortcut typed into the bar. `matchesEvent` reads
the event's modifiers and key, `matchesTyped`/`matchesTypedSteps` read the bar's text, so a learner whose
browser will not deliver the keys is not locked out. Two rules keep the keyboard from grading by accident:

- **Only a deliberate press spends an attempt.** The first press of a sequence, or any press with a
  modifier, or a named key (`Enter`, `Escape`, `Tab`, `ArrowDown`, …) is a candidate; a bare letter typed
  while the panel has the focus is not, because it is on its way to the bar.
- **A missed press costs what a missed answer costs**, and a sequence restarts from its first step so the
  learner cannot walk past a mistake. `Escape` resets a started sequence without spending anything.

The panel takes the focus when the screen opens, so the first press lands on the page rather than in the
bar; the bar is still there, and typing into it grades the same shortcut.

A lesson carries one or more screens: `legacy/content/exercises/16-xlookup-search-from-the-bottom.json`
is the first with three, the third being a `picture`. `workbook` is phase-2 work; see
`docs/plans/parity/phase-02-exercise-engine.md`.

The page server-renders every screen into `#drill-screens` as `<div data-screen="N">`, with the first
one visible. Switching screens toggles `hidden` on those panels and nothing else: the panels, their
sheets and their answer cells are in the first byte of HTML, so a crawler, a reader with JavaScript
off, and the verifying build all see the same lesson.

## The score loop

`createSession({ screens, scoring, recycleFrom })` returns a frozen-ish plain object
(`{ screens, scoring, recycleFrom, index, score, correct, wrong, complete }`); `recordVerdict(session, ok)`
returns `{ session, events }` with a **new** session object — the loop never mutates the one you passed,
so the caller can render optimistically and still have the old state.

- Default `scoring` is `{ correct: 20, incorrect: 0, cap: 100 }`: five correct answers complete a lesson.
  The drill does not use the default: it passes `correct: Math.ceil(100 / screens)`, so a lesson finishes
  on the last screen of an in-order run (`ceil` guarantees `correct × screens ≥ 100`) while a single-screen
  lesson still completes on its first correct answer.
  A weight that does not divide the cap clamps (`7 × 15 → 100` on the seventh), so a non-divisible track
  still terminates.
- `incorrect` is a penalty in `[-100, 0]` — zero by default, because a wrong answer already costs an
  attempt and the reference does not subtract points.
- On a wrong answer nothing advances: the score floors at 0 and the learner stays on the screen.
- `recycleFrom` (default `4`) is the 1-based screen the loop replays from when the next screen does not
  exist. It is clamped into the lesson, so a 5-screen lesson replays `0,1,2,3,4,3,4,…`, a 2-screen lesson
  restarts at its first screen rather than repeating its last, and a 1-screen lesson recycles to itself.
- Termination is a construction-time invariant, not a hope: `scoring.correct >= 1` and a finite
  `scoring.cap` are both validated, so a zero-weight loop (recycle forever) cannot be built. A bad
  config throws with the field named, rather than looping.
- A graded answer on a finished session returns the same object and **no** events. Double-grading is
  the caller's bug; it must not be able to inflate a score.

Events produced, in order:

| Case | Events |
|---|---|
| correct | `check_correct` → `screen_complete` → `lesson_complete` (only when the cap is reached) |
| wrong | `check_wrong` |

`screen_complete` fires on every correct answer, including the last one — the last screen completes like
any other, and `lesson_complete` follows it.

## The clock

`createClock({ now, sessionMinutes })` (default budget 60 minutes) returns
`{ elapsedMs(), remainingMs(), expired(), isPaused(), pause(), resume() }`.

- The budget is **wall-clock**: an unpaused tab that was suspended for an hour has spent an hour. This
  is why pause is explicit rather than inferred from a timer — `visibilitychange` is the caller's job,
  and a stopped clock the caller forgot to resume is worse than a budget that ran out.
- `pause`/`resume` are idempotent: pausing a paused clock must not credit the same gap twice.
- A clock that steps backwards (NTP correction, a learner changing the system time) counts as zero
  elapsed, never negative.
- `sessionMinutes` must be a positive finite number; anything else throws.

**What the player does with it.** One clock per mount, paused while `document.hidden` and resumed on
`visibilitychange` (also paused at load, for a tab opened in the background), and never enforced: a
wall-clock stop would throw away a zero-signup learner's unfinished lesson, so `expired()` and
`remainingMs()` stay unread. What it buys instead is honest time on task — working events carry
`elapsed`, whole seconds since the clock started, so a tab left in the background for an hour does not
show up in the funnel as an hour of practice. There is no countdown to render: the reference has none,
and inventing one would be the parity drift, not the parity.

## The event envelope

`createSink({ write, context, now })` → `{ emit(type, props), count }`.

```js
{ ...context(), ...props, type: "check_wrong", ts: "2026-01-14T09:31:07.412Z" }
```

- `type` and `ts` are written **last**, so a prop cannot forge the schema.
- `context()` supplies the per-event facts the call sites should not repeat — the drill passes
  `{ route }`. Phase 10 adds `session_id`/`anon_id`; neither exists yet, and nothing outside the buffer
  reads these events, which is why the field can land later without a migration.
- Props must be **flat primitives**. Strings, booleans, finite numbers and `null` survive; objects,
  arrays, `undefined`, `NaN` and functions are dropped silently, because the collector's schema is a
  column per field and a nested value would only be stringified or rejected server-side later.
- An unknown name returns `false` and writes nothing, and so does an event past `MAX_EVENTS = 500`.
  Refusing is silent by design: an analytics typo must not throw inside a learner's click handler.
- `count` is the number accepted, which is what `emitAll(sink, events)` returns for a batch.

`EVENT_TYPES` (14 names) is the whole vocabulary:
`drill_start, screen_view, check_correct, check_wrong, hint_open, solution_reveal, screen_complete,
lesson_complete, lesson_exhausted, lesson_abandon, paywall_view, paywall_email, trial_start, track_view`.

The learner's formula is deliberately **not** in any event: `check_correct`/`check_wrong` carry the
attempt count and the rule that failed, never the text of the answer. It is someone's typed input, and
the one field an analytics hook could forward to a third party.

The drill previously emitted `drill_view`, `drill_check`, `drill_hint`, `drill_solution` and
`drill_complete`. Those were renamed when the sink landed — `drill_check` split in two, because "a
check happened" is not a funnel step and "a check failed" is. Nothing consumed the old names yet.

## Wired today vs. waiting for the player

**Wired.** The drill (`legacy/src/client/drill.js`) drives `createSession`, hands every verdict to
`recordVerdict`, and emits the returned events through `emitAll` — so `check_correct`, `screen_complete`,
`lesson_complete` and `check_wrong` are the loop's output rather than a second, hand-written opinion.
Around them it emits `screen_view` (per screen, with `screen` and `of`), `drill_start`, `hint_open`,
`solution_reveal`, `lesson_exhausted`, `paywall_view`, `paywall_email`, `trial_start` and `track_view`
through the same sink, into `window.__esEvents` plus `console.debug`.

Two limits are deliberate and documented rather than accidental:

- **The session is memory-only.** `createSession` state is never written, so a reload starts at screen 1
  again. Only `es.progress` is persisted, and its shape did not change with screens: attempts per lesson
  plus whether that lesson was completed with help.
- **The reveal completes the whole lesson** from whichever screen shows it. `lesson_exhausted` fires once
  per lesson — a return visit that already spent its three attempts re-shows the button without
  re-emitting it — because a learner who has been shown the answer has been shown all of it.

**Waiting.** Everything that needs a transport, more screens or a real decision:

- enforcing the budget (`expired()` → what a learner sees), if it is ever enforced at all;
- the `workbook` screen type, which is what makes a screen anything more than a formula, a picture or a
  shortcut;
- `session_id`/`anon_id` in the envelope, `lesson_abandon` (needs a leave intent), and `paywall_view`
  deduplication across screens;
- the transport (`POST /api/events`, phase 10) and postgres persistence (phase 4).

## Invariants a change must not break

Both are pinned by `tests/session.test.js`; if a change needs one of them relaxed, that is a decision to
argue for, not a test to edit.

1. **The loop terminates.** `scoring.correct >= 1`, a finite cap, and recycling clamped into the lesson.
2. **An event is flat, typed and honest.** Only `EVENT_TYPES`, only primitive props, `type`/`ts`
   unforgeable, at most `MAX_EVENTS` per session.
