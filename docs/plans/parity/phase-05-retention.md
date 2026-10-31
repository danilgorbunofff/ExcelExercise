# Phase 5 — Retention layer


> Part of the [reference-parity plan](00-overview.md). This file is self-contained:
> scope, work breakdown, acceptance criteria, tests and risks for this phase only.

**Duration:** 2 weeks · **Depends on:** phase 4 · **Blocks:** 9B

---

## Objective

Give learners a reason to come back tomorrow: points, streaks, daily leaderboards, a daily challenge
with a real ranking, flashcards over completed material, and a 7-day accuracy trend that makes
progress visible.

Reference behaviour being reproduced: daily points, streak leaderboards, a curated daily challenge
with one attempt per user and accuracy-then-time ranking, and flashcards as the end-of-curriculum
surface.

## Scope

- Points: `random(1..5) × lessonNumber` per correct answer, daily total, reset at local midnight.
- Streaks: current, longest, last day; increment on first completion of a day.
- Leaderboards: top 3 by points today, top 3 by streak today, plus the learner's own rank.
- Daily challenge: cron-created, 5 topics, timed run, one attempt per day, ranking, share card.
- Flashcards: spaced repetition over completed lessons only.
- Accuracy trend: last 7 days from `lesson_progress`/`attempts`.

## Out of scope

- Cash prizes, badges beyond streaks, referral credits (9B).
- Push notifications / email digests (post-launch; note the hook in phase 10).
- Social features (following, comments).

## Work breakdown

1. **Points.** Server-authoritative: the client reports `screen_complete`, the server computes the
   award (`random(1..5) × lessonNumber`), writes `daily_points`, returns the new total. Never trust a
   client-supplied number. Cap per screen and per day to prevent farming.
2. **Streaks.** On the first completed lesson of a day, `streaks.current += 1` if `last_day` is
   yesterday, reset to 1 if older, keep `longest`. Timezone: use the learner's profile timezone with
   UTC fallback, and document it.
3. **Leaderboard panels.** Three queries behind `security definer` views:
   `leaderboard_points(day)`, `leaderboard_streaks(day)`. Return top 3 + `my_rank`. Cache 60 s.
   Anti-cheat: ignore rows with implausible accuracy (100% first try across >20 screens in <30 s) —
   flag for review rather than silently deleting.
4. **Daily challenge.**
   - `db/jobs` cron at 00:00 UTC creates `daily_challenges(day, topics[])` by sampling from a curated
     topic list, weighted to recently active groups;
   - `/daily` shows today's topics, rules, attempt state;
   - `/daily/run` reuses the player with a 10-screen set built from those topics, no hints, 15-minute
     cap;
   - submission writes `challenge_scores(accuracy, ms)`; unique `(challenge_id, user_id)` makes a
     second attempt fail loudly, not silently;
   - ranking: accuracy desc, then ms asc; ties broken by `submitted_at`;
   - share card: OG image generated at `/api/og/challenge/[day]?u=...`.
5. **Flashcards.** `/flashcards` draws from completed lessons only: front = prompt + grid snapshot,
   back = formula + one-line explanation. SM-2 lite scheduling in `localStorage` first; server
   scheduling post-launch. Keyboard: space to flip, arrows to grade.
6. **Accuracy trend.** Small sparkline on the dashboard fed by a single 7-day aggregate query; no new
   table.
7. **Feature flags.** `streaks`, `dailyChallenge`, `flashcards` flags so a slip in one does not block
   launch.

## Acceptance criteria — evidence table (2026-10-31)

Rewritten as an evidence table on **2026-10-31** from the checklist it replaces. Verdicts, witnesses and the build items (B1–B14) are defined in [`reviews/completeness-2026-10-31.md`](reviews/completeness-2026-10-31.md). A row marked **Proven** names a witness this review re-ran: a `path:line` inside a test that executed (the strongest), a `gate:<script>` the review ran green, or an `artifact:<path>` whose existence is the whole claim (a document, a config file). No row is left grey.

| ID | Criterion | Verdict | Witness | State exercised | Decision |
| --- | --- | --- | --- | --- | --- |
| p5-68 | Points reset at local midnight, survive a TZ change | Proven | `tests/retention.test.js:108,115,121` (M7) | unit + DB | — |
| p5-69 | Two users see the same leaderboard, own rank at 1/3/50 | Built, unproven | `tests/db/leaderboard.spec.js:113,142`; no runtime board (accounts off) | DB only, ungated | Build B1 |
| p5-70 | Second challenge submission rejected with a clear message | Built, unproven | `tests/db/challenge.spec.js:146`; `tests/retention-challenge.test.js:96` (M28b) | DB + unit, no UI | Build B1 |
| p5-71 | Challenge ranking: accuracy then time, 20 seeded rows | Built, unproven | `tests/db/challenge.spec.js:183`; `tests/db/leaderboard.spec.js:237` | DB only | Build B1 |
| p5-72 | Flashcards never surface an incomplete lesson | Proven | `tests/retention-flashcards.test.js:101` (M26) | browser (`e2e/flashcards.spec.js`) | — |
| p5-73 | A cheater row is flagged, not displayed | Built, unproven | `tests/db/leaderboard.spec.js:180` | DB only | Build B1 |
| p5-74 | Dashboard trend renders with 0, 1 and 7 days of data | Built, unproven | `tests/retention-trend.test.js:45` (M25) proves the maths; no run renders the 1-day and 7-day states | unit only | Build B1 |
| p5-75 | Retention queries p95 < 300 ms at 10k users | Absent | no load harness, no fixture generator, no threshold | n/a | Defer: no load profile at launch volume; trigger 1 000 DAU |

## Test plan

| Area | Tests |
|---|---|
| Points | unit: award formula, caps, day rollover, timezone edge |
| Streak | unit: first day, consecutive, gap of 1, gap of 2, DST boundary |
| Leaderboard | integration: seeded 100 users, ordering + rank |
| Challenge | integration: create → attempt → duplicate rejected → ranking; e2e run |
| Flashcards | unit: selection excludes incomplete; e2e flip/grade |
| Load | k6 script for leaderboard + submission |

## Risks

| Risk | Mitigation |
|---|---|
| Leaderboard cheating | server-authoritative scoring + heuristic flags + manual review queue |
| Streak pressure feels punitive | no streak-loss warnings, no red UI, streak is a side stat not a gate |
| Challenge content cost | topics reuse existing screens; no bespoke authoring |
| Timezone bugs | single `user_timezone` source, tested across DST boundaries |

## Unit log

This section is the per-unit record: gate output, deviations, defects found, and the acceptance rows
each unit closes. The rolled-up verification plan is
[`reviews/phase-05-retention-verification-plan.md`](reviews/phase-05-retention-verification-plan.md):
it records which acceptance rows this checkout can close (13 of 15 gate rows) and the two it cannot —
the 10,000-user p95 and a second submit clicked through the UI.

### 2026-11-04 — unit 5a: the points rule and the streak transition, as pure functions

**Closed:** the server-side half of work item 1 (points) and work item 2 (streaks) that does not need a
database, and the "reset at the learner's local midnight and survive a timezone change gracefully"
acceptance criterion's arithmetic.

`lib/retention/points.js` holds `DAILY_CAP = 500`, `parseLessonNumber` (one hyphen-delimited number,
so `01-sum-basics` → 1 and `sql-04-lookups` → 4; `project-ufo` → `null`), `pointsAward` (the
`random(1..5) × lessonNumber` draw, injected so the range is provable rather than plausible),
`capDailyPoints`, and `dayKey`. `lib/retention/streak.js` holds `streakAfter` and the date helpers.
`tests/retention.test.js` is 32 tests / 6 suites, and imports both modules rather than restating them.

`dayKey` formats a calendar date with a cached `Intl.DateTimeFormat` per timezone and falls back to UTC
for a zone `Intl` rejects, so the comparison is between two `YYYY-MM-DD` strings and a DST day cannot be
23 hours long. A corrupt stored `last_day` is normalised to `null` rather than kept: the defect the
tests caught, which froze a run forever instead of starting a new one.

### 2026-11-04 — unit 5b: the award and the streak, atomically, in SQL

**Closed:** the write half of work items 1 and 2 — the parts that need a lock.

`supabase/migrations/0009_retention_write.sql` adds `screen_awards` (primary key
`(user_id, day, lesson_id, screen_id)`, so a screen pays once a day), `lesson_number(text)`,
`retention_daily_cap()`, `award_points(...)` and `touch_streak(...)`. `award_points` clamps the award to
`5 × lesson_number` so a dishonest caller gains nothing, claims the screen with `on conflict do
nothing`, and computes the day's remaining headroom after `select … for update` on the day row.
`touch_streak` is the SQL spelling of `streakAfter`, including the rule that a day *behind* `last_day`
leaves the run alone. All three functions are `revoke`d from `public`, `anon` and `authenticated` and
granted to `service_role`. `tests/db/retention.spec.js` (17 tests / 4 suites) runs the same matrix
through both spellings and asserts equality, asserts `retention_daily_cap() = DAILY_CAP`, and asserts a
learner cannot write `streaks` or call the RPCs.

The rule is deliberately duplicated in JS and SQL — JS for cheap tests and the route, SQL for the
atomic claim — and the shared matrix is what makes the duplication safe.

```
$ npm run db:check
Applying migration 0001_accounts_schema.sql ... 0009_retention_write.sql
Seeding data from supabase/seed.sql
ℹ tests 146
ℹ suites 37
ℹ pass 146
ℹ fail 0
```

### 2026-11-04 — unit 5c: the progress write pays, and never fails the batch

**Closed:** work items 1 and 2 on the request path.

`lib/retention/write.js` decides only the small questions: `payableScreens` drops an attempt whose
reference answer was used and one with no screen id (it could never be claimed twice and would pay on
every replay), `learnerTimezone` reads the profile's zone through the service client already in hand
(UTC when it is missing — `currentUser()` returns the auth user, not the profile), and `creditBatch`
short-circuits a `replayed` batch, where the claim is already spent.

`POST /api/progress` calls it after `writeBatch` has committed, inside `try/catch`, and returns
`points` and `streak` (`null` when absent). A refusal is a `console.error`, not a status: asking a
browser to re-send a batch it already landed, to collect points, would be a worse trade than losing a
day's points. `tests/retention-write.test.js` (19 tests / 6 suites) drives it with a recording client:
the payable set, the day in the learner's zone, the replay, and — with the RPC failing — that the
module returns a value instead of throwing.

```
ℹ tests 1429
ℹ suites 166
ℹ pass 1429
ℹ fail 0
content: 85 of 88 catalogued lessons, 16 groups, 149 screens, 1903 fixtures replayed
✓ content passes — 885 accepted and 1018 rejected formulas agree with the grader
built 105 pages (10535.2 kB of HTML+CSS) → /Users/danil/Desktop/excelsupreme/legacy/dist
next routes: 105 prerendered pages match the shared templates
verified 85 lesson pages, the index, the dashboard, the pricing page and 15 group pages — 4237 checks passed
82 passed (21.4s)          # npx playwright test
vendor: 25 files match manifest.json
```

### 2026-11-05 — unit 5d: three ranked places, and one honest viewer

**Closed:** work item 4 (leaderboards), top three plus the viewer's own line.

`0010_leaderboards.sql` ranks inside the database. `leaderboard_points(p_day, p_user, p_limit)` and
`leaderboard_streaks(...)` both compute `row_number() over (order by … desc, username asc, user_id asc)`
and take the first `p_limit` rows; `is_me` is the only column that depends on `p_user` and it is never
part of the sort, so two learners asking the same question see the same list in the same order. The
viewer's own row is returned from the same result set — a `left join` against their rank — so a learner
at 50th place can see their place without the board growing.

Flagged rows are excluded from the ranking window rather than hidden after the fact, so a removed cheat
leaves no visible hole in the ranks. `implausible_day(user, day)` is the heuristic: more than 20 screens
in one local day, every one correct first try, no help, and less than 30 seconds from the first screen
starting to the last one ending. `leaderboard_flags(p_day)` is the review queue, service-role only,
paired with `learner_zone()` so "one day" means the learner's day. The streak board deliberately has no
flag column: the heuristic measures accuracy against the clock, and a streak has no clock — recorded
here as a deviation rather than silently omitted.

`lib/retention/leaderboard.js` shapes the two answers into `{points, streaks}` and caches them per
learner per day for 60 s; an error is not cached, so a refusal is retried on the next request.
`/leaderboard` is the Next-only page for it — the drill pages are byte-pinned, so the board lives next
to `/account` (`proxy.js` gates it, `/account` links to it). It renders a table per board with
`aria-current="true"` on the viewer's row, states plainly when the viewer is flagged, and says
"under review" rather than accusing anyone.

`tests/db/leaderboard.spec.js` (12 tests / 3 suites) asserts the ordering contract directly: the same
list for two viewers, ties broken by username, own rank at 1st / 3rd / 50th, no own row when unscored,
the `p_limit` clamp, a flagged learner dropped and queued, an honest day not flagged, and that a learner
may read the board but not call the heuristic. `tests/retention-leaderboard.test.js` (11 tests / 2
suites) covers the module over a fake that computes `is_me` from `p_user`, including that it accepts a
single-row answer and that it does not cache errors.

```
$ npm run check
ℹ tests 1440
ℹ suites 168
ℹ pass 1440
ℹ fail 0
content: 85 of 88 catalogued lessons, 16 groups, 149 screens, 1903 fixtures replayed
✓ content passes — 885 accepted and 1018 rejected formulas agree with the grader
built 105 pages (10535.2 kB of HTML+CSS) → /Users/danil/Desktop/excelsupreme/legacy/dist
next routes: 105 prerendered pages match the shared templates
verified 85 lesson pages, the index, the dashboard, the pricing page and 15 group pages — 4237 checks passed

$ npx playwright test
82 passed (16.2s)

$ npm run vendor:check
vendor: 25 files match manifest.json

$ npm run db:check
Applying migration 0010_leaderboards.sql
Seeding data from supabase/seed.sql
ℹ tests 158
ℹ suites 40
ℹ pass 158
ℹ fail 0
```

### 2026-11-05 — unit 5e: a challenge a day, graded by the server

**Closed:** work item 4 (daily challenge) except the share card, plus the "second submission is rejected
and does not overwrite the first" and "ranking matches accuracy then time" acceptance rows.

`supabase/migrations/0011_daily_challenge.sql` adds `daily_challenges(day, topics, seed)`,
`challenge_attempts(day, user_id, …)` with `unique (day, user_id)` and `challenge_answers` with
`primary key (attempt_id, screen_id)`. Six `security definer` RPCs sit behind them: `challenge_ensure`
(sample and store the day's five topics once — a stored row always wins, so a re-run cannot reshuffle
a day), `challenge_begin` (create-or-resume, keeping the original `started_at` so closing the tab does
not reset the clock), `challenge_answer` (record the verdict, `on conflict do nothing` so the first
verdict per screen is final), `challenge_finish` (accuracy over the challenge size, `ms` clamped to the
15-minute cap, idempotent), `challenge_rank` (accuracy desc → ms asc → finished_at asc → user_id,
unfinished attempts excluded, own rank even when it falls outside the limit) and `challenge_activity`
(the 7-day window the topic weighting reads). Only `challenge_rank` is granted to `authenticated`;
everything else is `service_role`, so the browser cannot write a score or read another learner's answers.

`lib/retention/challenge.js` is the one place the size (`10`), topic count (`5`) and cap (`900 s`) are
defined, and everything else derives from it: `hashSeed`/`seededRandom` make the day deterministic
(same day, same challenge, no cron), `groupWeights` weights the five topics by activity over the last
7 days with a floor of 1 so a dormant group is still eligible, `sampleTopics` draws distinct topics,
`pickScreens` draws one screen per lesson so a ten-screen run is ten different lessons, and
`challengeSpec` composes both. `screenPayload` is the only projection the browser ever sees: it drops
`expect`, `answers`, `reference`, `hints`, `fixtures`, `require` and `requireRef` and rewrites images to
`/assets/img/<file>` — the challenge is graded by the server, so a run with no hints still has to be a
run the learner can answer. `gradeScreen` reuses `revealOf` from the normal player, which is why it
takes the lesson rather than a bare screen. `msLeft` reads the server's `started_at` against
`Date.now()`, so there is no client-side countdown to drift.

`app/api/daily/route.js` is the only grader: `start` ensures the challenge, begins or resumes the
attempt and returns the payload plus `left`; `answer` grades one screen and returns `{ok, rule,
expected}`; a finished attempt short-circuits to the score rather than accepting more answers, and
`left === 0` finalizes as `timeUp`. It is deliberately absent from `proxy.js`'s `GATED` list — its own
`401` is what the run surface renders. `/daily` shows the day's topics, the rules and the board, and
never calls `beginRun`, so looking at the page does not start the clock. `/daily/run` is a client
component that POSTs `start` on mount, resumes at `payload.answered`, keeps one interval against a
`deadline` ref, posts `{screenId, value}` per screen, shows the verdict and the correct answer, and on
expiry offers a single button that re-POSTs `start` (the server finalizes and returns the score).

Two defects surfaced while writing the tests, both fixed at the cause:

- `sampleTopics` bound its loop with `Math.min(count, remaining.length)` and re-evaluated it against the
  shrinking array, so asking for 15 topics out of 15 returned 8. The production `count: 5` path never
  hit it; the bound is now computed once before the loop.
- `0011`'s comment said `first` describes "the first answer for this screen", but the code computed it
  as "this answer was correct". It is now `insert … on conflict do nothing returning true into v_first`,
  so `first` means what the file says it means.

`tests/retention-challenge.test.js` (28 tests / 11 suites) covers the deterministic draw end to end:
same day → same topics and screens, different day → different draw, five distinct live groups, cold
groups weighted lower but still drawn, one screen per lesson, no infinite loop when a topic is short on
eligible screens, the payload projection leaks nothing it should not, `decodeScreens` drops stale or
malformed keys, and `gradeScreen` agrees with the normal player on accept/reject, on picture screens,
and on an empty answer. `tests/db/challenge.spec.js` (24 tests / 7 suites) asserts the SQL contract
directly: a stored challenge is not reshuffled, `begin` refuses `not_started` until `ensure` has run and
keeps `started_at` on resume, `answer` keeps the first verdict and refuses an unknown screen, a
not-started run and a finished run, `finish` computes accuracy over the challenge size and is
idempotent, `rank` orders 12 seeded players by accuracy then ms then submission time, `activity` counts
only the window, and the grants hold (a learner can read the rank and its own attempt row, `anon` gets
401, `challenge_answers` is 403). `e2e/retention.spec.js` (4 tests) covers the state a checkout without
Supabase actually serves: both pages show the "accounts are off" notice, neither offers a submit
button, both are `noindex`, and `POST /api/daily` answers `503 {ok:false,error:"daily_unconfigured"}`
rather than pretending.

Deviations from the plan text, recorded rather than silently dropped:

- **No cron.** There is no scheduler in this deployment (no `pg_cron`), so the 00:00 UTC job became a
  lazy `challenge_ensure` on first request for the day. The observable the plan asks for — exactly one
  challenge per day, deterministic from the day seed — holds; a learner who is first to arrive at
  00:00:03 gets the same ten screens as one who arrives at 23:00.
- **`challenge_scores` is `challenge_attempts`.** The attempt row *is* the score (`correct`, `answered`,
  `accuracy`, `ms`), so a second attempt fails loudly on `unique (day, user_id)` instead of existing as
  a separate row that could drift.
- **No OG share card.** `/api/og/challenge/[day]?u=…` was not built; there is no OG route anywhere in the
  app yet, and adding an image renderer would be new machinery for one card. `/daily` is the shareable
  surface for now — `metadata` there is indexable, `/daily/run` is not.

```
$ npm run check
ℹ tests 1468
ℹ suites 179
ℹ pass 1468
ℹ fail 0
content: 85 of 88 catalogued lessons, 16 groups, 149 screens, 1903 fixtures replayed
✓ content passes — 885 accepted and 1018 rejected formulas agree with the grader
built 105 pages (10535.2 kB of HTML+CSS) → /Users/danil/Desktop/excelsupreme/legacy/dist
next routes: 105 prerendered pages match the shared templates
verified 85 lesson pages, the index, the dashboard, the pricing page and 15 group pages — 4237 checks passed

$ npx playwright test
86 passed (17.7s)

$ npm run vendor:check
vendor: 25 files match manifest.json

$ npm run db:check
Applying migration 0011_daily_challenge.sql...
ℹ tests 182
ℹ suites 47
ℹ pass 182
ℹ fail 0
```

Next build's route table gains `○ /daily`, `○ /daily/run` and `ƒ /api/daily`; `next routes: 105` does
not move because `scripts/check-next-pages.mjs` diffs a fixed page list against the legacy templates,
and these three pages have no legacy counterpart to diff against.

### 2026-11-05 — unit 5f: the finished lessons, one card at a time

**Closed:** work item 5 (flashcards) and the acceptance row *Flashcards never surface a lesson that is not
marked complete*.

`/flashcards` draws only from lessons the learner has finished, and "finished" has two homes: an account
reads `lesson_progress` under its own RLS (`status = 'complete'`, capped at 50 lessons), and a signed-out
browser reads `es.progress` — the same store the drill writes, so the deck works with no Supabase at all.
`app/flashcards/page.js` collects both and passes the ids down; nothing on the server filters by
completion, because it already only ever receives completed ids. An account-less deployment says so
(`Accounts are off here, so your cards come from this browser only.`), which is the honest version of the
acceptance criterion *Flashcards never surface a lesson that is not marked complete*.

The card builder is `lib/retention/cards.js`: `CARD_CAP = 60`, `cardFor` reads a screen through
`revealOf` — so the back of a formula card is the reference the drill itself reveals, and a picture card's
back is its `expect.value` — plus `firstSentence(lesson.docs.explain)` for the one-line explanation and
`/assets/img/<file>` for the snapshot, and `buildDeck` dedupes ids, drops unknown ones, skips screen types
that cannot be a card (`eligibleScreen`) and stops at the cap. `app/api/flashcards/route.js` exposes it as
`GET ?id=…&id=…` (≤50 lessons, `400 no_lessons` when asked for nothing) and is deliberately *not* in
`proxy.js`'s `GATED` list: the content is public and the deck already works signed out.

The schedule is `lib/retention/flashcards.js`, which is split from the builder for a build reason, not a
design one: a `"use client"` module may not transitively import `node:fs`, and the builder needs
`packages/content`. Turbopack refused to write `/flashcards` while they shared one file
(`Failed to write app endpoint /flashcards/page … does not support external modules (request: node:fs)`).
So `flashcards.js` is content-free and `deck.js` imports only it and `legacy/src/client/state.js`.
`gradeCard` is SM-2 lite: `again` → interval 0, due now, `lapses + 1`, ease −0.2, `reps` 0; `hard` → ease
−0.15 and `interval × 1.2`; `good` → 1 day, 3 days, then `interval × ease`; `easy` → ease +0.15 and
`interval × ease × 1.3`, with ease clamped to 1.3–3.5 and interval to 0–365 days. It never mutates its
input and treats an unknown grade as `good`. `queue` draws due cards oldest-first and then unseen ones up
to `SESSION_CAP = 20`, so `again` really does bring a card back at the head of the next session. A card is
graded only when it is face up, and both the keys (space/enter to flip, ←↓→↑ to grade) and the four
buttons call the same `grade`.

Three defects surfaced in the browser and were fixed at the cause, not in the assertions:

- The empty state rendered a second `Your drills` link next to the card's own link list, so the page had
  two identical links (a strict-mode violation, and a duplicate for a screen reader). The deck now leaves
  that link to the page.
- Reloading with nothing due reused the "session finished" state and told the learner *You went through 0
  cards this session*. It now says *Nothing is due right now* when no session ran, and keeps the
  next-due date.
- `done` recomputed `deckStatus` for the next date instead of reusing the status already on screen; one
  call now feeds both the counter and the date.

`tests/retention-flashcards.test.js` (39 tests / 8 suites) covers the split at both ends: `cardFor` on a
formula screen uses the reference and on a picture screen the expected value, a screen without an eligible
type yields nothing, `buildDeck` dedupes, drops unknown ids, respects the cap and builds a real card for
`27-what-a-formula-actually-does`; `completedLessons` is newest-first, ignores a completion with no date
and turns garbage into `[]`; `gradeCard` walks 1 → 3 → `interval × ease`, clamps both bounds, treats an
unknown grade as `good` and does not mutate; `queue`/`deckStatus`/`parseDeck` are exercised against
hand-edited schedules. `e2e/flashcards.spec.js` (5 tests) proves what only a browser can: an empty
`es.progress` explains itself and offers no card, one finished lesson becomes `Card 1 of 1` whose front
hides the answer and whose space-flip reveals `=SUM(B2:B4)`, an arrow grades it and the reload does not ask
again, the buttons do the same job over two cards, `again` brings the card back through *Check what is
due*, and the API answers `400`/`[]`/one-eligible-card for no id, an unknown id and a mixed-type lesson.

Deviations, recorded rather than silently dropped:

- **Scheduling is per browser.** `localStorage` under `es.flashcards` (`{v: 1, cards: {key: state}}`), as
  the plan allows for the first cut. There is no new table and no `0012` migration, so `db:check` stays at
  182. A learner who clears storage starts over; nothing else regresses, since the deck is derivable from
  progress at any time.
- **No new gate row for `es.flashcards` writes.** A browser in private mode cannot persist grades; the
  deck catches the throw and runs the session anyway, unremembered. The dashboard's storage-blocked
  warning already covers the general case, and the drill's is its own unit (5a-adjacent), not this one.
- **`/flashcards` is not behind `proxy.js`.** It has to work for a signed-out learner with local progress,
  and the account path is additive. `robots: noindex` is the same call `/daily` makes.

```
$ npm run check
ℹ tests 1507
ℹ suites 187
ℹ pass 1507
ℹ fail 0
content: 85 of 88 catalogued lessons, 16 groups, 149 screens, 1903 fixtures replayed
✓ content passes — 885 accepted and 1018 rejected formulas agree with the grader
built 105 pages (10535.2 kB of HTML+CSS) → /Users/danil/Desktop/excelsupreme/legacy/dist
next routes: 105 prerendered pages match the shared templates
verified 85 lesson pages, the index, the dashboard, the pricing page and 15 group pages — 4237 checks passed

$ npx playwright test
91 passed (17.4s)

$ npm run vendor:check
vendor: 25 files match manifest.json

$ npm run db:check
Applying migration 0011_daily_challenge.sql...
ℹ tests 182
ℹ suites 47
ℹ pass 182
ℹ fail 0
```

The Next route table gains `○ /flashcards` and `ƒ /api/flashcards`; `next routes: 105` does not move,
because `scripts/check-next-pages.mjs` diffs a fixed page list against the legacy templates.

### 2026-11-05 — unit 5g: the week, in one query, on the page Next owns

**Closed:** work item 6 (accuracy trend) and its acceptance row *Dashboard trend renders with 0, 1 and 7 days
of data*.

The row names the dashboard, and the dashboard cannot take it: `/learn` is rendered by
`prepareDashboardPage` from the legacy templates and then byte-diffed by `scripts/check-next-pages.mjs`
against the static build, so any panel added there fails `next routes: 105` by construction. The trend
therefore lives on `/account` — the nearest Next-owned page that is already gated, already
`instant = false`, and already rendered inside `AuthCard`. That is a recorded deviation, not a dropped
row, and it is the side of the parity line the rest of phase 5 (leaderboard, challenge, flashcards) has
already chosen.

The data is one round trip. `supabase/migrations/0012_retention_week.sql` adds
`retention_week(p_days int default 7) returns jsonb`: `stable security definer`, `search_path` pinned,
days bucketed as `(a.ended_at at time zone z.name)::date` where `z.name` is `learner_zone(auth.uid())` —
the same validated-`pg_timezone_names`-or-UTC fallback 0010 uses for points and streaks, so all three
agree on when midnight is. Gaps are filled with `generate_series` and a left join, so a day with nothing
in it arrives as `{screens: 0, firstTry: 0}` and the caller never has to invent one. `p_days` is clamped
`least(greatest(coalesce(p_days, 7), 1), 30)`. Points and the streak are read straight from the tables that
already hold them (`pointsToday` is the row for today, `pointsTotal` is every day the learner ever had).
`attempts` was indexed only by `(user_id, lesson_id)` — the drill's question — so the migration adds
`attempts_user_ended_idx (user_id, ended_at)`; a week asks a different question and would otherwise scan
every attempt a learner has ever made. The function is revoked from `public, anon` and granted to
`authenticated`, so a signed-out browser cannot ask about anybody.

`lib/retention/trend.js` is the half that has to be true in a browser, and it is pure: `TREND_DAYS = 7`,
`accuracyOf(screens, firstTry)` returning `null` rather than `0` when nothing was attempted (a day off is
not a wrong answer), `trendSeries` answering exactly `days` entries oldest-first whatever it is handed —
out-of-window rows dropped, duplicate days summed, unreadable days skipped — `trendTotals` counting only
days that had a screen, and `weekView` re-deriving the window from the `day` the database sent so a short
series (or none, on a fresh account) still renders a week. `sparkPoints` spreads one point per *studied*
day, skipping the empty ones so the line reads as what happened and not as a dip, rounds to two decimals,
and `sparkPath` turns those into the `d` an inline `<path>` needs. Every function takes its `today` as an
argument, which is what makes the 0-, 1- and 7-day cases provable instead of needing a clock.

`app/account/week.js` renders it: the four totals in the existing `.auth-profile` `dl`, then either
*Nothing was attempted in the last seven days…* or a headline (`X% of N screens first try, across K of the
last 7 days.`) and an inline `<svg role="img">` with one circle per studied day. The day labels are built
in UTC from the day string the database sent, so a device in a different zone cannot shift the label away
from the bucket it describes; the `aria-label` names every studied day and its percentage, so the chart is
not a picture with no words. `app/account/page.js` asks for it as the third read in the same `Promise.all`
as the profile and the entitlement, and an RPC error renders *Your week could not be read just now.
Nothing is lost — reload to see it.* instead of a zeroed panel that would read as "you did nothing".
Styles are five rules in `app/auth.css` (`.auth-week`, its `h2`, `-headline`, `-empty` and `.auth-spark`,
full width, `height: auto`, `stroke`/`fill` `var(--text)`), inside `AuthCard`'s 26rem.

Two defects surfaced while proving it, and both were fixed at the cause:

- An attempt dated in the future — a clock that ran fast — was excluded from the series but not from the
  `counted` CTE, so the day the page highlighted and the totals it printed came from different row sets.
  The CTE now bounds `<= today` as well.
- The cross-language assertion caught the test itself: `accuracyOf` takes `(screens, firstTry)` and the
  new spec called it the other way round, which the unit tests could not notice because they only ever
  pass values where the two orders agree. That assertion stays, because it is the only thing in the suite
  that compares the SQL's arithmetic with the JavaScript's on the same rows.

Evidence: `tests/retention-trend.test.js` (27 tests / 7 suites) holds the arithmetic — `shiftDay` across a
month and a year boundary, `accuracyOf` on no screens, rounding and clamping, `trendSeries` for 0, 1 and 7
days with out-of-window, duplicate, unreadable and negative rows, clamping of `days`, `weekView` on a null
payload and on a short series, and the sparkline's single point, top, bottom and skipped gaps.
`tests/db/retention.spec.js` gains the SQL contract (9 tests / 1 suite): seven rows oldest-first ending
today; the caller's screens and nobody else's, asserted as deltas from a baseline so another spec's
inserts cannot tip it; a day with nothing kept at zero while every other day is unchanged; attempts seven
days old and two days ahead both excluded; the same instant bucketed as Auckland's day and as UTC's, one at
a time; points and streak passthrough with `pointsToday` from today only and `pointsTotal` from every day;
the SQL and `weekView`/`accuracyOf` agreeing on one payload; `p_days` clamped at 1, 0, −5, 30 and 500; and
`anon` refused. `e2e/auth.spec.js` adds the state CI runs in: with accounts off `/account` renders no week
panel and no sparkline, because nothing was read and nothing should pretend otherwise.

```
$ npm run check
ℹ tests 1534
ℹ suites 194
ℹ pass 1534
ℹ fail 0
content: 85 of 88 catalogued lessons, 16 groups, 149 screens, 1903 fixtures replayed
✓ content passes — 885 accepted and 1018 rejected formulas agree with the grader
built 105 pages (10535.2 kB of HTML+CSS) → /Users/danil/Desktop/excelsupreme/legacy/dist
next routes: 105 prerendered pages match the shared templates
verified 85 lesson pages, the index, the dashboard, the pricing page and 15 group pages — 4237 checks passed

$ npx playwright test
91 passed (17.3s)

$ npm run vendor:check
vendor: 25 files match manifest.json

$ npm run db:check
Applying migration 0012_retention_week.sql...
ℹ tests 191
ℹ suites 48
ℹ pass 191
ℹ fail 0
```

`next routes: 105` and `built 105 pages` do not move: `/account` is not in the list
`scripts/check-next-pages.mjs` diffs, and the panel adds no route of its own.

### 2026-11-05 — unit 5h: three kill switches, so a slip in one cannot sink the launch

Work item 7. Three flags — `streaks`, `dailyChallenge`, `flashcards` — each able to turn its own
retention surface off on a running deployment without a rebuild, so that a defect in one of them is a
degraded feature rather than a launch blocker. The flags are read from the environment, never from the
database, because an incident must be closable by changing one variable and restarting, not by a
migration.

`lib/flags.js` is the whole mechanism, 110 lines: `FLAG_VARIABLES` pins the three environment names
(`RETENTION_STREAKS`, `RETENTION_DAILY_CHALLENGE`, `RETENTION_FLASHCARDS`), `FLAG_COPY` holds the one
sentence each surface prints when it is off, and `flagEnabled(name, env = process.env)` answers the
question. Three decisions are deliberate:

- **Default on.** Only `off`, `0`, `false` and `no` disable a flag, case- and space-insensitive.
  Anything else — a typo, an empty string, `disable` — leaves the feature on, because an environment
  variable that was meant to close a hole and instead silently hides a working feature is the worse
  failure. A missing variable is also on: every deployment that never heard of these flags behaves
  exactly as it did before this unit.
- **Unknown names throw.** `flagEnabled("streak")` raises `TypeError: unknown feature flag: streak
  (known: streaks, dailyChallenge, flashcards)` rather than defaulting to on. A misspelled name in a
  code path is a bug, and it should be loud, unlike a misspelled value at runtime.
- **Server only.** Nothing is exposed as `NEXT_PUBLIC_`, so the browser cannot read a flag and cannot
  disagree with the server about one.

The flags are checked *before* authentication on every surface, so a disabled feature cannot leak a
"sign in to continue" state that the signed-in version then refuses. The wiring:

| Surface | Off |
| --- | --- |
| `POST /api/daily` | `404 {"ok":false,"error":"daily_disabled"}` |
| `GET /api/flashcards` | `404 {"ok":false,"error":"flashcards_disabled"}` |
| `/daily`, `/daily/run` | `AuthCard` + the daily sentence + a link to the drills |
| `/flashcards` | `AuthCard` + the flashcards sentence + a link to the lessons |
| `/account` | the `Streak` and `Longest streak` rows disappear; points and the week trend stay |
| `/leaderboard` | the `Streaks` board and its sentence disappear; points and today's board stay |

`lib/retention/write.js` takes the third flag too: `creditBatch(..., flags = retentionFlags())`, and the
streak half of the write is skipped when `flags.streaks` is off while the points are still paid. Hiding a
streak from the page but continuing to move it would make the flag a lie, and stopping the whole write
would lose the learner's points over a cosmetic feature.

Evidence: `tests/flags.test.js` (12 tests / 4 suites) holds the semantics — default on, every off
spelling, unrecognised values staying on, one flag not moving another, the unknown name throwing, and
`retentionFlags()` agreeing with `flagEnabled()` name for name; it also pins the three environment names
and the copy, and drives `/api/flashcards` both ways (200 with a real lesson id when on, 404 when off).
`tests/retention-write.test.js` gains the write-side case: with `flags: { streaks: false }` the batch pays
one screen, reports `streak.skipped === true`, and calls `touch_streak` zero times.

`/api/daily` is not unit-tested here, and cannot be: importing the route pulls in `lib/auth/server.js`,
which imports `next/headers`, which plain `node --test` cannot resolve. That surface is proved by the
page-level build and by `tests/db/challenge.spec.js` on the layer underneath, not by a fake request.

One property of this Next version is worth recording, because it decides how a flag can be proved:
route handlers always read `process.env` at request time, but a *page* reads it at request time only when
the page is dynamic. With accounts configured the four pages call `currentUser()` → `cookies()` and so run
per request; with accounts unconfigured they are static and the flag branch is baked into the prerender.
That is acceptable — those pages are inert without accounts — but it means the honest live proof needs a
configured build. It was done that way: `npx next build` with the local Supabase URL and anon key, then
`next start` with all three variables set to `off`, signed in as a seeded learner. `/daily` and
`/daily/run` printed *The daily challenge is switched off on this deployment. The drills are unaffected.*;
`/flashcards` printed its own sentence; the flashcards API answered 404; `/account` contained no
occurrence of the word "streak" at all while still showing `Points today 25`, `Points in total 50` and
*66.7% of 6 screens first try, across 3 of the last 7 days*; `/leaderboard` rendered today's board and no
`board-streaks` region. The same build restarted with the variables removed brought all of them back —
`Streak 1 day`, `Longest streak 1`, the `Streaks` region — with no rebuild, which is the property that
makes these switches usable during an incident.

```
$ npm run check
ℹ tests 1547
ℹ suites 198
ℹ pass 1547
ℹ fail 0
content: 85 of 88 catalogued lessons, 16 groups, 149 screens, 1903 fixtures replayed
✓ content passes — 885 accepted and 1018 rejected formulas agree with the grader
built 105 pages (10535.2 kB of HTML+CSS) → /Users/danil/Desktop/excelsupreme/legacy/dist
next routes: 105 prerendered pages match the shared templates
verified 85 lesson pages, the index, the dashboard, the pricing page and 15 group pages — 4237 checks passed

$ npx playwright test
91 passed (16.8s)

$ npm run vendor:check
vendor: 25 files match manifest.json

$ npm run db:check
ℹ tests 191
ℹ suites 48
ℹ pass 191
ℹ fail 0
```

`next routes: 105` and `built 105 pages` do not move: no flag adds a route, and the flag branches sit
inside pages `scripts/check-next-pages.mjs` does not diff.
