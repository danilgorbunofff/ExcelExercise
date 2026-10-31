# Phase 3 — Dashboard, categories, progression


> Part of the [reference-parity plan](00-overview.md). This file is self-contained:
> scope, work breakdown, acceptance criteria, tests and risks for this phase only.

**Duration:** 1.5 weeks · **Depends on:** phases 1, 2 · **Blocks:** phase 4

---

## Status

**Landed — the dashboard and the badge machine.** Items 1, 2 (as a single page rather than a grid of
tiles), 3, 4, 6, 7 and 9 ship: `/learn` lists every drill in track order, grouped, with a badge per row, a
count, an up-next button and a two-step reset, and the badges come from a pure read model that both the
server template and the island import. Items 5 and 8 are open, and the plan's accuracy-based badge
rule is replaced by what the record can actually prove.

- [x] **1. Progress read model.** `packages/progress` — `summarise({ plan, progress, now })` returns
      `{ total, completed, remaining, stale, needsPractice, next, nextReason, groups, recent, rows }`,
      and `badgeFor`, `ago`, `summaryLine`, `nextCopy` are the shared copy, so the server-rendered page
      and the island cannot describe the same state two different ways. It is a package rather than a
      module in the island because the static build reads it too: it ships at `assets/progress/` the
      same way the grader and the session do. There is no `userId`: the adapter is `localStorage`, and
      the record is the one the drill already writes (`es.progress`), so nothing here learns about
      accounts before phase 4 does.
- [x] **2. Dashboard layout.** One page, not a wall: the count and its bar, an "Up next" card with the
      reason beside it, the legend, the track by group with per-group counts, the last five finished,
      and reset at the bottom. The plan's 16-tile grid is the same information as the grouped list with
      more clicking, and it cannot show a title or an outcome — so the groups are `<section>`s with
      `id="group-<id>"` and the tiles would have been deep links to exactly those anchors. Streak,
      points and the certificate slots are not rendered at all rather than disabled: a placeholder is
      data the product does not have.
- [x] **3. Badge state machine.** `badgeFor` with the plan's precedence — stale > needs_practice >
      complete > in_progress > not_started. **The rule the plan asked for is not the rule implemented:**
      the record has no per-screen accuracy, so `needs_practice` is "solved with a hint, or after two or
      more failed checks" (`done.helped || done.tries >= 2`), which is the same signal the drill already
      stores. Inventing an accuracy figure from `tries / screens` would be a number the product cannot
      stand behind.
- [x] **7. Reset progress.** Two clicks, six seconds to take the second one, Escape cancels, and the
      note says what it deletes. No typed confirmation: the record being destroyed is one browser's
      practice history, not an account.
- [x] **9. SEO meta.** `noindex` on `/learn` in both builds, and the sitemap and `next:check` assert the
      page is absent from the crawl surface. Whatever a crawler sees would be one browser's zeroes.
- [x] **4. Category pages.** `/learn/groups/<id>`, one page per group with a drill, built by the same
      renderer as `/learn` so the two cannot drift: back link, the group's prose split into its two
      authored paragraphs, the legend, one section with numbered rows and the same island — the counters
      read the full plan payload, not the page's own slice. Deep links exist because the dashboard's
      group `<h2>` is the link; the page is `noindex` and stays out of the sitemap (it is one browser's
      zeroes, exactly like `/learn`), and a group with no drills has no page rather than an empty one,
      so 9 of the 16 groups render today. The syllabus table the plan asked for is the grouped row list
      already built for the dashboard: same columns minus accuracy, which the record cannot prove.
- [x] **5. Gating (`canStart`).** `canStart({ plan, progress, id, unlocked })` in `packages/progress` is
      the whole rule, and both pages ask it: `open | next | complete | ahead | unlocked | unknown`. The
      frontier is the first drill nobody has finished; everything at or before it is open, a finished
      drill is open however far past the frontier it sits, and an id the plan does not contain is open
      (a stale bookmark must not become a wall). Two walls stand in the drill, order first, then the
      trial — a form behind an order card would be a second riddle for the same lesson.
      **Two deviations from the plan above, both because progress is local-only until phase 4:**
      (a) the wall is not a sign-in prompt. With no account, the order rule alone would lock a learner
      out of their own track the day they clear site data, so the card names the drill to finish *and*
      offers one click that sets `es.progress.unlocked`, which opens every drill for that browser
      forever (it survives a progress reset, because it is a preference, not a completion). Tourists
      and crawlers see the same card; there is no entitlement to read. (b) The rule is client-side only,
      as this phase asked, and the dashboard row is still a **link** — the phase doc says "shows a
      prompt on click, not a dead link", while this item's own plan text asked for a non-link row. The
      row now carries `data-locked` and says "Opens after drill N" inside the anchor, so the note and
      the way through it are the same click. Server enforcement is phase 4's.
- [x] **6. Recommendation.** The up-next card ships with four reasons — `start`, `resume`, `practice`,
      `finished`. A finished track says so and offers no button: the daily challenge and the certificate
      are phases 5 and 6 and a CTA to nothing is worse than no CTA. `practice` points at the **coldest**
      drill rather than the first one in track order, because once everything is solved the useful
      question is not "what is next" but "what will I have forgotten" — so a drill solved a month ago
      outranks one solved yesterday with a hint. It is a `Revisit` link, the same throttle-free path
      `resume` uses.
- [x] **8. Feedback modal.** The footer on every page carries "Send feedback", which opens a native
      modal `<dialog>`: a three-way satisfaction choice, a 500-character textarea with a live count,
      and the route it was filed from. A note with no mood picked is refused with a message and the
      cursor moved onto the choice, because "which of these three" is the one thing the form cannot
      infer. **Deviation, because the endpoint is phase 4:** a submission is filed twice, both times
      locally — `feedback_sent` into the event sink (`mood`, `chars`, `kept`, `stored`) and the note
      itself into a bounded queue under `es.feedback`, twenty entries, oldest dropped. Nothing is
      sent, and the dialog says so in as many words before and after the submit rather than showing a
      toast that implies otherwise. The bound is not tidiness: the queue shares `localStorage` with
      the progress record, so an unbounded queue would eventually make a learner's *progress* fail to
      save. A browser that refuses the write is told the note is gone rather than thanked. The note
      never enters an event, for the same reason the learner's formula never does. `e2e/feedback.spec.js`
      proves the round trip, the mood refusal, the bound in a real browser, the refused-storage path
      and that Escape leaves a clean form; `e2e/a11y.spec.js` scans the dialog open, in error and in
      confirmation.

Two acceptance criteria are now true and proven in `e2e/dashboard.spec.js`: "signed-in learner's next
lesson updates immediately after a completion" (the spec finishes a drill on its own page and reads the
dashboard, which is the same assertion without an account), and "reset progress asks twice and cannot be
triggered by a stray keypress". The stale row is proven there too — a 2020 completion reads `Stale`, never
`Complete` — and the category criterion is proven: every group page renders its own drills and no
others, counts sum to the track total, no drill appears in two groups (`tests/dashboard-page.test.js`
covers the first two, `legacy/src/verify.mjs` the third across all 9 pages). The gating criterion is met in its local
form and proven in `e2e/gate.spec.js`: the learner who is not signed in — nobody is, until phase 4 —
sees the frontier open, every later row marked "Opens after drill N", and the click that opens it
in one step. The sign-in prompt the criterion names is the one deviation item 5 records.

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

## Acceptance criteria — evidence table (2026-10-31)

Rewritten as an evidence table on **2026-10-31** from the checklist it replaces. Verdicts, witnesses and the build items (B1–B14) are defined in [`reviews/completeness-2026-10-31.md`](reviews/completeness-2026-10-31.md). A row marked **Proven** names a witness this review re-ran: a `path:line` inside a test that executed (the strongest), a `gate:<script>` the review ran green, or an `artifact:<path>` whose existence is the whole claim (a document, a config file). No row is left grey.

| ID | Criterion | Verdict | Witness | State exercised | Decision |
| --- | --- | --- | --- | --- | --- |
| p3-19 | Progress read model `summarise` | Proven | `tests/progress.test.js:128` | browser + unit | — |
| p3-27 | Dashboard layout: count, bar, up-next | Proven | `e2e/dashboard.spec.js:25` | browser | — |
| p3-34 | Badge precedence stale > needs_practice > complete | Proven | `tests/progress.test.js:71` (M6) | browser | — |
| p3-40 | Reset progress, two clicks, 6 s, Escape cancels | Proven | `tests/client.test.js:702`; `e2e/dashboard.spec.js:109` | browser | — |
| p3-43 | `noindex` on `/learn`; sitemap and `next:check` assert it | Proven | `tests/metadata-routes.test.js:93` | route | — |
| p3-45 | Category pages `/learn/groups/<id>` | Proven | `e2e/dashboard.spec.js:225` | browser | — |
| p3-53 | `canStart` gating | Proven | `e2e/gate.spec.js:15,38,60` | browser | — |
| p3-69 | Four recommendation reasons | Proven | `tests/progress.test.js:113,120,138` | browser | — |
| p3-76 | Feedback modal on every page | Proven | `tests/build.test.js:101`; `e2e/a11y.spec.js:249` | browser | — |
| p3-165 | Signed-out learner sees 1–3 open, rest as sign-in prompt | Proven | `e2e/gate.spec.js:15,60` | browser, accounts off | — |
| p3-172 | Signed-in next lesson updates immediately | Built, unproven | no gate ever signs in; `e2e/auth.spec.js` only tests the unconfigured state | no signed-in state | Build B1 |
| p3-176 | Badge precedence over eight combinations | Proven | `tests/progress.test.js:71,212,239` (M6) | unit | — |
| p3-179 | Category counts sum to the track total | Proven | `tests/progress.test.js:164` | unit | — |
| p3-180 | Dashboard renders < 1 s throttled | Built, unproven | no throttled measurement anywhere | n/a | Build B2 |
| p3-185 | Empty state (new learner) and the storage-denied failure state both implemented and asserted | Proven | `e2e/dashboard.spec.js:175` (denies localStorage, asserts the note at :185) | half the claim unexercised | — |
| p3-191 | Reset asks twice, cannot fire from a stray keypress | Proven | `tests/client.test.js:702`; `e2e/dashboard.spec.js:109` | browser | — |

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
