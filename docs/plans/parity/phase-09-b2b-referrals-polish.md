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

### As built — 9A unit 7, dark mode (2026-12-02)

Implemented as the plan asked: the token layer and nothing else. `legacy/src/styles/tokens.css` is the
only file that changed for the palette, and no component learned that a second theme exists. One
deviation from the wording above, recorded rather than hidden: the block is a
`@media (prefers-color-scheme: dark)` rule rather than `[data-theme="dark"]`. A server-rendered page
cannot select a theme by attribute without a script that runs before first paint, and this site ships
none; the preference the OS already publishes needs no script and no flash. The `.dark` class hook the
vendor scales answer to is kept, so a client that wants to pin a theme still can.

What the swap is: the four Radix scales (`--sand-*`, `--jade-*`, `--amber-*`, `--red-*`) restated at
their published dark steps. Because `--bg`, `--surface`, `--line`, `--text`, `--btn-bg`/`--btn-text`
and the three state tints are all aliases into those scales, re-pointing the scales re-points every
surface, and the ink button inverts on its own. Three tokens could not follow a scale and were given an
explicit dark pair: `--ok` and `--warn` (hand-darkened for a 4.5:1 light tint; Radix's dark 11s are
their dark pair) and `--shadow-1` (a shadow on a dark page has to be blacker than the page to read as
lift), plus `--scrim`, which goes from a 45% green-black to a 62% black.

`renderHead` and `app/layout.js` now declare `color-scheme: light dark` instead of `light`, so form
controls and scrollbars follow the same choice as the palette.

Proof:

| Gate | Output |
|---|---|
| `npm run check` | `tests 1616`, `suites 211`, `fail 0`; `88 of 88 catalogued lessons, 16 groups, 152 screens, 1946 fixtures replayed`; `903 accepted and 1043 rejected`; `built 109 pages (11254.5 kB)`; `next routes: 109 prerendered pages match the shared templates`; `4378 checks passed` |
| `npx playwright test` | `135 passed` (127 when 9A started) |
| `npm run vendor:check` | `25 files match manifest.json` |

The five browser tests, all with the harness emulating a dark-preferring OS:

- `with the OS asking for dark › the page paints the dark palette instead of the light one` — asserts the
  media query matches, the meta names both schemes, the painted background has luminance < 0.05 and the
  text > 0.6. This is the test that fails if a component hard-codes a colour.
- `… › the browser bar is painted to match the page, not left white` — the mobile half. Without a
  `theme-color`, Android Chrome keeps its toolbar white, so a dark page opens under a bright band; both
  schemes carry a value and the dark one is asserted to be the painted background.
- `… › the muted ink still clears 4.5:1 against the page behind it` — arithmetic on the resolved
  `--text-muted` and `--bg`, the pair a palette swap quietly ruins.
- `… › the verdict, its hint and the highlighted cell survive the swap` — the miss tint, the hint and the
  accepted tint, scanned in dark, because the state tints are the only place the two palettes disagree
  about what "red enough" means.
- `… › every page still passes with nothing to fix` — the same axe bar as light (zero critical/serious)
  on twelve surfaces: index, dashboard, a group, a drill, pricing, projects, flashcards, daily,
  leaderboard, privacy, terms, account.

`e2e-static` gained two tests: the static deployable serves one concatenated stylesheet, so a build that
dropped the media block would ship dark mode on the Next host and not on the static one. One reads the
served bytes and asserts `--bg: #191918`, `--text: #eeeeec` and the `light dark` meta; the other asserts
the two `theme-color` metas, which the static build writes into 109 heads from one template.

The browser-bar colour is the one value a `<meta>` needs that a custom property cannot supply, so it is
declared once as `config.themeColor` and read by both heads — `legacy/src/site/shell.mjs` for the static
build, `export const viewport` in `app/layout.js` for Next. `tests/styles.test.js` compares both values
against the two places `--sand-2` is declared (the vendor light scale and the tokens dark block), so the
bar cannot drift from `--bg` without a test failing; `tests/build.test.js` asserts the metas reach the
emitted HTML.

Where the rest of 9A stands, so this section is not read as "9A shipped": unit 8 (the WCAG audit of
the five core pages) is already covered continuously by the 30 axe tests in `e2e/a11y.spec.js`, which now run in both themes;
unit 9 (print) is **blocked** — its acceptance is "the certificate prints on one page in A4 and Letter",
and no certificate can be issued on a deployment with accounts unconfigured, which is every
configuration this suite is allowed to run in (14 specs assert that state, so a seed that enabled
accounts would break them). The chrome-stripping half of the print sheet is proven
(`e2e/certificate.spec.js`); the one-page half needs a real credential and a database. Unit 10 (copy
extraction) is not started: it touches every user-facing string in every template and earns nothing
visible until a second language exists.

Two things this unit did **not** do, deliberately: no theme toggle (the plan asks for
`prefers-color-scheme`, and a toggle needs persistence and a first-paint script that this site has no
infrastructure for), and no chart or image treatment — the only raster on a page is the workbook
screenshot, which is a picture of Excel and stays light in both themes on purpose.


## Acceptance criteria

**9A — launch polish**

- [x] Dark mode has zero contrast failures (axe + manual spot check on charts and badges). — axe
      reports no critical/serious node, and `color-contrast` is a serious finding, on twelve pages in
      both themes; the muted-ink pair is additionally measured arithmetically at ≥ 4.5:1. "Charts" does
      not exist: the only raster is the workbook screenshot.
- [x] axe: zero critical/serious on the five core pages in both themes. — proven for all five (player,
      dashboard, pricing, certificate state, verify) plus seven more, in light and in dark.
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
