# Phase 3 — Dashboard and Progression: Verification Plan

Scope: `/learn` and `/learn/groups/<id>`, local progress persistence, the completion summary and
recommendation, order gating with its local unlock, per-screen time, and the feedback dialog.

## Assessment

**Solid, with two recorded deviations.**

All seven acceptance criteria are ticked with a named proving test each. Progress is a real package
(`packages/progress`, 32 tests) rather than logic inside the page; the dashboard is exercised in the
browser by 10 tests; gating and the unlock have 3; accessibility scans cover the new pages.

The two deviations are product decisions, recorded rather than hidden: **no server-side progress**
(everything is `localStorage`, so a learner who clears storage loses the lot and no cohort data
exists), and **no `/api/feedback`** (feedback goes to the event sink plus a bounded local queue,
`es.feedback`, and the dialog says plainly that nothing is sent). Both constrain Phase 4.

## Critical Failure Modes

**1. The drill swallows a failed save; only the dashboard admits it.** `createStore().write` catches
the quota/private-mode throw with the comment "the drill still works, progress just does not
persist". The dashboard tells the truth ("This browser blocks local storage, so nothing is saved.
The drills still work, but this page cannot remember them.") — but a learner who is in the drill
when the write fails is never told, so a completed lesson silently evaporates on reload. Detection
already exists: `safeStorage()` probes `setItem`/`removeItem` at load and returns `null` when blocked.
Concrete fix (not applied here): when the probe fails, render that same sentence once on the drill
page, near the rail. This is the one genuinely lost-signal path in Phase 3.
*Closed in this verification run:* `legacy/src/client/drill.js` calls `safeStorage()` once, passes the
result into `createStore(storage)`, and on `null` appends `#rail-blocked` after the rail's
`.rail-count` carrying the dashboard's sentence verbatim. Write semantics are untouched (no retry, no
changed swallowing); the warning is client-side only, so the emitted bytes and `next:check` parity are
unchanged. Proven by `e2e/drill.spec.js` ("a drill in a browser that refuses storage warns before the
work evaporates") and the source-contract test in `tests/client.test.js`.

**2. "Reset" preserves the unlock, by design.** `armReset` writes
`{ ...emptyProgress(), unlocked: state.progress.unlocked === true }` under the comment "The unlock is
a preference, not a completion". A learner who resets to redo the track therefore keeps every gate
down. Correct on the stated reading, surprising on the naive one — and it must not be "fixed" by
someone tidying up the wipe.

**3. Reset is hidden, not disabled.** `#dash-reset-section` disappears when
`summary.completed === 0` or `state.blocked !== null`. Nothing is wrong here, but it means a
blocked-storage browser can never reach the reset button, and a test that looks for it on a fresh
profile will time out instead of failing with a message.

**4. The first-paint budget prices HTML and CSS only.** `learn/index.html` is 7,995 B gz and
`assets/styles.css` 13,390 B gz — 21.4 kB of a 40 kB ceiling. The dashboard island
(`dashboard.js`, 2,768 B gz) is deliberately outside the budget, so a regression that doubles the
island will not fail `verify`. Budget the island before relying on this number as a ceiling.

**5. No cohort data exists and none can be recovered.** Progress never leaves the browser. Every
phase-4+ question about completion rates, drop-off or hint usage is unanswerable from the shipped
system; the event sink is the only trace, and it is not aggregated anywhere.

**6. Group pages disagree with the catalog by design.** 16 groups in `track.groups`, 9 group pages,
7 groups with intro copy and no lesson. A new lesson in an empty group adds a page and changes the
count without touching the catalog — the two numbers must be re-derived, never assumed equal.

**7. The local feedback queue is bounded.** `enqueueFeedback` keeps the newest `FEEDBACK_LIMIT = 20`
entries and drops the oldest, so a learner who leaves a lot of feedback loses the beginning of it —
silently. The dialog does say plainly that nothing is sent, so nothing is promised that the queue
cannot keep, but the cap itself is invisible.

## Verification Gate

| # | Command | Expected | If it fails |
|---|---|---|---|
| 1 | `node --test tests/progress.test.js tests/dashboard-page.test.js` | `tests 46`, `pass 46` (32 + 14) | Progress serialisation or the dashboard page contract broke. `parseProgress` is the one to read: it must survive a hand-edited or older payload. |
| 2 | `npx playwright test e2e/dashboard.spec.js e2e/gate.spec.js e2e/feedback.spec.js` | `18 passed` (10 + 3 + 5), `5.5 s` | The dashboard renders wrong, the gate fails to unlock, or the feedback dialog regressed. The blocked-storage test is the one that proves the honest message appears instead of "0 of 16". |
| 3 | `npx playwright test e2e/a11y.spec.js` | `8 passed` | An axe scan failed on a new page. The collision that forced `#feedback-dialog` was found by exactly this. |
| 4 | `node legacy/src/verify.mjs` | `verified 16 lesson pages, the index, the dashboard and 9 group pages — 827 checks passed` | Something in the static dist broke a pin, link or budget. The first-paint budget is silent on success; it fails as `learn/index.html first paint costs N B gzipped, over the 40 kB a throttled second affords`. |
| 5 | Manual, private/incognito window | Dashboard shows the blocked-storage sentence; drills still work | The guard regressed. The **drill** half of this row is no longer a gap: failure mode 1 is closed and the sentence is asserted in the browser by `e2e/drill.spec.js`. The dashboard half stays manual. |
| 6 | Manual, complete a lesson then reload | Completion, per-screen time and the recommendation persist | Progress is not being written — check `es.progress` in devtools before blaming the page. |
| 7 | Manual, gate then unlock then reset | The gate is still unlocked after reset | Expected. If it is locked again, someone changed the documented reset semantics. |

Recorded deviations, not to be reported as green: no server-side progress, no `/api/feedback`,
no aggregated analytics.

## Closure evidence (this verification run)

Run from `/Users/danil/Desktop/excelsupreme` on `30629e8`, Node `v25.9.0` (macOS, arm64).

| Row | Status | Evidence |
|---|---|---|
| 1 | **closed** | `node --test tests/progress.test.js tests/dashboard-page.test.js` → `ℹ tests 46`, `ℹ pass 46`, `ℹ fail 0` |
| 2 | **closed** | `npx playwright test e2e/dashboard.spec.js e2e/gate.spec.js e2e/feedback.spec.js` → `18 passed (2.9s)` |
| 3 | **closed** | `npx playwright test e2e/a11y.spec.js` → `8 passed (3.7s)` |
| 4 | **closed** | `node legacy/src/verify.mjs` → `verified 16 lesson pages, the index, the dashboard and 9 group pages — 827 checks passed` |
| 5 | **half closed** | Drill half: `npx playwright test e2e/drill.spec.js` → `9 passed`, including "a drill in a browser that refuses storage warns before the work evaporates". Dashboard half still needs a human in a private window; the browser test uses a `localStorage` getter that throws, which is the same probe path but not literally incognito mode. |
| 6 | **still open** | Manual: complete a lesson then reload. Needs a human, and the automated equivalent (`e2e/drill.spec.js` "progress survives a reload on the same device") already proves the write path. |
| 7 | **still open** | Manual: gate → unlock → reset. Needs a human; `e2e/gate.spec.js` covers the unlock, not the reset-then-still-unlocked semantics. |

## Baseline

| Metric | Value |
|---|---|
| `/learn` page and group pages | 1 dashboard + 9 group pages |
| Progress package tests | 32 |
| Dashboard page tests | 14 |
| Dashboard browser tests | 10 |
| Gate browser tests | 3 |
| Feedback browser tests | 5 |
| Accessibility scans | 8 |
| Documented event names | 17 (includes `feedback_sent`, `gate_view`, `track_unlock`) |
| Storage keys | `es.progress`, `es.trial`, `es.feedback` |
| Feedback queue limit | 20 entries, oldest dropped |
| First paint (`/learn`) | 7,995 B gz HTML + 13,390 B gz CSS = 21.4 kB of 40 kB |
| Dashboard island | 2,768 B gz, outside the budget |
| Groups (catalogued / with pages) | 16 / 9 |
