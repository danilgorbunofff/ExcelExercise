# Phase 5 — Retention Layer: Verification Plan

Scope: `lib/retention/*`, `lib/flags.js`, `/api/progress` as a points write, `/api/daily`,
`/api/flashcards`, `/daily`, `/daily/run`, `/flashcards`, `/leaderboard`, the week panel on
`/account`, and the four migrations `0009_retention_write` … `0012_retention_week`.

## Assessment

**Built, and proved to the edge of what this checkout can reach. Two of the eight acceptance rows end
at a boundary the repository does not own: a load generator and a 10,000-user dataset. One more — "a
second submission is rejected" — is proved at the table and the route but was never driven twice
through the UI by hand.**

All seven work items are implemented across eight logged units (5a–5h). The evidence is layered the
same way phase 4's was: **169 pure-rule tests** over seven files that run in CI in under a second;
**62 database assertions** in three specs against a real Postgres with all twelve migrations applied;
**9 new browser tests** on the retention pages plus one new axe scan that lays out all four of them;
and five gate commands, of which four were re-run in full for this review.

The retention layer is the first one in this repository where **the same rule is written twice on
purpose**: `award_points`, `touch_streak` and `retention_week` in SQL, and the same rules in
`lib/retention/`. The JavaScript is what the route calls and what a fast unit test can prove; the SQL
is what makes the write atomic when two tabs submit at once. The duplication is not left to trust —
`tests/db/retention.spec.js` runs the streak matrix through both and asserts they agree (*"matches
`streakAfter` on every edge in the unit matrix"*, *"agrees with the JavaScript that shapes the same
series"*), and *"keeps one number in two places"* pins `retention_daily_cap()` against `DAILY_CAP`.

The deviations from the phase doc are product decisions, each recorded in the unit log:
**the challenge day is created by the first request, not a cron** (this repository has no scheduler,
and an idempotent `challenge_ensure` that runs on demand cannot miss a day); **flashcard scheduling
lives in the browser** (the plan said localStorage first, server post-launch, and the header of
`lib/retention/flashcards.js` says so); **`/flashcards` is not behind the proxy** (a learner with no
account still gets a deck from this browser, which is the only way the surface works in the state CI
builds); and **the anti-cheat is a hiding heuristic with no review UI** (a flagged day leaves the board
and lands in a table a human reads with SQL).

**This checkout has no `.env.local`.** Every gate number below was measured with the phase-4 and
phase-5 variables unset — the state CI is in. The retention pages therefore render their `AuthCard`
notice in every automated run; the populated boards, deck, run and week panel were proved against a
**configured build** by hand (gate rows 12, 13 and 15), and that is the honest split.

## Critical Failure Modes

**1. A kill switch only switches on a configured deployment.** The flag is read at request time by
route handlers always, and by pages only when the page is dynamic. With accounts configured the four
retention pages call `currentUser()` → `cookies()` and run per request; with accounts unconfigured they
are `○` in the build table and the flag branch is baked into the prerender. **Detection:** the route
table from `npm run next:build` — `○` for `/daily`, `/daily/run`, `/flashcards`, `/leaderboard` in the
unconfigured build, `◐` on a configured one. **Consequence:** on a static deploy a flag change needs a
rebuild; on a configured deploy it does not, which is the case these switches exist for. Recorded in
`.env.example` rather than fixed, because the alternative is forcing four inert pages to be dynamic for
a feature that cannot be reached without accounts.

**2. Turning `streaks` off stops the count, and the gap is real.** `creditBatch` skips `touch_streak`
when the flag is off, but the next counted day is compared against `last_day`, which is now older than
yesterday — so a day spent with streaks off **breaks** the streak rather than pausing it. That is the
right behaviour for an incident tool (a streak that resumes as if the outage never happened would be a
lie) but it is not a pause button, and nothing in the UI explains it. **Detection:**
`tests/db/retention.spec.js` — *"keeps the longest run when a gap restarts the current one"*;
`tests/retention-write.test.js` — the flag-off case asserting zero `touch_streak` calls. **Fix, if a
pause is ever wanted:** an explicit `skipped_days` column, not a reinterpretation of `last_day`.

**3. The day boundary is the zone recorded when the row was written.** `learner_zone` returns the
stored zone and falls back to UTC for a zone the database should not have accepted; `retention_week`
buckets by it. A learner who changes their profile zone mid-day has that day split across two buckets,
and the trend counts it twice as *days studied* while `pointsToday` counts only the new zone. **Detection:**
the db case *"buckets the day in the learner's own zone"*, which asserts the same instant is one day in
Auckland and another in UTC. **Fix:** a zone change is a deliberate act on `/account/profile`; the
honest mitigation is the sentence on the page, not a migration.

**4. There is no cron, so the challenge day is drawn when someone first opens it.** `challenge_ensure`
is idempotent and keyed by day, so two learners cannot get two different days — but the topic sample is
weighted by *recent activity at the moment of that first request*, not by activity at 00:00 UTC. A day
nobody visits does not exist, which loses nothing, but it does mean the plan's `db/jobs` row is not what
shipped. **Detection:** `tests/db/challenge.spec.js` — *"creates the day once and returns it to every
caller"*, *"refuses a day with no screens instead of storing an empty challenge"*.

**5. The anti-cheat is a floor, not a fence, and its queue has no UI.** `implausible_day` hides a day
whose accuracy-per-second is physically impossible and hands it to `leaderboard_flags`; the spec proves
it flags a machine-fast day and *"does not flag an honest, slow day"*. A cheater who is merely fast is
invisible, a real learner on a fast connection can be flagged, and the review queue is a table someone
queries. **Detection:** both specs plus the positive case *"is readable by a learner but the heuristic
is not"*, which proves the row list is reachable and the heuristic is not.

**6. Flashcard spacing lives in `localStorage`, so the deck is not portable.** Clearing site data resets
every interval; a second device starts from scratch; the server never learns a due date. This is the
plan's own staging (localStorage first, server scheduling post-launch) but it is a visible limit: the
sign-in exists and the scheduling still does not follow the account. **Detection:** `e2e/flashcards.spec.js`
— *"grading `again` brings the card back next session"* drives the real `localStorage` path.

**7. `p95 < 300 ms at 10,000 users` is measured nowhere.** The acceptance row assumes a k6 script and a
seeded dataset; neither exists in this checkout. The largest board the suite builds is 55 probe learners
in `tests/db/leaderboard.spec.js` — enough to prove ordering, ties, the rank-at-1/3/50 walk and the
flagged-day exclusion, not enough to say anything about latency. **Detection:** `ls scripts | grep -i k6`
returns nothing. This row cannot be closed from here; it needs a load generator and a machine that is
allowed to be noisy.

**8. `/api/daily` is the one route with no unit test, and the reason is structural.** Importing it pulls
`lib/auth/server.js` → `next/headers`, which plain `node --test` cannot resolve. Its honesty therefore
rests on the 24 database assertions under it and on `e2e/retention.spec.js`'s API case, not on a fake
request. **Detection:** `node --test tests/flags.test.js` passes while the daily route is absent from it,
and the file's header says why.

**9. The axe scans only ever lay out the unconfigured state.** Row 4 of the gate below and the manual
rows 12–13 cover different things on purpose: the scan sees the `AuthCard`, the sign-in, the deck's
empty state; the
populated board, the deck with cards, and the run with a clock were only looked at by hand. **Closed as
far as this checkout can:** a new test added with this review scans `/leaderboard`, `/daily`,
`/daily/run` and `/flashcards` (19 axe scans, was 18). **What is not covered:** a contrast failure in
the leaderboard table or the flip card would not be caught by any automated check.

## Verification Gate

| # | Command | Expected | If it fails |
|---|---|---|---|
| 1 | `npm run check` | `ℹ tests 1547`, `ℹ suites 198`, `ℹ fail 0`; `content: 85 of 88 …, 149 screens, 1903 fixtures`; `885 accepted and 1018 rejected`; `built 105 pages`; `next routes: 105 prerendered pages`; `verified 85 lesson pages, the index, the dashboard, the pricing page and 15 group pages — 4237 checks passed` | Retention touched grading, the static build, or the Next/legacy fragment parity. `built 105` and `next routes: 105` are the two that must **not** move: the four retention pages are Next-only and are not in the static build. |
| 2 | `node --test tests/retention.test.js tests/retention-write.test.js tests/retention-leaderboard.test.js tests/retention-challenge.test.js tests/retention-flashcards.test.js tests/retention-trend.test.js tests/flags.test.js` | `ℹ tests 169`, `ℹ suites 44`, `ℹ pass 169`, `ℹ fail 0` | A rule moved without a test: the award formula, the cap, the streak matrix, the board shaping, the challenge state machine, deck selection, the trend arithmetic, or the flag semantics. |
| 3 | `npx playwright test e2e/retention.spec.js e2e/flashcards.spec.js` | `9 passed` | `/daily` or `/daily/run` started painting a clock with no accounts, the pages entered the index, the challenge API guessed instead of refusing, or the deck stopped flipping on space / grading on an arrow. |
| 4 | `npx playwright test e2e/a11y.spec.js` | `19 passed` (one of them new: all four retention pages scanned in the state CI builds) | An axe scan hit a critical/serious finding. Not a substitute for looking at the populated board by hand — see failure mode 9. |
| 5 | `npm run db:check` | `Applying migration 0009…0012`, `ℹ tests 191`, `ℹ suites 48`, `ℹ pass 191`, `ℹ fail 0` | A migration does not apply on a clean database, a retention function or policy regressed, or the SQL and the JavaScript stopped agreeing. Hand-run: CI has no database. |
| 6 | `node --test tests/db/retention.spec.js`, then `… leaderboard.spec.js`, then `… challenge.spec.js` — one file at a time, because the spec reporter does not split a combined run | `26` / `12` / `24` tests, all passing — `62` assertions, the phase-5 slice of row 5 | The award, the streak transition, the boards or the challenge state machine regressed in SQL only, which row 2 cannot see. |
| 7 | `grep -rn "RETENTION_" app lib \| grep -v "lib/flags.js"` | no matches | A surface read a flag variable directly instead of asking `flagEnabled()`, which is how "an unknown value means on" stays true in one place. |
| 8 | `grep -rhoE "process\.env\.[A-Z_0-9]+" app lib proxy.js packages legacy/src scripts \| sort -u` | the same five literals as phase 4, and no sixth: `GIT_SHA`, `NEXT_PUBLIC_SITE_URL`, `PORT`, `STRIPE_SECRET_KEY`, `VERCEL_GIT_COMMIT_SHA`. The three flags do not appear because `flagEnabled` takes `env = process.env` as a default parameter and indexes it by name — the only place a flag's spelling lives | A new literal appeared. A flag read straight from `process.env` in a surface would also be a regression, though it would need row 7's grep to catch it. |
| 9 | `grep -rhE 'from "(\.\./)*lib/' $(grep -rl '^"use client"' app) \| sort -u` | three modules: `../lib/progress/sender.js`, `../lib/progress/migrate.js`, and `../../lib/retention/flashcards.js` (imported by `app/flashcards/deck.js`; the file has no imports at all and reads no env) | A client component reached a module that reads a server secret. `lib/flags.js` and `lib/retention/write.js` must never appear here. |
| 10 | `grep -rn "daily_disabled\|flashcards_disabled" app` | `app/api/daily/route.js:66`, `app/api/flashcards/route.js:41` — the first statement of each handler | A flag check moved below a read or below the auth check, so a switched-off surface started doing work before answering. |
| 11 | `npm run vendor:check` | `25 files match manifest.json` | The vendored reference copy drifted. Not inside `npm run check`; run it by hand. |
| 12 | Manual, configured build (`next build` with the local Supabase URL and anon key), `next start` with all three `RETENTION_*` set to `off`, signed in | `/daily` and `/daily/run` print the challenge sentence; `/flashcards` its own; `GET /api/flashcards` and `POST /api/daily` answer 404 `*_disabled`; `/account` contains no occurrence of "streak" while still printing points and the week trend; `/leaderboard` renders today's board and no `board-streaks` | A surface ignored the flag, or a switched-off surface still wrote. **Closed** — see the closure table. |
| 13 | Manual, the same build restarted with the variables removed | `Streak 1 day`, `Longest streak 1` and the `Streaks` region return, with no rebuild | The flag was read at build time on a configured deployment, which would make it useless during an incident. **Closed** — see the closure table. |
| 14 | Manual, k6 against a seeded 10,000-user dataset | leaderboard and submission p95 < 300 ms | The only row that needs a load generator this checkout does not have. **Still open.** |
| 15 | Manual, signed in, one screen finished | points rise by `award`, `Points today` moves, the streak lands on the first completion of the day and does not move on the second, `/account` reloads to the same numbers | The write path is broken end to end even though the RPC is proved. **Closed** — the week-panel live check measured `Points today 25`, `Points in total 50`, `Streak 1 day`. |
| 16 | Manual, the same challenge run submitted twice from the browser | the second submit is refused with a message and the stored score is unchanged | **Open at the UI layer.** The table (`challenge_attempts` unique key) and the route both refuse it, and `e2e/retention.spec.js` drives the API; nobody has clicked through twice. |
| 17 | `npx playwright test` (all 15 files, Chromium + the static build) | `92 passed` — was 91 before this review added the retention scan | Any other phase regressed under the retention work. This is the only row where the new a11y test exists at all; rows 3 and 4 are scoped. |

Rows 14 and 16 cannot be closed from this checkout. Rows 1–13, 15 and 17 are re-run in full by this
verification.

## Closure evidence (this verification run)

Run from `/Users/danil/Desktop/excelsupreme` on `phase-0-port-shell` (dirty: the whole phase-4 and
phase-5 tree is uncommitted by instruction), Node `v25.9.0` (macOS, arm64), no `.env.local`. Local
Supabase CLI 2.84.2, stack on ports 54350–54359. The configured-build rows 12 and 13 were run against a
`next build` with `NEXT_PUBLIC_SUPABASE_URL` and the anon key sourced, then `next start` with and
without the three flags; the env file was deleted afterwards.

| Row | Status | Evidence |
|---|---|---|
| 1 | **closed** | `npm run check` → `ℹ tests 1547`, `ℹ suites 198`, `ℹ pass 1547`, `ℹ fail 0`; `content: 85 of 88 catalogued lessons, 16 groups, 149 screens, 1903 fixtures replayed`; `✓ content passes — 885 accepted and 1018 rejected formulas agree with the grader`; `built 105 pages (10535.2 kB of HTML+CSS)`; `next routes: 105 prerendered pages match the shared templates`; `verified 85 lesson pages, the index, the dashboard, the pricing page and 15 group pages — 4237 checks passed` |
| 2 | **closed** | the seven files → `ℹ tests 169`, `ℹ suites 44`, `ℹ pass 169`, `ℹ fail 0` |
| 3 | **closed** | `npx playwright test e2e/retention.spec.js e2e/flashcards.spec.js` → `9 passed (3.2s)` |
| 4 | **closed** | `npx playwright test e2e/a11y.spec.js` → `19 passed (10.8s)`; the new scan is `the retention pages pass with nothing to fix`, over `/leaderboard`, `/daily`, `/daily/run`, `/flashcards` |
| 5 | **closed** | `npm run db:check` → twelve migrations applied from `0001` to `0012`, `ℹ tests 191`, `ℹ suites 48`, `ℹ pass 191`, `ℹ fail 0` |
| 6 | **closed** | retention `26` / `5` suites, leaderboard `12` / `3`, challenge `24` / `7` — `62` assertions, all passing |
| 7 | **closed** | `no matches` |
| 8 | **closed** | the five literals unchanged; `RETENTION_STREAKS`, `RETENTION_DAILY_CHALLENGE`, `RETENTION_FLASHCARDS` are read through `flagEnabled(name, env)` in `lib/flags.js` and nowhere else |
| 9 | **closed** | the three modules above. The addition is justified in place: `lib/retention/flashcards.js` has no imports and no environment read, so it cannot carry a secret into the bundle |
| 10 | **closed** | the two lines above, each the first statement of its handler |
| 11 | **closed** | `vendor: 25 files match manifest.json` |
| 12 | **closed** | Configured build, all three flags `off`, signed in as `alice@example.com`: `/daily` and `/daily/run` both rendered *The daily challenge is switched off on this deployment. The drills are unaffected.*; `/flashcards` rendered *Flashcards are switched off on this deployment. Your finished lessons are still recorded.*; `POST /api/daily` → `404 {"ok":false,"error":"daily_disabled"}`; `GET /api/flashcards?id=01-first-screen` → `404 {"ok":false,"error":"flashcards_disabled"}`; `/account` contained **zero** occurrences of "streak" in the accessibility tree while still printing `Points today 25`, `Points in total 50` and *66.7% of 6 screens first try, across 3 of the last 7 days*; `/leaderboard` rendered `region "Today's board"` and no `board-streaks` |
| 13 | **closed** | The same build restarted with the variables removed: `GET /api/flashcards` → `200`, `/flashcards` printed no "switched off" text, `/account` → `Streak 1 day`, `Longest streak 1`, `/leaderboard` → `region "Streaks"`. No rebuild between the two runs |
| 14 | **still open** | no k6 script and no 10k dataset exist. The largest board the suite seeds is 55 learners |
| 15 | **closed** | the week-panel live check: `Points today 25`, `Points in total 50`, `Streak 1 day`, `Longest streak 1`, and after a second seeded screen the points moved and the streak did not |
| 16 | **still open** | the table and the route both refuse a second run (`challenge_attempts` unique key, *"is idempotent, so a double submit cannot rewrite the score"*), and the API is driven by `e2e/retention.spec.js`; the browser was never clicked twice |
| 17 | **closed** | `npx playwright test` → `92 passed (19.5s)`. The 91 before it were the pre-review total; the +1 is `the retention pages pass with nothing to fix` |

## Baseline

| Metric | Value |
|---|---|
| Work items implemented | 7 of 7 (units 5a–5h) |
| Migrations | 4 added (`0009_retention_write` … `0012_retention_week`), 692 lines; 12 total |
| Tables | 4 added (`screen_awards`, `daily_challenges`, `challenge_attempts`, `challenge_answers`); `daily_points` and `streaks` predate phase 5 but had no write path until it |
| Policies | 3 added (`awards_self_read`, `challenge_day_read`, `challenge_attempt_self_read`); 37 grant/revoke statements |
| Functions | 16 (`award_points`, `touch_streak`, `retention_week`, `retention_daily_cap`, `learner_zone`, `lesson_number`, `implausible_day`, `leaderboard_flags`, `leaderboard_points`, `leaderboard_streaks`, `challenge_ensure`, `challenge_begin`, `challenge_answer`, `challenge_finish`, `challenge_rank`, `challenge_activity`) |
| Retention library | `lib/retention/` 8 files + `lib/flags.js`, 1392 lines |
| Phase-5 rule tests | 169 in 7 files, 44 suites (flashcards 39, retention 32, challenge 28, trend 27, write 20, flags 12, leaderboard 11) |
| Phase-5 database assertions | 62 in 3 specs, 15 suites (retention 26, challenge 24, leaderboard 12) |
| Phase-5 browser tests | 9 new (retention 4, flashcards 5); `e2e/a11y.spec.js` 18 → 19 |
| Pages | 4 (`/leaderboard`, `/daily`, `/daily/run`, `/flashcards`), Next-only: `built 105 pages` and `next routes: 105` are unchanged |
| Routes | 2 (`/api/daily`, `/api/flashcards`) |
| `/account` | gains the week panel and the streak rows; no route change |
| Environment variables | 3 new (`RETENTION_STREAKS`, `RETENTION_DAILY_CHALLENGE`, `RETENTION_FLASHCARDS`), all default-on, all server-only |
| Flag semantics | default on; only `off`/`0`/`false`/`no` (any case) disables; an unknown **value** stays on; an unknown **name** throws |
| Cache | leaderboard panels 60 s in-process; `/api/flashcards` no-store |
| Load | unmeasured (row 14) |
