# The player contract

Phase 2's handoff artifact: what a screen is, what the score loop promises, what the clock
promises, and what an event looks like once it leaves the player. The engine half of that contract
exists and is tested today in `packages/session`; the multi-screen player that consumes it does not.

Writing the contract down before the player exists is deliberate. The reference's loop is the one place
where a bug looks like "the lesson never ends", and a typed event name is a database column once phase
10 ships a collector — both are cheaper to pin now than to fix behind a funnel that has already been
read.

## Where the code is

| File | Exports | Runs in |
|---|---|---|
| `packages/session/events.js` | `EVENT_TYPES`, `MAX_EVENTS`, `createSink` | browser (wired) and node (tests) |
| `packages/session/score.js` | `createSession`, `recordVerdict`, `emitAll`, `nextIndex`, `currentScreen`, `isComplete`, `progress`, `DEFAULT_SCORING`, `DEFAULT_RECYCLE_FROM` | node (tests) today, browser with the multi-screen player |
| `packages/session/clock.js` | `createClock`, `DEFAULT_SESSION_MINUTES` | node (tests) today, browser with the player |
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
| `type` | `formula` \| `chord` \| `sequence` \| `picture` \| `workbook` — picks the component |
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

One screen today, because every authored lesson has exactly one `formula` screen. The other four types
are phase-2 work; see `docs/plans/parity/phase-02-exercise-engine.md`.

## The score loop

`createSession({ screens, scoring, recycleFrom })` returns a frozen-ish plain object
(`{ screens, scoring, recycleFrom, index, score, correct, wrong, complete }`); `recordVerdict(session, ok)`
returns `{ session, events }` with a **new** session object — the loop never mutates the one you passed,
so the caller can render optimistically and still have the old state.

- Default `scoring` is `{ correct: 20, incorrect: 0, cap: 100 }`: five correct answers complete a lesson.
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

**Wired.** The drill (`legacy/src/client/drill.js`) emits `screen_view`, `drill_start`, `check_correct`,
`check_wrong`, `hint_open`, `solution_reveal`, `lesson_complete`, `lesson_exhausted`, `paywall_view`,
`paywall_email`, `trial_start` and `track_view` through one sink, into `window.__esEvents` plus
`console.debug`. Its attempts, solve state and paywall gate are still the single-screen ones it shipped
with — a lesson is one screen, so a score loop and a session budget have nothing to advance through yet.

**Waiting.** Everything that needs more than one screen or a transport:

- the multi-screen player and the five screen components, which is what makes `createSession`'s loop
  observable;
- wiring `recordVerdict`'s events through `emitAll` (the drill's hand-written `check_*` calls become
  the loop's output, so the two cannot disagree);
- `visibilitychange` → `clock.pause()`/`resume()`, and what happens at `expired()`;
- `screen_id`/`lesson_id` in the envelope, and `screen_view` per screen rather than per page;
- `lesson_abandon` (needs a leave intent) and `paywall_view` deduplication across screens;
- the transport (`POST /api/events`, phase 10) and postgres persistence (phase 4).

## Invariants a change must not break

Both are pinned by `tests/session.test.js`; if a change needs one of them relaxed, that is a decision to
argue for, not a test to edit.

1. **The loop terminates.** `scoring.correct >= 1`, a finite cap, and recycling clamped into the lesson.
2. **An event is flat, typed and honest.** Only `EVENT_TYPES`, only primitive props, `type`/`ts`
   unforgeable, at most `MAX_EVENTS` per session.
