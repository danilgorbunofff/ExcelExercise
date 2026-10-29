# Phase 3 — Dashboard, categories, progression


> Part of the [reference-parity plan](00-overview.md). This file is self-contained:
> scope, work breakdown, acceptance criteria, tests and risks for this phase only.

**Duration:** 1.5 weeks · **Depends on:** phases 1, 2 · **Blocks:** phase 4

---

## Objective

Give the curriculum a front door: a dashboard that always answers "what do I do next", category pages
that show a syllabus, per-lesson badges that reflect real accuracy, and the gating rule that keeps
learners in order without feeling punished.

Reference behaviour being reproduced: completed count, category grid with per-category progress,
"next lesson" CTA, lesson-ordered gating, and four badge states.

## Scope

- `/learn` dashboard (Excel track; SQL gets the same component in phase 8).
- 14 category pages + a combined view on the dashboard.
- Lesson cards: number, title, group, badge, best score, accuracy, last played.
- Gating: a signed-out learner can start only lessons 1–3; signed in, only up to `highestCompleted + 1`.
- Recommendation: next incomplete lesson in the track's recommended order.
- Reset progress (double confirmation) and a feedback capture modal.
- Empty, loading and error states for every panel.

## Out of scope

- Points, streaks, leaderboards, daily challenge, certificates — later phases; the dashboard reserves
  their slots but does not fake data.
- SQL track UI (phase 8).
- Marketing pages.

## Work breakdown

1. **Progress read model.** One function `getProgressSummary(userId | null)` returning
   `{ completed, total, perGroup, perLesson, accuracy, nextLesson, staleCount }`. Local storage
   adapter now, Postgres adapter in phase 4 — the dashboard never knows which.
2. **Dashboard layout.**
   - header: completed X of 88, continue CTA, streak/points placeholders hidden behind a flag;
   - "Up next" card with the recommended lesson and why (next in order);
   - group grid: 16 tiles with title, `completed/total`, accuracy chip, "needs attention" if any
     lesson is stale or below 50%;
   - "Recent" list: last 5 lessons with badge + accuracy;
   - footer row: reset progress, feedback, certificate CTA (disabled until eligible).
3. **Badge state machine** (pure, unit-tested):
   `not_started → in_progress → complete` plus derived `needs_practice` (first-try accuracy < 50%)
   and `stale` (complete and `last_seen_at` ≥ 14 days). Precedence: stale > needs_practice >
   complete > in_progress > not_started.
4. **Category pages.** Static route per group, server-rendered syllabus table: number, title, badge,
   accuracy, duration estimate. Client island hydrates badges. Group intro copy from phase 1.
5. **Gating.** `canStart(lesson, progress, entitlement)`:
   - signed out → lessons 1–3 of the recommended order only, everything else shows a sign-in prompt
     on click (not a dead link);
   - signed in → `lesson.order <= highestCompletedOrder + 1`, otherwise "Complete lesson N first";
   - entitled → no order gating (reference keeps gating; we keep it too but allow direct links).
   Server-side enforcement lands in phase 4; this phase renders the same rule client-side.
6. **Recommendation.** Next incomplete lesson in recommended order; if all complete, CTA becomes
   "Daily challenge" (phase 5) and "Get your certificate" (phase 6) — both feature-flagged.
7. **Reset progress.** Confirm modal, typed confirmation, clears local progress and (phase 4) calls a
   server action; leaves certificate and payment records untouched.
8. **Feedback modal.** Textarea + page context, 500 char limit, posts to `/api/feedback`
   (phase 4 stores it; until then log + toast).
9. **SEO meta.** Dashboard is `noindex`; category pages are indexable with intro copy + syllabus.

## Acceptance criteria

- [ ] Signed-out learner sees lessons 1–3 open and every other row as a sign-in prompt that works.
- [ ] Signed-in learner's next lesson updates immediately after a completion.
- [ ] Badge precedence verified: a stale lesson never shows `COMPLETE`.
- [ ] Category counts sum to the track total; no lesson is in two groups.
- [ ] Dashboard renders in < 1 s on a throttled connection (no blocking client fetch for first paint).
- [ ] Empty state (new user) and error state (progress fetch fails) both designed and implemented.
- [ ] Reset progress asks twice and cannot be triggered by a stray keypress.

## Test plan

| Test | Type |
|---|---|
| Badge state machine, all 8 precedence combinations | unit |
| `getProgressSummary` with 0, 1, 87, 88 completions | unit |
| Gating matrix (signed out / signed in / entitled × first / next / future lesson) | unit |
| Category page renders N lessons, counts match | Playwright |
| Reset progress flow | Playwright |
| Dashboard a11y | axe |

## Risks

| Risk | Mitigation |
|---|---|
| Dashboard turns into a metrics wall | one job: "what next"; everything else secondary |
| Gating frustrates returning users | direct links still work when entitled; reset is available |
| Two sources of progress truth (local + server) | single read-model interface; adapter swap in phase 4 |
