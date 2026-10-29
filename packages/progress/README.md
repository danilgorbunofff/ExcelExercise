# @excelsupreme/progress

The read model behind `/learn`, with no DOM, no storage and no dependencies. It is imported by
`legacy/src/client/dashboard.js` (the island that paints the dashboard from `localStorage`) and by
`legacy/src/site/dashboard-page.mjs` (the server-rendered page a crawler and a no-JS reader get).

| Export | What it owns |
|---|---|
| `badgeFor` | The state machine one lesson wears: stale, needs practice, complete, in progress, not started. |
| `summarise` | Counts, per-group totals, the up-next recommendation, and the recent list — for a whole plan in one call. |
| `ago` | "just now", "4 minutes ago", "3 days ago" for a completion timestamp. |

Rules the tests pin, because they are the ones a dashboard gets wrong:

- **Badges have one precedence: `stale` > `needs_practice` > `complete` > `in_progress` > `not_started`.** A
  lesson is never two badges at once, so the page cannot show "Complete" and "Stale" side by side.
- **`stale` beats `complete`.** A drill solved a month ago and never touched since is the thing to say
  something about, even though it is, technically, done.
- **The badge never invents data.** Everything comes from what the drill actually recorded: `done.at`,
  the tries frozen into the completion, and whether a hint was used. There is no per-lesson accuracy
  score to invent a badge from.
- **`summarise` counts what is in the plan, not what is in storage.** A `done` entry for a lesson that
  was renamed or withdrawn does not inflate the count.
- **`now` is a parameter, never `Date.now()` inside a comparison.** The same record and the same clock
  always produce the same badge, which is what makes "14 days" testable.
- **Up next is always one lesson, and it is never a dead end.** Unfinished lesson first (resume before
  start), then a review of anything wanting practice, and `nextReason: "done"` with `next: null` only
  when the whole track is complete and healthy.

The dashboard's copy lives in the caller: this module returns states, not sentences, so the page can
word them for its audience without a second source of truth.
