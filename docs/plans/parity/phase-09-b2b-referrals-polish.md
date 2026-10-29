# Phase 9 — B2B, referrals, polish


> Part of the [reference-parity plan](00-overview.md). This file is self-contained:
> scope, work breakdown, acceptance criteria, tests and risks for this phase only.

**Duration:** 1 week (9A) + 1 week (9B) · **Depends on:** phases 4, 5 · **Blocks:** phase 10 (9A only);
9B is post-launch and completes parity

> **Split.** 9A is launch polish and gates phase 10. 9B is the institutional portal and referrals —
> it ships after launch, and parity DoD 7 waits for it. Do 9A first: it is the half that gets more
> expensive the longer it waits.

---

## Objective

Finish the quality work that separates a paid product from a demo — dark mode, accessibility, print
styles, localisation-ready copy — then open the second revenue channel (institutional licences) and
the cheapest acquisition channel (referrals). The first half gates launch; the second is a pair of
experiments we run once traffic exists.

Reference behaviour being reproduced: a group admin portal with email invitations, cohorts and an
activity table; a referral page. We add seat enforcement, CSV export and per-learner drill-down.

## Scope

**9B — B2B (post-launch)**
- Group creation, seats, owner/member roles.
- Email invitations with tokenised links, accept/decline, seat accounting.
- Cohorts (label per invitee).
- Activity table: learner, lessons completed, accuracy, last active, streak.
- CSV export; per-learner drill-down (read-only).
- Institution entitlement: a group with seats grants access to its members.

**9B — Referrals (post-launch)**
- Personal referral code and link.
- Attribution at signup (cookie + query param, 30-day window, last-touch).
- Credit ledger; manual payout initially, no automated money movement.

**9A — Launch polish (gates phase 10)**
- Dark mode across the app (token-level, respects `prefers-color-scheme`).
- WCAG 2.2 AA pass on player, dashboard, pricing, certificate, verify.
- Print stylesheet for the certificate.
- Copy extraction for future i18n (no translations yet).

## Out of scope

- Automated payouts, invoicing, SSO/SAML, SCIM.
- Multi-admin permissions beyond owner/member.
- Localisation into other languages (structure only).
- Referral fraud detection beyond basic per-IP/day caps.

## Work breakdown

### 9B — institutional portal and referrals

1. **Group admin.** `/admin` (owner only): group name, seats purchased vs used, invite form (multi-email
   textarea, one per line), pending/ACCEPTED states, remove member (releases seat), cohort field.
2. **Invites.** `group_invites` row with a random token, 14-day expiry, single use. Email sent via the
   transactional provider; the link lands on `/join/[token]`, which requires sign-in then attaches the
   `group_id` and `cohort`, and creates an `institution` entitlement while a seat exists.
3. **Seat enforcement.** Accepting beyond `seats` fails with "no seats available"; owner sees the
   count. Database-level check, not UI-only.
4. **Activity table.** Aggregate query per group: lessons completed, first-try accuracy, last active,
   current streak. Server-paginated, sortable, CSV export streaming from the same query so the export
   always matches the table.
5. **Drill-down.** `/admin/learner/[id]` shows per-lesson status and accuracy for members of the
   owner's group only (RLS-enforced).
6. **Referrals.** `/referrals` shows the code, link, invited count, converted count, credit balance.
   Attribution stored on `profiles.referred_by` at signup; conversion recorded on first paid invoice.
   Ledger table `referral_credits(user_id, amount, reason, created_at)`.
### 9A — launch polish

7. **Dark mode.** Token layer only: `tokens.css` gains a `[data-theme="dark"]` block; no per-component
   overrides; contrast checked for text, borders, focus rings, chart colours.
8. **Accessibility.** Audit each core page against WCAG 2.2 AA: focus order, landmarks, labels, error
   identification, target size, dragging alternatives, consistent help. Fix list tracked as issues.
9. **Print.** Certificate prints on A4 and Letter without the chrome; QR and ID remain legible.
10. **Copy extraction.** All strings through a `t()` helper with an English catalogue; no behavioural
    change.

## Acceptance criteria

**9A — launch polish**

- [ ] Dark mode has zero contrast failures (axe + manual spot check on charts and badges).
- [ ] axe: zero critical/serious on the five core pages in both themes.
- [ ] Certificate prints on one page in both A4 and Letter.
- [ ] No hard-coded user-facing string remains outside the catalogue.

**9B — institutional portal and referrals**

- [ ] Owner invites 3 emails, 2 accept → seats used = 2, table shows 2 members, CSV matches exactly.
- [ ] Accepting a 4th invite with 3 seats fails with a clear message; no orphan row.
- [ ] Removing a member frees a seat and revokes access on their next request, enforced by the
      server-side entitlement check rather than a token claim (see phase 4).
- [ ] A non-owner cannot reach `/admin` by URL; RLS proves no cross-group reads.
- [ ] Referral click → signup → first payment records exactly one conversion and one credit.

## Test plan

| Area | Tests |
|---|---|
| Invites | integration: invite, accept, expire, reuse, over-seat |
| Seats | unit + DB constraint tests |
| CSV | parity test: export rows === table rows |
| RLS | group isolation (owner A cannot read group B) |
| Referrals | attribution window, last-touch, double conversion |
| A11y | axe in light and dark; keyboard-only walkthrough |
| Print | PDF snapshot of the certificate in 2 page sizes |

## Risks

| Risk | Mitigation |
|---|---|
| Seat/entitlement drift | single source: seat count derived from active members, never a cached counter |
| Referral abuse | 30-day window, per-IP/day caps, manual review before payout |
| Dark mode half-done | token-only implementation; CI screenshot diff in both themes |
| A11y regressions | axe in CI from this phase onward |

## Deferral note

9B is the first work to slip under schedule pressure: nothing in phases 0–8 or 10 depends on the group
portal, and referrals can ship alone. 9A must not slip with it — the a11y, dark-mode and print work is
a launch gate in phase 10, and retrofitting it later means re-auditing every page added in the meantime.
