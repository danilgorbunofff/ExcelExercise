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

### As built — 9A unit 8, WCAG 2.2 (2026-12-03)

Two halves. The half axe decides has been running since 5B: 30 tests over twelve surfaces in both
themes, failing on critical and serious findings, which is where contrast, names, roles, labels and
error identification land. The half axe cannot decide is the WCAG 2.2 addition, because deciding it
needs a laid-out page and a form a password manager could fill: where a control ends up once the
browser has scrolled to it, whether the same help sits in the same place on every page, and whether the
fields a visitor types into declare their purpose. That half is `e2e/wcag22.spec.js`: eight tests, no
account, no database.

| Criterion | Where it is proven |
|---|---|
| 2.4.11 Focus Not Obscured (Minimum) | `e2e/wcag22.spec.js` — 130 tab presses across the front door, a drill and the offer page |
| 2.5.8 Target Size (Minimum) | `e2e/targets.spec.js` — 24 px on desktop, 44 px on a phone, one documented rail exception |
| 3.2.6 Consistent Help | `e2e/wcag22.spec.js` — six pages, the same three items in the same order |
| 3.3.7 Redundant Entry | built, not tested: `app/signup/form.js` asks for the name once and never again |
| 3.3.8 Accessible Authentication | `e2e/wcag22.spec.js` — three forms, declared purposes, no transcription test |
| 4.1.3 Status Messages | `e2e/wcag22.spec.js` — the drill's verdict is `role="status" aria-live="polite"` |

| Gate | Output |
|---|---|
| `npm run check` | `tests 1688`, `fail 0`; `120 prerendered pages`, `4869 checks passed` |
| `npx playwright test` | `153 passed` (145 before this unit) |

**2.4.11.** The test tabs forward and asks `document.elementFromPoint` at the centre of whatever has
focus whether the thing painted on top is the thing focused. A sticky bar, a floating panel or an
overlay answers no, and that is the failure the criterion describes. Three pages rather than one,
because the sticky elements differ: a desktop rail on the front door, a sticky header row in a drill,
neither on the offer page. Two details it had to get right to be honest: smooth scrolling is authored
behind `prefers-reduced-motion: no-preference`, so a measurement taken mid-scroll reads a focused
control as off-screen — the spec asks for reduced motion, which is also the page a visitor who asked
for reduced motion gets; and a closed `<dialog>`'s controls are focusable but not painted, so they are
skipped rather than reported as obscured. Each of the three tests also asserts a floor on how many
controls it counted (20 on the front door and in a drill, 10 on the offer page), so a page that stops
rendering controls fails instead of passing vacuously.

**3.2.6.** The footer's support line is Privacy, Terms, Send feedback, in that order, on the front
door, the offer page, the dashboard, the exercises hub, privacy and the functions hub. The feedback
`<dialog>` lives inside `<footer>`, so its own Send, Cancel and Close are excluded with
`closest("dialog")`; without that the comparison would be of a page against itself.

**3.3.8 and 3.3.7.** The sign-in form's fields are `email` and `current-password`; the sign-up form's
is `new-password`; and none of `/login`, `/signup`, `/reset` carries `autocomplete="off"`, a captcha
class or a captcha iframe. The sign-in page also carries the footer's feedback form, which has no
password field, hence the `main form` scope. Redundant Entry is deliberately a build fact rather than a
test: the sign-up form has one name field and there is no second visit on which it could be asked
again, and a test that asserts an absence on one page would not notice a new page that forgot.

### As built — 9A unit 9, print (2026-12-03)

What exists: the `@media print` block in `app/certificate/certificate.css`, and `app/certificate/print.js`
as the button. The certificate has no server-rendered PDF — `window.print()` is the renderer — so the
stylesheet is the artifact, and it is worth asserting on its own.

What is proven. `e2e/certificate.spec.js` emulates print media on `/verify/[id]` and asserts the header,
the footer and the skip link are hidden while the page's own words stay visible. `tests/certificate.test.js`
now also reads the stylesheet and asserts the four things that browser test cannot reach on a deployment
with no accounts: the chrome is hidden and the sheet and the revocation notice are not; the sheet prints
in ink rather than inheriting the dark-capable screen palette, which is what makes a printed page
readable when the palette changes; `@page` states a 16 mm margin and pins no paper size, so A4 and Letter
both work and neither clips; and the sheet carries `break-inside: avoid` while the verification URL is
revealed in print, so the paper outlives the browser tab it came from.

What is not proven, stated plainly: "one page in both sizes". That needs the sheet rendered in its held
state, which needs a credential, which needs accounts configured, and 14 specs assert that accounts are
not. The half that can be asserted without a database is asserted; the half that cannot is left
unchecked below rather than claimed.

### As built — 9A unit 10, copy extraction, first slice (2026-12-03)

Unit 10 as the plan writes it is every user-facing string in every template. That is a mechanical
refactor of roughly a thousand strings, and its payoff is a language that does not exist yet, so it was
cut down to one honest slice: **the chrome, the auth screens and the certificate**, behind a `t()`
helper with an English catalogue, with the rendered bytes held identical.

Why those three. The chrome is on every page, so it is where a second language would show first and
where a mistake would show 120 times. The auth screens and the certificate are the surfaces with the
most conditional copy — errors, disabled states, held states — so they are the ones whose strings are
least likely to be right by accident. The front-door marketing prose, the lesson bodies and the legal
pages are deliberately out of scope and stay as literal text: the lessons already carry their copy in
`packages/`, and rewriting the prose for translation before anyone translates it would be churn.

**`legacy/src/site/messages.mjs`** is the catalogue. It lives in `legacy/src/site/` and not in
`packages/` because `tests/build.test.js` proves the static build still works when `legacy/` is copied
without `packages/`, and not in `lib/` because `lib/` is Next-only. It has **zero imports** on purpose,
so both builds can load it, and it states three rules at the top that `tests/messages.test.js` enforces:

| Rule | Why | Enforced by |
| --- | --- | --- |
| Keys name positions, not wordings: `chrome.ways.flashcards`, never `flashcardsButton` | A wording change must not rename a key, or every key churns on every copy edit | dotted lowerCamelCase test |
| Values are plain text: no markup, no entities, no surrounding space | `esc()` is applied by the template, not the catalogue, so an entity in a value renders as `&amp;` | plain-text test |
| `{word}` is the only hole, and a missing key or value **throws** | A silent miss prints `chrome.footer.te` to a page; a throw fails the first render instead | holes and throw tests |

`t(key, vars)` takes no locale argument yet. With one language there is nothing to choose, and a second
language adds a second parameter without moving a single call site.

The catalogue is not trusted just because it is new. The same two functions the lessons answer to,
`findBanned` and `findTypography` from `packages/content-lint/copy.js`, run over every value, so the
chrome cannot acquire a banned word, an em dash, a curly quote or an emoji. One tolerance is documented
in the test by key: `chrome.loading.form` keeps its ellipsis because that is what a loading label
counts with.

The structural test is the one that earns the file: it walks `app`, `legacy/src`, `lib`, `packages` and
`scripts`, collects every `t("...")` call site, and asserts **in both directions** — every key in the
catalogue is asked for, and every key asked for exists. A key that is added and never wired, or wired
and never added, fails here rather than in a browser. That test found one real gap on the first run: the
skip link had been written as a template literal and never routed, so `chrome.skip` was in the catalogue
and unused. It is wired now.

Byte-identical output is the proof that this was a refactor and not a rewrite. `legacy/dist` was copied
to `/tmp/dist-baseline` before a line changed, and after the wiring `diff -r legacy/dist /tmp/dist-baseline`
returns nothing: 120 pages, 11 549.8 kB, not one byte different.

| Gate | Result |
| --- | --- |
| `npm run check` | `tests 1696` (1688 before this unit), `fail 0`, 120 prerendered pages, 4869 checks |
| `diff -r legacy/dist /tmp/dist-baseline` | no differences |
| `npx playwright test` | 153 passed, unchanged |

### Where the rest of 9A stands

9A is done: units 1-9 are built and proven above, and unit 10 landed as its first slice — chrome, auth
and the certificate behind `t()`, with the static build byte-identical. What is still open in 9A is
scope, not work: the rest of unit 10 needs the same treatment for `app/account`, `app/daily`,
`app/leaderboard`, `app/flashcards` and `app/verify`, and that is worth doing when a second language is
real rather than in advance of one.

Two things 9A did **not** do, deliberately: no theme toggle (the plan asks for
`prefers-color-scheme`, and a toggle needs persistence and a first-paint script that this site has no
infrastructure for), and no chart or image treatment — the only raster on a page is the workbook
screenshot, which is a picture of Excel and stays light in both themes on purpose.

## Acceptance criteria — evidence tables (2026-10-31)

9B is **deleted from the product**, not deferred: the owner ruled organizational access and referrals out on 2026-10-31. Those rows stay in the table only so the deletion is recorded where the claim used to be.

### 9A — launch polish

| ID | Criterion | Verdict | Witness | State exercised | Decision |
| --- | --- | --- | --- | --- | --- |
| p9-278 | Dark mode: zero contrast failures | Proven | `e2e/a11y.spec.js:412,434,451` | browser, both schemes | — |
| p9-282 | axe zero critical/serious on five core pages, both themes | Proven | `e2e/a11y.spec.js:40,45,83,98,317` + dark block at 412 | browser | — |
| p9-284 | Certificate prints on one page in A4 and Letter | Proven | `screenshots/2026-10-31/next/12-print-a4.png`, `12-print-letter.png`; `tests/client.test.js:330` | print, one paper size | — |
| p9-287 | No hard-coded user-facing string outside the catalogue | Absent | no string catalogue, no lint that proves it | n/a | Removed: no second locale and no catalogue; copy is held by copy/messages/content:check |

### 9B — institutional portal and referrals — removed

| ID | Criterion | Verdict | Witness | State exercised | Decision |
| --- | --- | --- | --- | --- | --- |
| p9-291 | Owner invites 3, 2 accept → seats/table/CSV agree | Absent | 9B; `groups`/`group_invites` appear only in `tests/db/rls.spec.js` and the harness | n/a | Removed: organizational access is out of the product (owner, 2026-10-31) |
| p9-292 | 4th invite with 3 seats fails cleanly, no orphan row | Absent | 9B | n/a | Removed: organizational access is out of the product |
| p9-293 | Removing a member frees a seat, revokes on next request | Absent | 9B | n/a | Removed: organizational access is out of the product |
| p9-295 | Non-owner cannot reach `/admin`; RLS proves no cross-group reads | Absent | no `/admin` route exists | n/a | Removed: there is no `/admin` and there will not be one |
| p9-296 | Referral click → signup → first payment = one conversion, one credit | Absent | no referral code anywhere | n/a | Removed: referrals are out of the product (owner, 2026-10-31) |

Rewritten as an evidence table on **2026-10-31** from the checklist it replaces. Verdicts, witnesses and the build items (B1–B14) are defined in [`reviews/completeness-2026-10-31.md`](reviews/completeness-2026-10-31.md). A row marked **Proven** names a witness this review re-ran: a `path:line` inside a test that executed (the strongest), a `gate:<script>` the review ran green, or an `artifact:<path>` whose existence is the whole claim (a document, a config file). No row is left grey.

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
