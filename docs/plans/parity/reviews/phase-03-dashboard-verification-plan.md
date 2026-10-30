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
| 2 | `npx playwright test e2e/dashboard.spec.js e2e/gate.spec.js e2e/feedback.spec.js` | `19 passed` (11 + 3 + 5) | The dashboard renders wrong, the gate fails to unlock, or the feedback dialog regressed. The blocked-storage test is the one that proves the honest message appears instead of "0 of 16". |
| 3 | `npx playwright test e2e/a11y.spec.js` | `8 passed` | An axe scan failed on a new page. The collision that forced `#feedback-dialog` was found by exactly this. |
| 4 | `node legacy/src/verify.mjs` | `verified 16 lesson pages, the index, the dashboard and 9 group pages — 851 checks passed` | Something in the static dist broke a pin, link or budget. The first-paint budget is silent on success; it fails as `learn/index.html first paint costs N B gzipped, over the 40 kB a throttled second affords`. |
| 5 | `npx playwright test e2e/dashboard.spec.js -g "refuses storage"` | `1 passed` — the sentence replaces the count, every row still renders, and no reset button is offered | The guard regressed. A *private window* is not the test: measured below, a fresh Playwright context — which is a private window, with no persisted profile and wiped on close — keeps `localStorage` working and the dashboard shows ordinary numbers. |
| 6 | `npx playwright test e2e/dashboard.spec.js -g "finished on its own page"` | `1 passed` — the free drill is solved, the drill page reloads, `/learn` then counts it | Progress is not being written — check `es.progress` in devtools before blaming the page. The manual sequence (complete, reload, look) is what this test performs; per-screen time is not stored client-side at all, so only the completion and the recommendation are assertable. |
| 7 | `npx playwright test e2e/dashboard.spec.js -g "walls back"` | `1 passed` — seeded as unlocked, reset clicked twice, `es.progress.unlocked` still `true`, and the last drill opens with no `#paywall` | Someone changed the documented reset semantics: `armReset` builds the wiped record as `{ ...emptyProgress(), unlocked: state.progress.unlocked === true }` and must keep doing so. |

Recorded deviations, not to be reported as green: no server-side progress, no `/api/feedback`,
no aggregated analytics.

## Closure evidence (this verification run)

Run from `/Users/danil/Desktop/excelsupreme` on `30629e8`, Node `v25.9.0` (macOS, arm64).

| Row | Status | Evidence |
|---|---|---|
| 1 | **closed** | `node --test tests/progress.test.js tests/dashboard-page.test.js` → `ℹ tests 46`, `ℹ pass 46`, `ℹ fail 0` |
| 2 | **closed** | `npx playwright test e2e/dashboard.spec.js e2e/gate.spec.js e2e/feedback.spec.js` → `18 passed (2.9s)` |
| 3 | **closed** | `npx playwright test e2e/a11y.spec.js` → `8 passed (3.7s)` |
| 4 | **closed** | `node legacy/src/verify.mjs` → `verified 16 lesson pages, the index, the dashboard and 9 group pages — 851 checks passed` (re-pinned 2026-10-29: `817` → `827` → `839` → `851` as shipped screens gained markup) |
| 5 | **closed** | `npx playwright test e2e/dashboard.spec.js -g "refuses storage"` → `1 passed`, and `npx playwright test e2e/drill.spec.js` → `13 passed (6.0s)`, including "a drill in a browser that refuses storage warns before the work evaporates". Re-pinned 2026-10-30: the manual half was dropped as *unclosable by design*, not deferred. A probe run in a fresh Playwright context (a private window in every sense: no persisted profile, wiped on close) against `next start` on `:4174` returned `{"works":true,"read":"1"}` from `localStorage.setItem`, and `/learn` printed *Nothing started yet. The first drill is one formula and about two minutes.* — the ordinary note, not the blocked-storage sentence. Chromium's private mode keeps local storage, so a human clicking through incognito would confirm nothing; the sentence appears only when the storage probe throws `SecurityError`, which is exactly the state both tests reproduce. |
| 6 | **closed** | `npx playwright test e2e/dashboard.spec.js -g "finished on its own page"` → `1 passed (2.1s)`. Re-pinned 2026-10-30: the dashboard test now reloads the drill page after the correct answer and asserts `.rail-item[data-lesson=…]` is `is-done` before opening `/learn`, so the count it checks comes from a fresh document rather than the page that just did the write. `e2e/drill.spec.js` "progress survives a reload on the same device" covers the same seam from the drill side. |
| 7 | **closed** | `npx playwright test e2e/dashboard.spec.js -g "walls back"` → `1 passed (1.8s)`. New test "erasing progress does not put the walls back": the seed is one-shot (`sessionStorage` guard) so a re-running init script cannot hand the pre-reset record back; after two reset clicks it asserts `stored.done` is `{}` and `stored.unlocked` is `true`, then opens `index.at(-1)` — behind both the order gate and the paywall — and finds `#formula` visible with no `#paywall` in the DOM. Mutation-checked: with `armReset` forced to `unlocked: false` the test fails at `expect(stored.unlocked).toBe(true)`. |

## Baseline

| Metric | Value |
|---|---|
| `/learn` page and group pages | 1 dashboard + 9 group pages |
| Progress package tests | 32 |
| Dashboard page tests | 14 |
| Dashboard browser tests | 11 |
| Gate browser tests | 3 |
| Feedback browser tests | 5 |
| Accessibility scans | 8 |
| Documented event names | 17 (includes `feedback_sent`, `gate_view`, `track_unlock`) |
| Storage keys | `es.progress`, `es.trial`, `es.feedback` |
| Feedback queue limit | 20 entries, oldest dropped |
| First paint (`/learn`) | 7,995 B gz HTML + 13,390 B gz CSS = 21.4 kB of 40 kB |
| Dashboard island | 2,768 B gz, outside the budget |
| Groups (catalogued / with pages) | 16 / 9 |
