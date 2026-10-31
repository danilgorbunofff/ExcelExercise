# Excel Supreme — Reference Parity: Program Overview

**Status:** plan of record, being executed. Phases 0–3 have landed — every item in phase 2 and phase 3
is built and proven, with the deviations each file records (the phase-2 keyboard matrix is the one
acceptance criterion still open, and it waits on shortcut content rather than on code). Each phase file
carries a Status section with what was built and what was deferred.
**Contents:** this overview plus eleven phase plans in `docs/plans/parity/`. Read this file first; each
phase file is self-contained and executable on its own.

---

## 1. What we are doing

`reference/excelexercises-mirror/` is a 364-file static mirror of excelexercises.com (201 HTML
pages). The goal is to reach feature parity with the parts of that product that create value —
curriculum, learner loop, accounts and money, retention, credential, SEO distribution, B2B — while
keeping Excel Supreme's own superior exercise grader.

This is not a rewrite for its own sake. We keep content-as-JSON and the deterministic grader; we
replace the shell (static Node templates → Next.js), add identity and payments, and grow content.

## 2. Evidence base

| Source | What it gives us |
|---|---|
| `levelInfo.js` (executed in a VM) | 95 catalog slots, **88 live** Excel lessons, 16 groups, curated recommended order |
| `sqlLevelInfo.js` | **23** SQL lessons in 6 categories |
| `practice__lesson=1.html` (202 KB) | Full player: 5 screen types, scoring, recycling, paywall, completion |
| `answerListeners.js`, `incorrectAnswer.js` | Formula normalisation, chord hold logic, moderated answer bank |
| `updateLessonLists.js`, `completion.js`, `checkPremium.js` | Gating, badges, completion writes, entitlement rules |
| `links.txt` + `sitemap.xml` | 201 HTML routes + 163 assets; the sitemap lists only 180 URLs (21 routes absent, incl. `premium.html`, `privacy.html`, `about.html`, the `?intro=1` variants) |
| 42 `excel-functions/*`, 2 `excel-shortcuts/*` | SEO article shape (syntax → examples → errors → CTA) |
| `admin-portal.html` | Groups, invitations, cohorts, activity review |
| Current repo | 11 built pages, 10 lessons, 344 passing tests, zero third-party origins |

**Unavailable in the mirror:** the Firestore documents themselves — no question text, accepted
answers, or explanations. Content must be authored. That is the critical path, not engineering.

**Legal constraint:** the reference's prose, questions, explanations and article bodies are
copyrighted. We reproduce *structure, mechanics and catalog metadata* (numbers, titles, ordering) and
write every learner-facing word ourselves.

## 3. Reference product, in one screen

```
Curriculum   88 Excel lessons / 16 groups / 14 category pages
             23 SQL lessons / 6 categories
             5 project pages: 3 dashboard cases (UFO, wine, trout), a job-interview
             assessment, a SQL project; 6 XLSX files (2 are completed/answer variants)
             44 SEO articles (42 functions + 2 shortcut guides)

Lesson       5 screen types: formula · hold-down chord · key sequence · picture · embedded workbook
             ~7 screens, score climbs to 100, screens recycle from #4, 60-minute session timer
             points = random(1..5) × lessonNumber, first-try accuracy tracked per screen

Progress     recommended order, lesson gating (highestCompleted + 1),
             badges: IN PROGRESS / COMPLETE / NEEDS PRACTICE (<50%) / stale (≥14 days)

Accounts     Firebase email+password and email-link, profile with name/username/LinkedIn

Money        2 free lessons, soft paywall then hard redirect; Stripe monthly/annual/lifetime;
             institutional domain allowlist

Retention    daily points, streaks, top-3 leaderboards, daily challenge with per-day scores,
             7-day accuracy trend, flashcards

Credential   name confirmed once, certificate generated, public verification by credential ID,
             add-to-LinkedIn

Growth       group admin portal, email invitations, cohorts, referrals, GTM + Facebook pixel
```

## 4. Current Excel Supreme, verified

- `npm test` → **344 pass / 0 fail**. `npm run build` → 11 static pages. `npm run verify` → 333 crawl checks.
- Native ESM, no dependencies, no bundler, no backend. `legacy/src/build.mjs` refuses third-party origins.
- `legacy/content/track.json` (`freeLessonCount: 5`): a 16-group, 88-slot catalog — 10 lessons live in
  `legacy/content/exercises/`, 78 slots planned with the title and level they will ship with.
- Grader: tokenize → parse → evaluate, plus rule checks (`require`, `forbid`, `requireRef`, `rules`),
  returning `{ ok, code, message, position, hint }`.
- Client: `state.js` (local progress + 7-day trial), `drill.js` (selection, 3 attempts, reveal,
  fake-door paywall).
- Design system: `tokens.css` → `base.css` → `components.css`.

**We are ahead on:** grading (real evaluator vs normalised string match), hints (authored per failure
mode vs aggregated community text), content validation (build fails on malformed lessons), page
weight (zero third-party requests), test coverage (they ship none).

**We are behind on:** everything that makes it a business.

## 5. Gap summary

| Area | Missing | Weight |
|---|---|---|
| Curriculum | 78 Excel lessons, 14 category pages, gating, multi-screen lessons, 4 of 5 screen types, 23 SQL lessons, 5 project pages | heaviest |
| Learner loop | dashboard, badges, accuracy, points, streaks, leaderboards, daily challenge, flashcards, video | high |
| Business | accounts, profile, server persistence, real paywall, Stripe, institutional access, reset progress | high |
| Trust | certificate + verification, legal pages, feedback capture | medium |
| Growth | 44 SEO articles, group portal, referrals, analytics, dark mode | medium |

Those rows group into five areas; the eleven phases below close them, and each phase file carries
its own acceptance criteria and test plan.

## 6. Decisions (flag any you disagree with)

1. **Stack: Next.js 16 + Supabase + Stripe** (already the direction in
   `docs/phases/07-post-validation-expansion.md`), not Firebase.
2. **Content is authored, never copied.** Catalog metadata only from the reference.
3. **Keep the deterministic grader.** No LLM in the grading path. Port `legacy/src/grader` verbatim.
4. **Moderated answer bank instead of "AI assistant"** — same UX, our content.
5. **Our own grid and workbook preview, not OneDrive iframes.**
6. **No GTM container, no Facebook pixel.** First-party typed analytics.
7. **SQL graded by result-set diffing**, not string equality.
8. **Server-issued certificates** with a public verification URL.
9. **Shortcut drills ship with a capability check** and an always-available fallback.
10. **Three free lessons.** The reference allows 2 and the shipped build gives 5
    (`content/track.json`); the plan sets 3 — enough to finish a first group, short enough to gate.
    Phase 4 updates the existing trial/paywall tests and site copy in the same change.

## 7. Target architecture

```
app/                      Next.js App Router
  (marketing)/            /, /about, /pricing, /privacy, /terms, /referrals
  learn/                  dashboard, categories, Excel + SQL tracks
  practice/[lesson]/      player: server shell + client island
  daily/ leaderboard/ certificate/ verify/[credentialId] admin/
  api/                    stripe webhook, challenge cron, certificate issue, analytics proxy
content/                  tracks/, lessons/, articles/, projects/   (versioned JSON + MDX)
packages/grader/          moved from legacy/src/grader, behaviour unchanged
packages/content/         content/ reader + schema checks, moved from legacy/src/site/content.mjs
packages/sheet/           grid rendering + keyboard model
db/                       migrations, RLS policies, seeds
tests/                    unit, fixtures, e2e (Playwright), content lint
```

Lesson schema v2 (extends today's JSON): `id`, `number`, `track`, `category`, `title`,
`seoDescription`, `prerequisites`, `screens[]`, where each screen is one of five `type`s and carries
`grid`, `answer`, `solution`, `require`, `forbid`, `rules`, `hints`, `docs`, `video`,
`postcondition`, plus accepted/rejected **fixtures**.

Postgres model: `profiles`, `lesson_progress`, `attempts`, `daily_points`, `streaks`,
`daily_challenges`, `challenge_scores`, `certificates`, `entitlements`, `payments`, `groups`,
`group_invites`, `feedback` — full DDL and RLS rules in phase 4.

## 8. Phase index

| # | Phase plan | Duration | Depends on | Outcome |
|---|---|---|---|---|
| 0 | [Port the shell](phase-00-port-shell.md) | 1–1.5 wk | — | Next.js shell, grader extracted, 344 tests green, preview deploy |
| 1 | [Curriculum and content factory](phase-01-curriculum-content-factory.md) | 2 wk tooling + 8–12 wk content | 0 | Schema v2, validator, authoring CLI, catalog, category data |
| 2 | [Exercise engine](phase-02-exercise-engine.md) | 2.5–3 wk | 0, 1 | All 5 screen types, score loop, grid engine, hints |
| 3 | [Dashboard and progression](phase-03-dashboard-progression.md) | 1.5 wk | 1, 2 | Dashboard, categories, badges, gating, recommendation |
| 4 | [Accounts and entitlements](phase-04-accounts-entitlements.md) | 2–3 wk | 0, 3 | Auth, server progress, Stripe, paywall, RLS |
| 5 | [Retention layer](phase-05-retention.md) | 2 wk | 4 | Points, streaks, leaderboards, daily challenge, flashcards |
| 6 | [Credential and projects](phase-06-credential-projects.md) | 2 wk | 4 | Certificate issue/verify, 4 Excel projects |
| 7 | [SEO content engine](phase-07-seo-content-engine.md) | 1 wk tooling + 3–4 wk writing | 0, 1, 2 | MDX template, 44 articles, hubs, embedded drills |
| 8 | [SQL track](phase-08-sql-track.md) | 1 wk engine + 4–6 wk content | 2, 4 | SQLite sandbox, result-set diffing, 23 lessons, SQL project |
| 9 | [B2B, referrals, polish](phase-09-b2b-referrals-polish.md) | 1 wk (9A) + 1 wk (9B) | 4, 5 | 9A: dark mode, a11y, print · 9B: group portal, referrals |
| 10 | [Analytics and launch](phase-10-analytics-launch.md) | 1–1.5 wk | all | Typed events, funnel, budgets, 301s, launch |

**Critical path:** 0 → 1 → 2 → 3 → 4 → 6/8 → 9A → 10. Phase 5, phase 7 and 9B can run in parallel
with 4 and 6 if a second person is available. Content authoring for phase 1 starts the day phase 0
lands and never stops.

**Total:** 6–9 months for one engineer plus a content author in parallel.

**Phases 0–4 verification:** every phase above has a matching review and verification plan under
[`reviews/`](reviews/00-foundation-verification-plan.md) — measured baselines, the exact gate commands
with their expected output, the failure modes a green gate hides, and the criteria that cannot be
closed by a machine in this checkout. Phase 4's plan
([`reviews/phase-04-accounts-entitlements-verification-plan.md`](reviews/phase-04-accounts-entitlements-verification-plan.md))
was written after eight units landed; its 15 gate rows separate the 11 that run here from the four
that wait on live Stripe test keys, a second environment and the `PAYWALL=on` decision.

**Phases 5+ verification:** no review plan exists yet for those phases, so their evidence lives in the
`## Unit log` section of each phase plan — gate output per unit, deviations from the plan, and the rows
still open with the reason. A review plan is written once a phase has more than one unit landed.

## 9. Working agreements

- Every phase is independently shippable; the site is never broken between phases.
- `legacy/` keeps the current static build deployable until phase 10 flips canonical URLs.
- No phase merges with a red suite. Existing 344 tests must not regress at any point.
- Every new screen ships fixtures (≥6 accepted, ≥6 rejected) or CI fails.
- Content files are reviewed like code: one author, one reviewer, diff in git.
- No secrets in the repo; Stripe and Supabase keys via environment only.

## 10. Definition of done for parity

1. A signed-out visitor can complete 3 lessons with no account, no third-party request, and no layout
   break on a 375 px viewport.
2. A signed-in learner can complete all 88 Excel lessons, with points, streaks, accuracy and badges
   persisting across devices. *(Amended 2026-10-31: the 23 SQL lessons are out of this launch.)*
3. A non-entitled learner hits a soft paywall and then a hard gate; a Stripe test subscription unlocks
   within one webhook tick; a refund revokes.
4. Completing everything issues exactly one verifiable certificate, findable by credential ID while
   signed out, with a working LinkedIn link.
5. The daily challenge runs on a cron, accepts one attempt per user per day, and ranks by accuracy
   then time.
6. 44 indexable articles each link to a real exercise; sitemap matches routes; no orphan pages.
7. ~~A group owner can invite 3 emails, see 2 accepted, and export a CSV matching the activity
   table.~~ *(Deleted 2026-10-31: no organizational access in the product.)*
8. `npm test`, content lint, Playwright, the RLS suite, axe and the performance budget are all green
   in CI — and the RLS suite must be *inside* a CI job, not beside it.

Items 2 and 8 are amended as noted on 2026-10-31; item 7 is deleted. Item 4's "working LinkedIn link"
is deferred — the URL is asserted field by field but no automated run can open LinkedIn's UI — so at
launch that item means a prefilled URL, not a recorded click-through. The seven remaining items, as
amended, are the launch bar, and phase 10's "Definition of launch" is the authoritative text.

## 11. Decisions

Defaults, chosen so phase 0 can start without waiting on anyone. Each row names the one thing that
would force a revisit, because reversal cost is the only reason to spend time deciding now.

| # | Decision | Why now | Cost to reverse |
|---|---|---|---|
| 1 | **Stack: Next.js 16 App Router + Supabase + Stripe** | Server routes are required for the entitlement gate, the Stripe webhook and certificate issuance; Supabase gives Postgres + RLS + auth in one service, which is the whole of phase 4 | Rewrite of phases 0 and 4 (~5 weeks) — decide now, not at phase 4 |
| 2 | **Authorship: one author; the style guide and contractor brief ship in phase 1 either way** | The brief is ~1 day of work and is the artifact that makes the work parallelisable, so the author question never blocks the engine | None — the brief is useful whoever writes |
| 3 | **Shortcut drills: engine in phase 2, the 13 lessons last** (the 13 = 6 intro + 7 cell shortcuts in `levelInfo.js`) | The `s` screen type is needed for the 88 core lessons anyway; making the drills content means they cannot delay parity, and parity DoD counts 88 Excel + 23 SQL | The lessons move later; no code is thrown away |
| 4 | **Hints: authored hints plus a moderated answer bank, no LLM** | DoD 1 forbids third-party requests at lesson time, and a deterministic grader contradicts a generative hint that can be wrong | An optional LLM panel could be added later behind a flag without touching the grader |
| 5 | **B2B and referrals: split into 9A and 9B** | 9A (dark mode, a11y, print, copy extraction) cannot be retrofitted cheaply and gates launch; 9B (group portal, referrals) is a revenue experiment and only completes parity DoD 7 | 9B slips by a phase; the `groups`/`group_invites` schema and RLS already land in phase 4, so no migration is needed later |
| 6 | **Certificate: server-issued PDF at a verification URL, plus an OG card rendered from the same record** | DoD 4 requires verification while signed out, so the URL is the deliverable; the card is a view of it | Cosmetic only |

**Launch vs parity.** Amended 2026-10-31: launch = phases 0–7, 9A and 10. Phase 8 (SQL) is out of
this launch and 9B is deleted from the product, so parity = launch + phase 8 + the 13 shortcut
lessons. The authoritative text is phase 10's "Definition of launch"; the dated review is
[`reviews/completeness-2026-10-31.md`](reviews/completeness-2026-10-31.md).
The split exists because the group portal and referral credit are revenue experiments with no
correctness risk, while accessibility and print work get more expensive the longer they wait.
