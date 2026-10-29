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

## Acceptance criteria

- [ ] Points reset at the learner's local midnight and survive a timezone change gracefully.
- [ ] Two simulated users see the same leaderboard ordering; own rank is correct at rank 1, 3, 50.
- [ ] A second challenge submission is rejected with a clear message and does not overwrite the first.
- [ ] Challenge ranking matches the rule (accuracy desc, then time) in a seeded test with 20 rows.
- [ ] Flashcards never surface a lesson that is not marked complete.
- [ ] A cheater row is flagged, not displayed.
- [ ] Dashboard trend renders with 0, 1 and 7 days of data.
- [ ] All retention queries p95 < 300 ms at 10k users (seeded load test).

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
