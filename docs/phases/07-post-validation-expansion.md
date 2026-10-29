# Phase 7 — Post-validation expansion

**Purpose:** the roadmap that only starts after the fake door clears its thresholds. Listed here so
phase 5 decisions do not accidentally block it, not as work to do now.

**Depends on:** phase 6 metrics.
**Unblocks:** nothing. This is the growth path.

## Entry criteria (all must hold)

- ≥25% of lesson-page visitors start a drill.
- ≥50% of starters complete a lesson.
- ≥3% of paywall viewers submit an email.
- ≥50 indexable pages, each with a real exercise.
- At least one organic search click through to a drill from a practice-intent query.

Below any of these, the fix is content or lesson design — not more software.

## Expansion order

**1. Port to Next.js 16 (mechanical).**
`app/[track]/[slug]/page.tsx` with `generateStaticParams` over the same content files; the grader
package and JSON schema move unchanged. Add `next/font`, `metadata` for per-page OG, and ISR for
future A/B copy. Do not rewrite the grader during the port; the fixture suite is the safety net.

**2. Accounts and entitlements.**
Supabase (Postgres + RLS) for progress, entitlements, and assessment results; Stripe Checkout +
Billing Portal; webhook writes `entitlements` rows. Replace `localStorage` trial with a server
trial. Keep anonymous practice working — signup is a consequence of wanting persistence, never a
gate before the first drill.

**3. Assessment wedge (the real revenue).**
15-minute timed set of 5 live tasks; anti-cheat telemetry (tab blur, paste, time per task); scorecard
with per-skill time versus expert target; recruiter link with credits ($490 / 50 screens).
This is the highest-price, lowest-churn product — build it before team dashboards.

**4. Content at scale.**
Grow from 10 to 60–100 lessons across 8 topic clusters (aggregation, logic, lookup, text, dates,
pivot-adjacent formulas, data cleaning, modelling). Each new lesson must ship with fixtures; CI fails
if an exercise has fewer than 6 accepted and 6 rejected cases. No lesson added without docs.

**5. Adjacent tracks (only with a proven funnel).**
SQL for analysts (`sql.js`, result-set diffing) reuses the same shell, paywall, and assessment
engine. JQL next if the Atlassian metered-billing tailwind is still live. PowerPoint last — canvas,
geometry tolerances, and Chromium-only key capture make it a different product.

**6. Retention mechanics.**
Streaks already exist locally; add daily drill, interview-mode timed sets, and a shareable
certificate (PDF) with a verified URL. These address the 9.6% monthly churn of B2C crammers rather
than pretending it does not exist.

## Architecture guardrails for expansion

- Grader stays framework-free and dependency-free; every new function ships with unit tests.
- Content stays declarative; new exercise types (multi-cell, pivot, audit) extend the schema, they do
  not fork it.
- One grading path. Never add a second "AI grading" path beside the deterministic one; use AI offline
  to draft hints and exercises, then review and commit them as fixtures.
- Analytics: one event taxonomy from phase 5, extended, never renamed.

## Explicit non-goals

- Native mobile apps.
- AI tutor chat inside the drill (nondeterministic, slow, expensive, and it undercuts the grading
  promise).

## Superseded by the reference-parity plan

Two items above no longer hold, because the reference product proves they are expected features:

- **Excel keyboard-shortcut drills** are now in scope. They ship with a capability check and an
  always-available multiple-choice fallback, so Safari/Firefox learners are never blocked.
- **Lifetime pricing** is now in scope as a one-time Stripe price alongside monthly and annual.

The detailed, phase-by-phase replacement for this document is
[`docs/plans/parity/00-overview.md`](../plans/parity/00-overview.md).
