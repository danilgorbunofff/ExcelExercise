# @excelsupreme/session

The player's session engine, with no DOM, no network and no dependencies. It is imported by
`legacy/src/client/drill.js` today (for the event sink) and by the Next player when multi-screen
lessons land (for the score loop and the clock).

| Module | What it owns |
|---|---|
| `score.js` | The score loop: correct answers add weight, the score caps at 100, the lesson recycles to screen 4 when it runs out of new screens, and the loop is proved to terminate. |
| `clock.js` | The wall-clock session budget: elapsed, remaining, expiry, and a pause that survives a background tab. |
| `events.js` | The event vocabulary and the sink. A name outside `EVENT_TYPES` never reaches the transport. |

Rules the tests pin, because they are the ones that fail in the wild:

- **`scoring.correct` must be at least 1.** A zero-weight correct answer plus recycling is an infinite
  loop; the constructor refuses it rather than hanging a learner's tab.
- **The cap is finite**, so at most `ceil(cap / correct)` correct answers are needed. Recycling cannot
  extend a session.
- **A graded answer on a finished session changes nothing** and emits nothing — double grading is a
  caller bug, and it must not be able to inflate a score.
- **`recycleFrom` is clamped into the lesson.** A one-screen lesson recycles to its only screen instead
  of reading past the end of the array, and a lesson shorter than the recycle point restarts from its
  first screen rather than repeating its last one.
- **`incorrect` may only be zero or negative**, and the score floors at 0 rather than going negative.
- **Pause and resume are idempotent**, so a `visibilitychange` that fires twice cannot lose or duplicate
  a gap.
- **Props are flat primitives.** A nested object or an `undefined` is dropped rather than sent to a
  collector that expects a column per field.

Events produced by the loop are returned, not sent: `recordVerdict` hands back `{ session, events }` and
`emitAll(sink, events)` forwards them. That keeps the loop free of any transport and lets a test read the
exact sequence without a browser.

See [`docs/player-contract.md`](../../docs/player-contract.md) for the screen contract and the event
schema.
