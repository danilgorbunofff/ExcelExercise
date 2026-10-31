# Phase 4 — Accounts, persistence, entitlements


> Part of the [reference-parity plan](00-overview.md). This file is self-contained:
> scope, work breakdown, acceptance criteria, tests and risks for this phase only.

**Duration:** 2–3 weeks · **Depends on:** phases 0, 3 · **Blocks:** phases 5, 6, 8, 9

---

## Objective

Add the business layer: real accounts, progress that follows the learner across devices, a paywall
backed by Stripe, institutional access, and the legal/compliance surface that charging money requires.

This is the highest-risk phase in the plan. It is also the one that turns the product into a business.

## Scope

- Supabase Auth: email+password and magic link; password reset; email verification.
- Profile: display name, username (unique, `citext`), LinkedIn URL; account menu.
- Server-side progress: `lesson_progress`, `attempts`, `daily_points`, `streaks` written from the
  player's event stream.
- Anonymous → signed-in import: merge local progress on first sign-in.
- Stripe: Checkout (monthly, annual, lifetime), Billing Portal, idempotent webhooks, entitlements.
- Paywall: free-first-3 rule, soft prompt then hard gate.
- Institutional grants: email-domain allowlist + group seats.
- Legal: privacy, terms, cookie stance, data export, account deletion.
- RLS policies with tests proving no cross-user reads.

## Out of scope

- Leaderboards, challenges, flashcards (phase 5).
- Certificates (phase 6).
- Group admin UI (9B) — this phase only creates the tables and the grant path.
- Tax remittance beyond enabling Stripe Tax.

## Data model

Runnable DDL for the tables this phase owns. `certificates` arrives in phase 6; extra indexes are
added when the queries that need them exist.

```sql
create extension if not exists citext;
create extension if not exists pgcrypto;

create table groups (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  owner_id   uuid,                                  -- FK added once profiles exists
  seats      int  not null default 1 check (seats > 0),
  created_at timestamptz not null default now()
);

create table profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  username     citext unique not null,
  display_name text,
  linkedin_url text,
  group_id     uuid references groups (id) on delete set null,
  cohort       int,
  role         text not null default 'learner' check (role in ('learner', 'owner', 'admin')),
  timezone     text not null default 'UTC',          -- phase 5 day rollover
  created_at   timestamptz not null default now()
);

alter table groups
  add constraint groups_owner_fk foreign key (owner_id) references profiles (id) on delete set null;

create table lesson_progress (
  user_id            uuid not null references profiles (id) on delete cascade,
  lesson_id          text not null,                  -- global slug: '01-sum-basics', 'sql-04-…', 'project-ufo'
  track              text not null default 'excel' check (track in ('excel', 'sql', 'project')),
  status             text not null default 'in_progress' check (status in ('in_progress', 'complete')),
  score              int  not null default 0 check (score between 0 and 100),
  attempts           int  not null default 0,
  wrong_count        int  not null default 0,
  helped             bool not null default false,
  first_try_accuracy numeric(5,2),
  best_ms            int,
  completed_at       timestamptz,
  last_seen_at       timestamptz not null default now(),
  primary key (user_id, lesson_id)
);
create index lesson_progress_lesson_idx on lesson_progress (lesson_id, status);

create table attempts (
  id                bigserial primary key,
  user_id           uuid not null references profiles (id) on delete cascade,
  lesson_id         text not null,
  screen_id         text not null,
  attempt_seq       int  not null,                    -- server-assigned, per (user, lesson, screen)
  started_at        timestamptz not null,
  ended_at          timestamptz,
  correct_first_try bool not null default false,
  wrong_count       int  not null default 0,
  help_used         bool not null default false,
  answer            text,
  unique (user_id, lesson_id, screen_id, attempt_seq) -- a replayed batch is a no-op
);
create index attempts_user_lesson_idx on attempts (user_id, lesson_id);

create table daily_points (
  user_id uuid not null references profiles (id) on delete cascade,
  day     date not null,
  points  int  not null default 0 check (points >= 0),
  primary key (user_id, day)
);

create table streaks (
  user_id  uuid primary key references profiles (id) on delete cascade,
  current  int  not null default 0,
  longest  int  not null default 0,
  last_day date
);

create table entitlements (
  user_id                uuid not null references profiles (id) on delete cascade,
  plan                   text not null check (plan in ('monthly', 'annual', 'lifetime', 'institution')),
  status                 text not null check (status in ('active', 'past_due', 'canceled', 'revoked')),
  source                 text not null default 'stripe' check (source in ('stripe', 'institution', 'gift')),
  current_period_end     timestamptz,
  stripe_customer_id     text,
  stripe_subscription_id text,
  updated_at             timestamptz not null default now(),
  primary key (user_id, plan)
);

create table payments (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references profiles (id) on delete cascade,
  stripe_payment_intent text unique,
  stripe_event_id      text,
  amount               int  not null,
  currency             text not null default 'usd',
  kind                 text not null check (kind in ('subscription', 'lifetime', 'refund')),
  refunded             bool not null default false,
  created_at           timestamptz not null default now()
);

create table stripe_events (
  id           text primary key,                     -- Stripe event id; insert-once guard
  type         text not null,
  received_at  timestamptz not null default now(),
  processed_at timestamptz
);

create table group_invites (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references groups (id) on delete cascade,
  email       citext not null,
  cohort      int,
  accepted_at timestamptz,
  invited_by  uuid references profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (group_id, email)                           -- re-inviting an email is a no-op
);

create table feedback (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references profiles (id) on delete set null,
  page       text,
  body       text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);
```

**RLS.** Every table is enabled and default-denied. This is the complete policy set for the phase, so
`tests/db/rls.spec.js` asserts against real policies rather than prose.

```sql
alter table profiles        enable row level security;
alter table lesson_progress enable row level security;
alter table attempts        enable row level security;
alter table daily_points    enable row level security;
alter table streaks         enable row level security;
alter table entitlements    enable row level security;
alter table payments        enable row level security;
alter table stripe_events   enable row level security;
alter table groups          enable row level security;
alter table group_invites   enable row level security;
alter table feedback        enable row level security;

-- Group ownership is checked through a definer function so the policy does not
-- re-enter groups' own RLS (which would hide the row it is testing).
create or replace function is_group_owner(gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from groups g where g.id = gid and g.owner_id = auth.uid());
$$;

create policy profiles_self_read on profiles for select using (id = auth.uid());
create policy profiles_self_update on profiles for update
  using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_group_owner_read on profiles for select
  using (is_group_owner(group_id));

create policy progress_self_read on lesson_progress for select using (user_id = auth.uid());
create policy attempts_self_read on attempts for select using (user_id = auth.uid());
create policy points_self_read on daily_points for select using (user_id = auth.uid());
create policy streaks_self_read on streaks for select using (user_id = auth.uid());
create policy feedback_insert_self on feedback for insert with check (user_id = auth.uid());

-- Writes to progress tables are server-only: a certificate is issued off this data (phase 6), so a
-- learner holding their own JWT must not be able to insert a completion straight into PostgREST.
revoke insert, update, delete on lesson_progress, attempts, daily_points, streaks
  from anon, authenticated;

create policy groups_owner_read on groups for select using (owner_id = auth.uid());
-- No insert policy: a row is invisible to its own creator until committed, so group creation is a
-- security-definer RPC, `create_group(name, seats)`, that inserts the group and sets owner_id.
create policy invites_owner_all on group_invites for all
  using (is_group_owner(group_id)) with check (is_group_owner(group_id));

-- Money tables carry no policy at all: only service_role (webhook, jobs) may read or write them.
revoke all on entitlements, payments, stripe_events from anon, authenticated;
```

`is_entitled(uid)` is `security definer`, so a learner can read their own verdict without table
access. Leaderboard reads go through a `security definer` view exposing display name, points, streak,
accuracy and rank — never email or username.

## Work breakdown

1. **Supabase project.** Two environments (staging, production), migrations in `supabase/migrations`
   (the CLI hardcodes this path; the plan originally said `db/migrations` — see the unit log),
   `supabase db reset` + seed with 3 users and 1 group.
2. **Auth flows.** `/signup`, `/login`, `/reset`, magic-link callback, email verification, session
   refresh in middleware. Blocks: gated routes redirect with `?next=`.
3. **Profile.** Onboarding step after first sign-in (name + username, optional LinkedIn), editable
   later; username uniqueness enforced, case-insensitive. Delivered in unit 3d — the step is offered
   when the display name is empty, and a failed profile read is treated as "unknown", never as
   "incomplete" (see the unit log).
4. **Progress writer.** `app/api/progress/route.js` consumes the phase-2 event stream in batches,
   writes with the **service-role** client (learners hold read-only grants on these tables), upserts
   `lesson_progress` on its primary key and inserts `attempts` with a **server-assigned**
   `attempt_seq` per `(user, lesson, screen)`. Replay safety comes from
   `unique (user_id, lesson_id, screen_id, attempt_seq)` — a resent batch is a no-op, never a
   duplicate row. `first_try_accuracy` is recomputed from `attempts`, never from client totals.
5. **Migration of anonymous progress.** On first sign-in, read `es.progress` from localStorage, POST
   it, merge with `min(completed_at)` and keep the higher accuracy; then set `es.progress.migrated`.
   Delivered in unit 3c — note that a signed-out record has no accuracy to keep, so the merge keeps
   the greater score and leaves `first_try_accuracy` for the first real batch (see the unit log).
6. **Stripe.** Products/prices created from `scripts/stripe-seed.mjs`; Checkout session server-side
   (never client-created); success/cancel routes; Billing Portal link; webhook with signature
   verification, and handlers for `checkout.session.completed`,
   `customer.subscription.created|updated|deleted`, `invoice.paid`, `charge.refunded`. The handler
   inserts the Stripe event id into `stripe_events` **before** doing any work: a duplicate
   primary-key insert short-circuits it, so a replayed or retried delivery cannot double-apply.
   Delivered in unit 3h — seed script, three routes, `lib/stripe.js` and one definer RPC that applies
   an event exactly once; see the unit log for what is proved and the deviations (no SDK; no success or
   cancel route, so those are query parameters on `/pricing`; cancellation is `canceled` rather than
   `revoked`, only a refund revokes; `metadata.user_id` is the resolution path; and the Billing Portal
   is an endpoint with no button yet).
7. **Entitlement check, authoritative at request time.** `is_entitled(uid)`, `security definer`:
   active subscription OR non-refunded lifetime payment OR institutional grant. Every gated request
   calls it through `my_entitlements()` (one indexed lookup, in-process cache capped at 60 s per
   user). A custom `entitled` JWT claim may be stamped as a UI hint, but it is **never the gate**: a
   webhook cannot mutate a token that has already been issued, so a refund would otherwise leave
   access open for the token's remaining lifetime and a fresh purchase would not unlock on a second
   device.
   Delivered in unit 1 (the function) and unit 3e (the gate); unit 3h is the first unit that makes it
   change answer mid-session, which is what the refund and second-device rows assert.
8. **Paywall.** `FREE_LESSON_COUNT=3` (config, not code). Lesson 4 shows a soft prompt with
   "continue free this once"; lesson 5 hard-gates to `/pricing`. Intro/`free: true` lessons bypass.
   Server-side check in the lesson route, not only client-side. This is a deliberate change from the
   shipped build (`content/track.json` has `freeLessonCount: 5`; the reference allows 2): update the
   existing trial/paywall tests and the site copy in this phase, not later.
   Delivered in unit 3e — `legacy/content/track.json` is the config (no code constant), the client
   walls are proved in the browser, and the server check runs in `proxy.js` behind `PAYWALL=on`,
   which stays opt-in: billing is wired as of unit 3h, but until checkout can actually take money the
   flag would wall lessons with no way to buy them; see the unit log for why the flag is opt-in.
9. **Institutional access.** `groups` + `group_invites`; domain allowlist table; on signup, a matching
   domain creates an `institution` entitlement. No UI yet beyond the grant.
   Delivered in unit 3g — `institution_domains` is the authority, the grant is an `after insert`
   trigger on `auth.users`, and `is_entitled()` needed no change because the row is an ordinary
   `institution` entitlement with no period; see the unit log.
10. **Legal and data rights.** `/privacy`, `/terms`, cookie banner (only if non-essential cookies
    exist — goal is none), `POST /api/account/delete` (soft delete then purge job), export as JSON.
    Delivered in unit 3f — no cookie banner, because the only cookie is the session cookie; see the
    unit log.
11. **RLS tests.** `tests/db/rls.spec.js` creates two users and asserts 15 negative cases, including a
    direct-PostgREST attempt by user A to insert a completion for themselves (must fail: no insert
    grant, no insert policy).
    Delivered in unit 1, and every later migration that added a table or a function extended it; see
    `tests/db/` for the current count.

## Acceptance criteria — evidence table (2026-10-31)

Rewritten as an evidence table on **2026-10-31** from the checklist it replaces. Verdicts, witnesses and the build items (B1–B14) are defined in [`reviews/completeness-2026-10-31.md`](reviews/completeness-2026-10-31.md). A row marked **Proven** names a witness this review re-ran: a `path:line` inside a test that executed (the strongest), a `gate:<script>` the review ran green, or an `artifact:<path>` whose existence is the whole claim (a document, a config file). No row is left grey.

| ID | Criterion | Verdict | Witness | State exercised | Decision |
| --- | --- | --- | --- | --- | --- |
| p4-289 | Progress survives device switch and cache clear | Built, unproven | `tests/db/progress.spec.js` (server-side rows); no UI path | DB only | Build B1 |
| p4-290 | Test-mode subscription unlocks within one webhook tick | Built, unproven | `tests/db/stripe.spec.js:100` | DB only | Build B1 |
| p4-294 | Refund revokes access on the next request | Built, unproven | `tests/db/stripe.spec.js:176` | DB only | Build B1 |
| p4-298 | Revocation holds with a pre-existing access token | Built, unproven | `tests/db/stripe.spec.js:176` | DB only | Build B1 |
| p4-304 | Second device signed in before purchase unlocks without re-login | Built, unproven | `tests/db/stripe.spec.js:129` | DB only | Build B1 |
| p4-307 | Soft prompt at 4, hard gate at 5, direct URL blocked | Built, unproven | `lib/paywall.js` + `tests/paywall.test.js:49`; hard gate needs `PAYWALL=on` **and** accounts, which no run has | no enforced state | Build B1 |
| p4-312 | Deleting an account removes profile, progress, attempts, points and streaks; payments, entitlements and the certificate are retained in the documented legal form | Built, unproven | `tests/db/institution.spec.js:148` (seat) and `tests/db/legal.spec.js` | DB only | Build B1 |
| p4-320 | RLS proves A cannot read/write B, cannot insert a completion | Built, unproven | `tests/db/rls.spec.js:161` (M31 goes red) | DB only, ungated | Build B1 |
| p4-322 | Webhook replay produces no duplicate entitlement | Built, unproven | `tests/db/stripe.spec.js:151` | DB only | Build B1 |
| p4-325 | No secret in the client bundle (`grep` gate in CI) | Absent | `.github/workflows/ci.yml` has no such step; no script does it | n/a | Build B11 |

## Test plan

| Area | Tests |
|---|---|
| Auth | signup, verify, login, reset, magic link, session expiry |
| Migration | local→server merge matrix (fresh, partial, complete) |
| Entitlement | matrix: free, sub active, sub past_due, lifetime, refunded, institution, revoked; stale-token revocation; second-device unlock |
| Stripe | test clocks: subscribe → refund → resubscribe; webhook replay; out-of-order events |
| RLS | 15 negative cases, one per policy gap, including self-forged completion; a positive case per policy so a missing policy fails loudly |
| Paywall | browser + direct URL + API |
| Deletion | data gone, export works, certificate retained |

## Risks

| Risk | Mitigation |
|---|---|
| RLS misconfiguration leaks data | policy tests in CI per table; service-role only in webhook/jobs |
| Learner forges a completion to earn a certificate | no insert/update grant on progress tables; writes only through the API route; forgery case in the RLS suite |
| Gate drifts back to a token claim | `is_entitled()` is the only gate; the stale-token test fails the build if a claim is trusted |
| Payment edge cases (past_due, disputes) | enumerate states in a table, test each, default to "not entitled" |
| Anonymous merge duplicates progress | idempotent writer keyed by natural key |
| Legal exposure (refunds, tax) | Stripe Tax on, refund path tested, clear terms page |
| Auth email deliverability | use Supabase SMTP with a verified domain before launch |

## Unit log

This section is the per-unit record: gate output, deviations, defects found, and the rows each unit
left open. The rolled-up gate, with the rows that can and cannot be closed from this checkout in one
table, is
[`reviews/phase-04-accounts-entitlements-verification-plan.md`](reviews/phase-04-accounts-entitlements-verification-plan.md)
— written after unit 3h, see the last entry below.

### 2026-10-30 — unit 1: schema, RLS and a live local stack (items 1 and 11)

**Closed:** work item 1 (schema + migrations + seed) and work item 11 (RLS test suite), and the
`RLS suite proves user A cannot read or write user B's rows…` acceptance criterion.

```
$ npm run db:check
ℹ tests 34
ℹ suites 7
ℹ pass 34
ℹ fail 0
```

The three standing gates are unchanged by this unit:

```
ℹ tests 653 / suites 105 / pass 653 / fail 0
content: 16 of 88 catalogued lessons, 16 groups, 22 screens, 268 fixtures replayed
✓ content passes — 111 accepted and 157 rejected formulas agree with the grader
built 27 pages (741.4 kB of HTML+CSS)
next routes: 27 prerendered pages match the shared templates
verified 16 lesson pages, the index, the dashboard and 9 group pages — 851 checks passed
52 passed (11.4s)          # npx playwright test
vendor: 25 files match manifest.json
```

`npm run db:check` runs `supabase db reset` first, so it is deterministic: it rebuilds the schema from
`supabase/migrations`, reseeds, then runs `tests/db/rls.spec.js`. It is a hand-run gate like
`vendor:check`, not part of `npm run check` — CI has no database.

#### Deviations from this document

- **`db/migrations` → `supabase/migrations`** (item 1). The Supabase CLI hardcodes the directory and
  `config.toml` cannot redirect it. The SQL is the DDL in [Data model](#data-model) as written.
- **Local ports 54350–54359** instead of 54321+. Two other Supabase projects on this machine already
  own 54321–54329; the remap keeps all three stacks up at once and changes nothing about the schema.
- **`[analytics] enabled = false`, `[edge_runtime] enabled = false`.** Under colima the analytics
  container bind-mounts `~/.colima/default/docker.sock`, which colima does not support, so
  `supabase start` aborts with `mkdir … docker.sock: operation not supported`. Neither service is used
  by this phase. Re-enable analytics if the stack moves to Docker Desktop.

#### Three defects the suite found in the documented policy set

Each was fixed in `0002_accounts_rls.sql` by adding a grant or revoke. No assertion was relaxed.

1. **Profile privilege escalation.** `profiles_self_update` proves row ownership only, so
   `PATCH /rest/v1/profiles {role:"admin"}` and `{group_id:null}` both returned `200` and wrote. Fixed
   by replacing the table-level update grant with column-level grants on
   `username, display_name, linkedin_url, timezone`; both patches now fail `403 42501 permission denied
   for table profiles`.
2. **TRUNCATE bypasses RLS.** The platform grants `anon`/`authenticated` `ALL` on new `public` tables,
   and the revoke list in this document omits `truncate`, `references`, `trigger` and `maintain`. Any
   signed-in learner could have truncated `attempts`. Added the missing revokes.
3. **`feedback` has no read path.** The policy set gives an insert policy and nothing else, so an insert
   with `Prefer: return=representation` fails `42501` even when the with-check passes. `return=minimal`
   returns `201`. Left as documented and asserted both ways — see open rows.

#### Open rows

| Row | Blocked by |
|---|---|
| `feedback` insert with `return=representation` fails; needs either a `feedback_self_read` policy or a client that always sends `Prefer: return=minimal` | decision, not infrastructure |
| Items 2–3 (auth flows, profile onboarding), 4–5 (progress writer, anonymous import), 8 (paywall), 10 (legal/data rights) | not started; each is its own unit |
| Item 6 (Stripe) and the subscription/refund/second-device acceptance criteria | needs Stripe test keys and a deployed Supabase project |
| Item 9 institutional domain allowlist | not started |
| RLS suite in CI | no database in CI today; needs a Postgres service container |
| Seed users authenticate against `auth.users`/`auth.identities` by direct insert — version-sensitive; recreate through the GoTrue admin API if a CLI upgrade breaks it | maintenance note |

### 2026-10-31 — unit 2: the auth flows (work item 2, and item 3's provisioning half)

**Closed:** work item 2 — `/signup`, `/login`, `/reset`, `/reset/password`, the magic-link callback,
session refresh on every request, and the `?next=` gate on `/account`. Work item 3 is half closed: a
`profiles` row is now created for every sign-up by a trigger, so no account can exist without one; the
name/username onboarding *step* is still open.

Every page renders and is usable with no Supabase project configured — the state CI and a fresh clone
are in. That is asserted in a browser, not assumed:

```
$ npm run db:check
ℹ tests 52      # 34 RLS + 18 auth
ℹ suites 10
ℹ pass 52
ℹ fail 0

$ npx playwright test
60 passed (10.0s)     # was 52: +5 auth routes, +3 axe scans

$ npm run check
ℹ tests 675 / suites 110 / pass 675 / fail 0        # was 653 / 105: +22 auth rule tests
content: 16 of 88 catalogued lessons, 16 groups, 22 screens, 268 fixtures replayed
✓ content passes — 111 accepted and 157 rejected formulas agree with the grader
built 27 pages (741.4 kB of HTML+CSS)
next routes: 27 prerendered pages match the shared templates
verified 16 lesson pages, the index, the dashboard and 9 group pages — 851 checks passed

$ npm run vendor:check
vendor: 25 files match manifest.json
```

What the suites actually assert, so this log is checkable rather than reassuring:

- `tests/auth.test.js` (22) imports the pure rules and never restates them: the `safeNext` matrix
  (`//evil.com`, `/\evil.com`, `http://…`, control characters, non-strings all rejected), `loginUrl`
  encoding, `authConfig` parsing (http/https only, trailing slashes, reason strings), the 8–72 password
  bound, and the six error-copy rewrites.
- `tests/db/auth.spec.js` (18) runs against the real stack: the trigger's username derivation,
  display-name passthrough, collision suffix and `learner_<hex>` fallback; `profiles` readable by its
  owner over PostgREST and not insertable (403); password sign-in, wrong password 400, unknown address
  400, refresh, and sign-out revoking the refresh token; recovery and magic-link e-mails arriving in
  Mailpit with the right `type=` on the verify link, with an unknown address still answering 200 (no
  enumeration).
- `e2e/auth.spec.js` (5) and three new axe scans cover the unconfigured path: the notice, the disabled
  form, `noindex` on all three pages, and `/auth/callback?next=//evil.com` landing on `/login`.

#### Deviations from this document

- **`middleware.js` → `proxy.js`.** Next 16 deprecated the `middleware` convention; the file exports
  `proxy()` and the same `config.matcher`. Session refresh lives there, as planned.
- **`[auth.rate_limit] email_sent = 2 → 30`** in `supabase/config.toml`. The DB suite sends three
  e-mails per run and the local catcher is the only consumer; the documented default makes the suite
  fail on its second run within the hour. Stack-local only — no production setting changes.
- **`0003_profile_provisioning.sql` (new)** — a `security definer` trigger on `auth.users`. Work item 3
  assumed the application would insert the profile; with `enable_confirmations = false` a sign-up
  returns a session immediately, so between the GoTrue insert and the application insert there is a
  window where a signed-in learner has no profile, and any failure leaves them without one forever. The
  seed's own profile insert became an upsert for the same reason.
- **The magic-link form is rendered on `/login` only when a project is configured**, so the
  unconfigured page stays a single honest card rather than a second control that cannot work.
- **`app/auth.css` is Next-only.** The static build has no auth pages; adding rules to
  `legacy/src/styles/components.css` would move its byte count for pages that do not exist there.

#### Two defects the suites found

1. **No profile was ever created on sign-up.** The seed inserted profiles by hand, which hid it: a real
   sign-up produced an `auth.users` row and nothing else, so `/account` had nothing to read. Fixed by
   the trigger above, not by a test that tolerated a missing row.
2. **The Suspense fallback was styled as a notice.** `Loading the form…` carried `.auth-notice`, the
   same class the "accounts are not configured" explanation uses, so a caller (and a screen reader)
   looking for the notice found two of them, and the browser suite failed on the streamed page. Fixed at
   the cause: the fallback is its own `Loading` component with `.auth-loading` and `role="status"`.

#### Open rows

| Row | Blocked by |
|---|---|
| Header/footer links to `/login` and `/account` | every shared template's bytes and the fragment parity check; needs a decision on whether the static build learns about accounts |
| Profile onboarding step (name + username, optional LinkedIn) | unit 3, with the progress writer |
| E-mail templates (reset, magic link) | local GoTrue defaults are used; product copy and a SMTP provider are a deployment decision |
| Items 4–5 (progress writer, anonymous import), 8 (paywall), 10 (legal/data rights) | not started; each is its own unit |
| Item 6 (Stripe) and the subscription/refund/second-device acceptance criteria | needs Stripe test keys and a deployed Supabase project |
| Item 9 institutional domain allowlist | not started |
| `tests/db` in CI | no database in CI today; needs a Postgres service container |
| `feedback` insert with `return=representation` | unchanged decision from unit 1 |

### 2026-10-31 — unit 3a: the progress writer (work item 4, server half)

**Closed:** the write half of work item 4 — `POST /api/progress` accepts the drill's event buffer,
derives every row from it, and writes it through `record_progress` as the service role. Still open:
the browser half (nothing drains `globalThis.__esEvents` yet) and the anonymous `es.progress` import,
which is unit 3b.

The derivation is pure and imported by its test, so the numbers a report reads are computed in one
place rather than restated in the assertion:

```
$ npm run db:check
ℹ tests 66      # 34 RLS + 18 auth + 14 progress
ℹ suites 15
ℹ pass 66
ℹ fail 0

$ npm run check
ℹ tests 685 / suites 112 / pass 685 / fail 0     # was 675 / 110: +10 derivation tests
content: 16 of 88 catalogued lessons, 16 groups, 22 screens, 268 fixtures replayed
✓ content passes — 111 accepted and 157 rejected formulas agree with the grader
built 27 pages (741.4 kB of HTML+CSS)
next routes: 27 prerendered pages match the shared templates
verified 16 lesson pages, the index, the dashboard and 9 group pages — 851 checks passed

$ npx playwright test
62 passed (10.2s)     # was 60: +2 for the unconfigured progress route

$ npm run vendor:check
vendor: 25 files match manifest.json
```

What the suites assert, so this log is checkable rather than reassuring:

- `tests/progress-sync.test.js` (10) imports `deriveUpdates`/`parseBatch`: a first-try solve yields one
  attempt with `correct_first_try`; misses stay on the screen that produced them; a hint-assisted solve
  is not a first try; a screen the learner only looked at writes no row; an abandoned screen closes at
  the view that replaced it; a repeat keeps the best score and the first completion; a batch mixing two
  lessons, an unknown event type, a bad timestamp, more than 500 events or no lesson id is refused; junk
  props (`score: "high"`, `elapsed: NaN`) do not throw; and a body without a uuid is refused rather than
  given a server-generated key.
- `tests/db/progress.spec.js` (14) runs the function against the real stack: sequences are `1, 2` per
  `(user, lesson, screen)` and an `attempt_seq` in the payload is ignored; the same batch id replays as a
  no-op and does not double-count the roll-up; a worse repeat keeps the best score, keeps `complete`,
  adds attempts and wrong counts, keeps `helped` sticky, keeps the first `completed_at` and the fastest
  `best_ms`; `first_try_accuracy` is recomputed from the rows (`50.00` for one good screen of two, even
  when the payload claims `p_score: 100`) and stays `null` when no screen produced an answer; a learner
  calling the function, or inserting into any of the three tables, gets `403`; and one account cannot
  read another's rows.

#### Deviations from this document

- **`progress_batches` (new table) rather than a `client_batch` column.** The document's "a resent batch
  is a no-op" only holds if the server can recognise the retry, which needs a key it did not invent.
  The batch id is the primary key of its own table, claimed before anything else in the same
  transaction, so the idempotency claim and the write cannot diverge.
- **`attempt_seq` is assigned inside the function**, with a five-attempt retry on `unique_violation`,
  instead of by the caller or under an advisory lock: two tabs on one screen then resolve to `1, 2`
  rather than to a failed constraint.
- **`npm run db:check` now passes `--test-concurrency=1`.** `tests/db/rls.spec.js` calls
  `resetFixtures()`, which deletes every row of `attempts` and `lesson_progress`; three files running
  in parallel would race with it. Serial is also faster than the flakes were.
- **The route is derived, not validated-to-trust.** `p_score` is clamped to `0..100` in `derive.js`
  because `lesson_progress.score` has a check constraint; a payload cannot violate it.

#### Two defects the suites found

1. **`progress_batches` was world-writable by any signed-in learner.** Supabase's default privileges
   grant `anon`/`authenticated` everything on a new `public` table, and the migration had neither
   enabled row level security nor revoked the grants — the same class of mistake the RLS entry above
   records for TRUNCATE. A learner could have claimed an arbitrary batch id before the server used it,
   which would turn a future write into a silent no-op. Fixed in `0004_progress_write.sql`:
   `enable row level security` plus `revoke all from anon, authenticated`, both asserted (`403`).
2. **A batch id owned by another account was swallowed as a replay.** `on conflict do nothing` cannot
   tell "my retry" from "someone else's key", so it returned `replayed: true` and wrote nothing. Now the
   function re-reads the owner and raises `23505` on a collision, which the route reports as `409 batch_id_conflict`
   rather than adding a row or reporting success for a dropped batch. Asserted both ways.

#### Open rows

| Row | Blocked by |
|---|---|
| The browser sender (drain `__esEvents`, POST on lesson end and on `pagehide`) | closed in unit 3b — see the next entry |
| Anonymous `es.progress` import with `min(completed_at)` merge and an `es.progress.migrated` marker | still open; needs the merge rule, not just a transport |
| The `201` path of `POST /api/progress` over HTTP | needs a Next server with a configured Supabase project in the test job; today the route's success path is proved at the function and module level, and its refusal path in a browser |
| Profile onboarding step (name + username, optional LinkedIn) — work item 3 | not started |
| Items 5 (legal/data rights), 6 (Stripe), 8 (paywall), 9 (allowlist) | not started; item 6 also needs Stripe test keys |

### 2026-10-31 — unit 3b (the browser sender)

The drill already kept a bounded event buffer in `globalThis.__esEvents`; nothing shipped it. This unit
adds the transport and nothing else: the sink gained a subscription hook, the batching is a pure module,
and a null-rendering client component owns the fetch. No template changed, so the static build and the
fragment diff are untouched by design, and the numbers below are the proof.

```
npm run check
ℹ tests 696
ℹ suites 113
ℹ pass 696
ℹ fail 0
content: 16 of 88 catalogued lessons, 16 groups, 22 screens, 268 fixtures replayed
✓ content passes — 111 accepted and 157 rejected formulas agree with the grader
built 27 pages (741.4 kB of HTML+CSS) → /Users/danil/Desktop/excelsupreme/legacy/dist
next routes: 27 prerendered pages match the shared templates
verified 16 lesson pages, the index, the dashboard and 9 group pages — 851 checks passed

npx playwright test
  63 passed (10.0s)

npm run db:check
ℹ tests 66
ℹ pass 66
ℹ fail 0

npm run vendor:check
vendor: 25 files match manifest.json
```

`685 → 696` unit tests (the new `tests/progress-sender.test.js`, 11 cases) and `62 → 63` e2e. The page
count, the byte count, the screen and fixture counts and the check count are unchanged: a component that
renders `null` adds no markup, which is exactly what parity requires.

#### What ships

- **`legacy/src/client/drill.js`** — one `notify(event)` call in the sink's `write`, which calls
  `globalThis.__esOnEvent` if a transport installed one, inside `try/catch`. Grading cannot depend on a
  subscriber: a throw is logged at `debug` and the buffer keeps the event either way. No subscriber
  exists in the static build, so its behaviour is unchanged.
- **`lib/progress/sender.js`** — `createCollector()`: buckets by `event.id` (one lesson per batch, which
  is what `deriveUpdates` accepts), dedupes by object identity (the seed and the hook deliver the same
  object), drops events that name no lesson (`track_view` counts the whole track), offers a batch on
  `lesson_complete`/`lesson_exhausted` or at 120 events, and separates `take` from `restore` so a refused
  batch goes back in front of whatever arrived meanwhile.
- **`app/progress-sender.js`** — `"use client"`, renders `null`. Seeds from `__esEvents`, installs
  `__esOnEvent`, posts `{ batch_id: crypto.randomUUID(), events }` to `/api/progress`, flushes every
  pending lesson on `visibilitychange → hidden` and `pagehide` with `keepalive`, gives up for the page on
  `401`/`403`/`503`, restores on `400`/`5xx`/network error, and treats `409` (a key already used) as done.
  It refuses to install when a hook already exists — a second mount would re-seed the same buffer and
  send it again under a fresh id, a replay the server cannot recognise.
- **`app/layout.js`** — mounts it next to the feedback script.
- **`tests/progress-sender.test.js`** (11), **`e2e/progress.spec.js`** (+1): the e2e case types a real
  answer into `sum-basics`, and reads the request the page actually made — the batch id is a v4 uuid, the
  batch carries `drill_start`/`check_correct`/`lesson_complete`, every event names `01-sum-basics`, and
  the answer is `503` with grading unaffected.

#### Why the id is a slug in the URL and an id in the event

`deriveUpdates` and `record_progress` key on the catalog id (`01-sum-basics`); the page URL is the slug
(`/learn/excel/sum-basics`). The e2e case asserts the event id, because that is what the route checks
against `loadSite().index`.

#### Still open

| Row | Blocked by |
|---|---|
| Anonymous `es.progress` import with a `min(completed_at)` merge and an `es.progress.migrated` marker | needs a merge rule the database does not have yet; the sender is a prerequisite and now exists |
| The `201` path of `POST /api/progress` over HTTP | needs a Next server with a configured Supabase project in CI; the success path is proved at the function and module level (`tests/db/progress.spec.js`, `tests/progress-sync.test.js`), the refusal path in a browser |
| A signed-in flush through the real route | same: no database in the e2e job |
| Profile onboarding step (name + username, optional LinkedIn) — work item 3 | not started |
| Items 5 (legal/data rights), 6 (Stripe), 8 (paywall), 9 (allowlist) | not started; item 6 also needs Stripe test keys |

### 2026-10-31 — unit 3c (the signed-out roll-up, item 5)

Phase 2 has kept `es.progress` in `localStorage` since before there were accounts: per lesson a
completion date, a `tries` count and a `helped` flag. Without this unit, signing in on a new browser
throws all of it away. The row has been open since unit 3a because it needs a merge rule, not a
transport — and the transport is now in place, so this unit adds the rule.

```
npm run check
ℹ tests 709
ℹ suites 115
ℹ pass 709
ℹ fail 0
content: 16 of 88 catalogued lessons, 16 groups, 22 screens, 268 fixtures replayed
✓ content passes — 111 accepted and 157 rejected formulas agree with the grader
built 27 pages (741.4 kB of HTML+CSS) → /Users/danil/Desktop/excelsupreme/legacy/dist
next routes: 27 prerendered pages match the shared templates
verified 16 lesson pages, the index, the dashboard and 9 group pages — 851 checks passed

npx playwright test
  65 passed (10.8s)

npm run db:check
ℹ tests 73
ℹ suites 18
ℹ pass 73
ℹ fail 0

npm run vendor:check
vendor: 25 files match manifest.json
```

`696 → 709` unit tests (`tests/progress-migrate.test.js`, 13 cases), `66 → 73` database assertions
(`tests/db/migrate.spec.js`, 7 cases), `63 → 65` e2e. Page count, bytes, screens, fixtures and verify
checks are unchanged: the component still renders `null` and no template changed.

#### What ships

- **`supabase/migrations/0005_anonymous_progress.sql`** — `import_lesson_progress(p_user, p_batch,
  p_lessons)`. The batch id is claimed from the same `progress_batches` table as `record_progress`, with
  the same owner-scoped replay rule (a replay returns `replayed: true, lessons: 0`; another account's key
  raises `23505`, which the route reports as `409`). Each lesson is `insert … on conflict (user_id,
  lesson_id) do update` with `completed_at = least(coalesce(lp, excluded), coalesce(excluded, lp))`,
  `score = greatest`, `helped` sticky, `status` latched to `complete`. `attempts` and `wrong_count` are
  assigned `0` on insert and never incremented, so `first_try_accuracy` stays `null` until a real batch
  arrives. Revoked from `public, anon, authenticated` — the service role calls it, nobody else may.
- **`lib/progress/migrate.js`** — `localLessons(record)` reads the roll-up: a completion with its date,
  a lesson with misses and no completion as `in_progress`, `score: 0` (a local record has no score, so
  the merge keeps whatever the database already had), zero and non-numeric `tries` ignored, unreadable
  dates dropped to `null` rather than invented, capped at 200 lessons. `parseMigration(body)` re-validates
  the same shape server-side and clamps `score` to `0..100`.
- **`lib/progress/write.js`** — `importProgress(client, {user, batchId, lessons})`, the RPC call; `track`
  is fixed to `excel` server-side, so a browser cannot choose it.
- **`app/api/progress/route.js`** — a `lessons` array routes to `migrate()` instead of `parseBatch`; the
  status contract is the same one (503 unconfigured, 401 signed out, 400 malformed, 409 collision, 502
  database, 201/200 written or replayed).
- **`app/progress-sender.js`** — after installing its hook, one `migrate()`: read `es.progress`, skip
  when absent, unparsable or already marked, POST `{ batch_id, lessons }`, and set
  `es.progress.migrated = "1"` only on `2xx`. A corrupt record is left exactly as found — rewriting it
  would destroy the evidence.
- **Tests:** `tests/progress-migrate.test.js` (13, pure), `tests/db/migrate.spec.js` (7, real Postgres),
  and two `e2e/progress.spec.js` cases: a seeded record produces the migrated body and, because CI has no
  accounts, keeps the marker unset after the `503`; a corrupt record produces no request at all and is
  not rewritten. Both e2e waiters now select the POST by its body, since two bodies share the route.

#### Deviations from this document

- **A dedicated RPC rather than synthesised events.** The tempting shortcut is to turn each completed
  lesson into a `lesson_complete` event and let `record_progress` derive the row. That would fabricate
  attempts and accuracy for screens nobody observed — the one thing the event path is built to prevent.
  A roll-up that cannot be attributed writes a roll-up.
- **`p_lessons` is a list, not a single lesson.** One migration carries the whole track, which is what a
  learner expects from "sign in and see my progress"; it is bounded at 200 so the payload cannot be used
  to write the catalog many times over.
- **The merge is idempotent in effect, but the claim is kept anyway.** A duplicate migration would be
  harmless, yet leaving it unclaimed would give the two write paths different contracts for the same key.
  One table, one rule.
- **The component asks once per page load while unmigrated.** In a deployment without accounts that is a
  `503` on every page load until an account exists. The marker is deliberately not set on failure —
  losing a learner's completed lessons to avoid a failed request is the worse trade — and the request is
  one small POST with no event buffer attached.

#### Open rows

| Row | Blocked by |
|---|---|
| The `201` path of `POST /api/progress` over HTTP | needs a Next server with a configured Supabase project in CI; the write itself is proved at the function level (`tests/db/progress.spec.js`, `tests/db/migrate.spec.js`) and the refusal path in a browser |
| A signed-in flush, and a signed-in migration, through the real route | same: the e2e job has no database |
| Profile onboarding step (name + username, optional LinkedIn) — work item 3 | not started |
| Items 5 (legal/data rights), 6 (Stripe), 8 (paywall), 9 (allowlist) | not started; item 6 also needs Stripe test keys |

### 2026-10-31 — unit 3d (the profile, work item 3)

Item 3 asks for four things: an onboarding step after the first sign-in, a name and a username, an
optional LinkedIn, and an edit path that lasts longer than one visit — with uniqueness enforced and
case-insensitive. The provisioning half has been in place since unit 2 (the `handle_new_user()`
trigger), so this unit is the learner-facing half plus the decision of *when* a profile counts as
unfinished.

```
npm run check
ℹ tests 734
ℹ suites 121
ℹ pass 734
ℹ fail 0
content: 16 of 88 catalogued lessons, 16 groups, 22 screens, 268 fixtures replayed
✓ content passes — 111 accepted and 157 rejected formulas agree with the grader
built 27 pages (741.4 kB of HTML+CSS) → /Users/danil/Desktop/excelsupreme/legacy/dist
next routes: 27 prerendered pages match the shared templates
verified 16 lesson pages, the index, the dashboard and 9 group pages — 851 checks passed

npx playwright test
  67 passed (11.4s)

npm run db:check
ℹ tests 89
ℹ suites 23
ℹ pass 89
ℹ fail 0

npm run vendor:check
vendor: 25 files match manifest.json
```

`709 → 734` unit tests (`tests/profile-rules.test.js`, 25 cases), `73 → 89` database assertions
(`tests/db/profile.spec.js`, 16 cases), `65 → 67` e2e (the profile route renders and passes an axe
scan with accounts unconfigured). Page count, bytes, screens, fixtures and verify checks are
unchanged: the new route is a partial prerender like `/account`, never a static page, and no template
moved.

#### What ships

- **`lib/auth/profile.js`** (new, pure) — `parseUsername` (3–32 characters, letters/digits/dot/
  underscore/hyphen, must start and end with a letter or digit, lowercased, ~23 reserved handles that
  would read as the deployment rather than as a learner), `parseDisplayName` (optional, ≤80, whitespace
  collapsed), `parseLinkedin` (optional; accepts a bare `linkedin.com/in/…`, normalises to
  `https://www.linkedin.com/…`, drops tracking queries, refuses any other host, any non-http scheme and
  the site front page), `parseProfile` (one error per field), `needsOnboarding`, and `afterSignIn`.
- **`app/account/profile/`** — `page.js` (document shell, `robots: noindex`, `instant = false`),
  `screen.js` (unconfigured notice, signed-out notice, the learner's own row through RLS, `?welcome=1`
  framing) and `form.js` (client form via `useActionState(updateProfile)`). The three fields are
  prefilled from the row, and "Skip for now" is offered exactly when the profile is incomplete.
- **`app/auth/actions.js`** — `updateProfile`: `NOT_CONFIGURED` guard → `parseProfile` → RLS-scoped
  `update` on `profiles` for the caller's own id → `23505` becomes "That username is taken. Try
  another." → `revalidatePath("/account")` so the account page shows the new name. `signIn`, `signUp`
  and `app/auth/callback/route.js` now route through `afterSignIn`, so a first-time account with no
  display name lands on `/account/profile?welcome=1` — unless it asked for a specific `?next=`, which
  still wins.
- **`app/account/page.js`** — a "Finish your profile" notice while the display name is empty, the
  LinkedIn address as a row (`rel="me noopener noreferrer"`), and an "Edit your profile" link.
- **Tests:** `tests/profile-rules.test.js` (rules, including every refusal a permissive check would
  let through), `tests/db/profile.spec.js` (owner write, case-insensitive collision, self-case-change,
  foreign row invisible, `role`/`id`/`group_id` refused by the column grant, anon refused),
  `e2e/auth.spec.js` and `e2e/a11y.spec.js` for the unconfigured route.

#### Why the rules live in a pure module

The alternative is validating in the form and trusting the action, or validating in the action and
re-checking in the form. Both drift. One pure module imported by the action (and by the test) means
the sentence a learner reads and the value that reaches the database cannot disagree — and the test
proves the rule rather than restating it.

#### Deviations from this document

- **No length constraints were added to `profiles`.** The doc asks for boundaries, not for them to
  live in the schema. Adding `check` constraints would mean a migration that can fail on existing
  rows; the pure rules are the gate, and the column types are permissive on purpose. The one property
  that *must* be the database's is uniqueness, and it already is (`citext unique`).
- **Onboarding is decided by an empty display name, not by a "first sign-in" flag.** A flag needs a
  column nobody else uses, and it cannot answer the question a returning learner asks ("why is my
  profile still blank?"). An empty name is a fact about the row, it is the field the step exists to
  fill, and a failed read is treated as *not* incomplete — a redirect nobody can satisfy is worse than
  no redirect.
- **`?next=` always wins.** A learner who signed in to reach a specific drill goes to that drill. The
  profile step is offered by the account page instead, which is where they will look.
- **Username uniqueness is reported, not pre-checked.** A "is this free?" lookup would be a race and a
  handle-enumeration oracle; the unique index answers the same question once, for the account that
  asked.

#### Open rows

| Row | Blocked by |
|---|---|
| A saved profile over HTTP with a real session | the e2e job has no Supabase project, so `updateProfile` is proved at the RLS level (`tests/db/profile.spec.js`) and its rules at the unit level; the browser path needs a configured deployment |
| The post-sign-in redirect actually firing | same: `afterSignIn` is unit-tested and wired, but a real sign-in needs GoTrue in the e2e environment |
| Items 6 (Stripe), 8 (paywall), 9 (allowlist), 10 (legal/data rights) | not started; item 6 also needs Stripe test keys |

### 2026-11-01 — unit 3e (the paywall, work item 8)

Item 8 asks for four things: `freeLessonCount` as configuration rather than code, a soft prompt on the
first drill past the free half, a hard gate from the next one, and a check the route itself performs so
a direct URL does not skip it. All four ship here, plus the offer page the walls need to point at, and
the number moves `5 → 3` as this document deliberately asked.

```
npm run check
ℹ tests 765
ℹ suites 128
ℹ pass 765
ℹ fail 0
content: 16 of 88 catalogued lessons, 16 groups, 22 screens, 268 fixtures replayed
✓ content passes — 111 accepted and 157 rejected formulas agree with the grader
built 28 pages (765.3 kB of HTML+CSS) → /Users/danil/Desktop/excelsupreme/legacy/dist
next routes: 28 prerendered pages match the shared templates
verified 16 lesson pages, the index, the dashboard, the pricing page and 9 group pages — 888 checks passed

npx playwright test
  74 passed (11.9s)

npm run db:check
ℹ tests 89
ℹ suites 23
ℹ pass 89
ℹ fail 0

npm run vendor:check
vendor: 25 files match manifest.json
```

`734 → 765` unit tests (`tests/paywall.test.js`, 22 cases; `tests/client.test.js` +9 in two new
suites), `67 → 74` e2e (five in the new `e2e/paywall.spec.js`, two axe scans in `e2e/a11y.spec.js`),
`27 → 28` pages (`pricing/index.html`), `741.4 → 765.3 kB`, `851 → 888` verify checks (the pricing
block). Screens, fixtures, groups and the `111 accepted / 157 rejected` grading split are unchanged:
no lesson content moved, so no verdict could.

#### What ships

- **`legacy/content/track.json`** — `freeLessonCount: 3`. Every consumer already reads it
  (`content.mjs` sets `free` per entry, `index-page.mjs` and `exercise-page.mjs` print the split), so
  the client, both builds, the offer page and the server rule all follow one number.
- **`legacy/src/client/state.js`** — `gateFor` is now tri-state (`open` / `prompt` / `paywall`)
  instead of boolean, and `GRACE_KEY`/`parseGrace`/`graceUsed`/`grantGrace` keep one free pass per
  lesson in the same store the trial and progress already use. The rules stay DOM-free so the server
  and the browser can share them.
- **`legacy/src/client/drill.js`** — the prompt wall (a "Continue free this once" button, `grace_start`
  in the event stream, and a note stating that the pass is remembered in this browser) and the trial
  wall both link to `/pricing`. `blockingGate()` asks `gateFor` rather than re-deriving the boundary.
- **`legacy/src/site/pricing-page.mjs`** (new) — `preparePricingPage` renders the offer from the
  catalog: "What stays free" (linked), "What the paid half adds" (named, not linked), "The price,
  plainly" (`$59.99/year`, refund guarantee, cancel anytime), and an honesty notice that checkout is
  not open in this build. Counts are computed, never typed.
- **`app/pricing/page.js`** + `pricing/index.html` in the static build — one template, two shells, the
  same fragments `check-next-pages.mjs` diffs. `noindex`, out of the sitemap, `robots: follow`.
- **`lib/paywall.js`** (new) — the single server rule: `paywallEnforced(env)` (flag **and** accounts
  configured), `paywallDecision({entry, freeLessonCount, entitled, enforced})` delegating to the same
  `gateFor` with `trial: null`, and `entitledFor(supabase, user)` → `rpc("is_entitled")`, fail-closed.
- **`proxy.js`** — after `auth.getUser()`, a lesson request the catalog calls paid (and the learner is
  not entitled for) is redirected to `/pricing`. Next 16's proxy runs on the Node.js runtime, so it
  can import `loadSite()`; the alternative was a generated slug→number manifest, which is a second
  source of truth for the same fact.
- **`packages/session/events.js`** — `grace_start` added to the closed event vocabulary.
- **Tests:** `tests/paywall.test.js` (decision matrix, flag matrix, entitlement RPC, `proxy.js` source
  probes, offer-page facts), `tests/client.test.js` (`gating` and `grace` suites, plus drill source
  probes), `tests/build.test.js` (28 pages), `tests/track-schema.test.js` (`3`), `e2e/paywall.spec.js`
  (prompt opens once and does not reappear, wall blocks, offer page reachable from both, every
  catalogued free drill served without a wall), `e2e/a11y.spec.js` (offer page and both walls).

#### Why the prompt is served, not blocked

Drill 4 is the first one past the free half and the server serves it on purpose. Its "continue free
this once" button is the point of the row — a soft prompt that arrived as a redirect would be the hard
gate with a different paragraph. The wall starts at drill 5, which the server refuses.

#### Deviations from this document

- **The wall is behind `PAYWALL=on` and configured accounts.** Item 6 (Stripe) needs keys this repo
  does not have, so an unconditional wall would dead-end thirteen of sixteen drills with no way to
  buy. The rule is written and enforced; it is switched on when billing is. Recorded as an open row
  rather than a toggle nobody can test.
- **Server enforcement and the browser trial cannot coexist.** With `PAYWALL=on` a `localStorage`
  trial does not open a server wall, because a request cannot prove an honour-system fact. The flag
  therefore stays off until logout/billing exists; keeping both live would be a wall some learners
  could walk through and others could not.
- **`/pricing` is `noindex` and out of the sitemap.** Precedent is the group pages: it is reachable
  from every wall and from the header, and it is a page about a product that is not on sale yet.
  `check-next-pages.mjs` still asserts `sitemap locs === index + 1`, which is the proof it did not
  leak in.
- **The proxy reads `legacy/content` at request time.** A standalone or traced deploy needs that
  directory present next to the server bundle. Adding `outputFileTracingIncludes` for it would be a
  build setting nothing in this repo can verify, so it is recorded rather than guessed.

#### Open rows

| Row | Blocked by |
|---|---|
| The wall refusing a direct URL with a real session | `PAYWALL=on` plus a configured deployment: no keys for item 6, so the redirect is proved by the decision matrix and the proxy source probes, not by a live 307 against a paid drill |
| A purchase actually opening the paid half | item 6 (Stripe): `is_entitled` is proved at the database level (`tests/db/rls.spec.js`) and consumed by `lib/paywall.js`; nothing can write an entitled row but an operator today |
| The pricing copy being the final offer | it states the price and the terms the reference uses, and says checkout is not open; it becomes a claim rather than a placeholder when billing lands |
| Items 6 (Stripe), 9 (institutional allowlist), 10 (legal/data rights) | not started; item 6 needs Stripe test keys |

### 2026-11-02 — unit 3f: legal and data rights (item 10)

**Closed:** work item 10 — `/privacy`, `/terms`, `GET /api/account/export`, `POST /api/account/delete`,
the retention list, and the deletion receipt. No cookie banner: the application sets no non-essential
cookie, so the condition in the item ("only if non-essential cookies exist") is not met, and
`tests/legal.test.js` asserts the sentence that says so rather than adding a banner nobody needs.

```
$ npm run check
ℹ tests 794
ℹ suites 137
ℹ pass 794
ℹ fail 0
content: 16 of 88 catalogued lessons, 16 groups, 22 screens, 268 fixtures replayed
✓ content passes — 111 accepted and 157 rejected formulas agree with the grader
built 30 pages (788.2 kB of HTML+CSS) → /Users/danil/Desktop/excelsupreme/legacy/dist
next routes: 30 prerendered pages match the shared templates
verified 16 lesson pages, the index, the dashboard, the pricing page and 9 group pages — 908 checks passed

$ npx playwright test
  82 passed (17.3s)

$ npm run vendor:check
vendor: 25 files match manifest.json

$ npm run db:check
ℹ tests 99
ℹ suites 25
ℹ pass 99
ℹ fail 0
```

Every earlier floor moved up or stayed: tests 765 → 794, verify checks 888 → 908, pages 28 → 30, next
routes 28 → 30, Playwright 74 → 82, `db:check` 89 → 99. Content counts are unchanged at 16 of 88,
22 screens, 268 fixtures, 111 accepted / 157 rejected.

#### What was built

- **`supabase/migrations/0006_account_deletion.sql`** — the data-rights half of the schema.
  `profiles.deleted_at`; `entitlements` gains a surrogate `id` primary key so `user_id` can become
  null once the identity is gone (its old key survives as `entitlements_user_plan_key unique
  (user_id, plan)`, so item 6's `on conflict (user_id, plan)` still has a target); `entitlements` and
  `payments` both `on delete set null`; `is_entitled()` gains `p.deleted_at is null` so a half-deleted
  account cannot keep its subscription; `request_account_deletion()` (security definer, `auth.uid()`
  guard, `42501`, one transaction) erases attempts, progress, points, streaks and account feedback,
  anonymises `username` to `deleted-<digest>`, clears `display_name`/`linkedin_url`/`group_id`, drops
  `role` to `learner`, stamps `deleted_at`, and returns the counts it erased plus `already_requested`;
  `my_entitlements()` and `my_payments()` are definer table functions returning explicit column lists
  with **no** Stripe identifier; `revoke all … from public, anon` and `grant execute … to
  authenticated` for each.
- **`legacy/src/site/legal-page.mjs`** (new) — both documents as data: eleven sections each, the
  `RETENTION` table (three rows: payment records, entitlement, deleted-account digest), and
  `LOCAL_KEYS` read from the client's own storage keys (`es.progress`, `es.trial`, `es.grace`,
  `es.feedback`). Rendered by the static build (`privacy/index.html`, `terms/index.html`) and by
  `app/privacy/page.js` / `app/terms/page.js` from the same function, so the two shells cannot drift.
- **`lib/legal.js`** (new) — `EXPORT_FORMAT`, `EXPORT_VERSION`, `buildExport()`, `confirmed()`,
  `exportFilename()`, re-exporting the same `RETENTION` the page renders.
- **`app/api/account/export/route.js`** — 503 `account_export_unconfigured`, 401 `sign_in_required`,
  every read through the **user's** client with an explicit column list, `my_entitlements()` and
  `my_payments()` for the money, any read error → 502 `export_failed`, otherwise one pretty JSON
  download with `content-disposition` and `no-store`. It never touches the service-role key, so an
  export cannot out-scope the caller.
- **`app/api/account/delete/route.js`** — config check, session check, confirmation word
  (`delete my account`, form or JSON) → 400 `confirmation_required`, `request_account_deletion()`,
  then `auth.admin.deleteUser()` for the identity that a definer function cannot remove; a failed
  purge answers 502 `identity_purge_failed` **with the erased counts**, because the soft step really
  did happen and saying otherwise would be a lie; success is 303 to `/account/deleted` for the form
  and `{ ok, erased }` for JSON. CSRF is `SameSite=Lax` plus the confirmation word, documented in the
  route header.
- **`app/account/page.js`** — the data-rights block: the export link, the `/privacy` link, and the
  destructive form (pattern `\s*[Dd]elete [Mm]y [Aa]ccount\s*`, `required`). **`app/account/deleted`**
  is the receipt: what was erased, and the two rows kept unlinked. `proxy.js` exempts it, because the
  session is gone by the time it renders.
- **`app/sitemap.js`, `legacy/src/verify.mjs`, `scripts/check-next-pages.mjs`, `renderSitemap`,
  `tests/build.test.js`, `tests/metadata-routes.test.js`, `e2e/routes.spec.js`** — the sitemap grew
  from `index + 1` to `index + 3` in all six places at once. It throws on a mismatch, so the two legal
  pages cannot be added to one build and not the other.
- **Tests:** `tests/legal.test.js` (29 — page/section/storage-key/retention/copy/metadata invariants,
  sitemap parity across both builds, `buildExport`, `confirmed`, `exportFilename`, and source probes
  for the two routes, the account page and the proxy), `tests/db/legal.spec.js` (self-scoped RPCs, no
  Stripe identifier, anon refused, a `{ uid }` body not honoured, anonymous erase refused with the
  rows intact, the erase and its counts, `is_entitled` false while the other learner stays entitled,
  the money retained and then unlinked, retry reported as a retry), `e2e/legal.spec.js` (both pages,
  the receipt, the footer links, the sitemap entries, export 401/503, delete 401/503),
  `e2e/a11y.spec.js` (both legal pages and the receipt).

#### Deviations from this document

- **"Soft delete then purge job" is a soft step plus an immediate purge.** There is no scheduler in
  this repo and adding one would be new infrastructure this unit cannot verify. `request_account_deletion()`
  erases the behaviour and anonymises the profile in one transaction; the route then deletes the auth
  identity. If the identity deletion fails, the account is already inert and the route says so with
  the counts, and a retry reports `already_requested` instead of pretending to erase again.
- **`entitlements` re-keyed to a surrogate `id`.** Not in the plan; forced by the plan. A primary key
  column cannot be null (`42P16`), and the retention form the acceptance row asks for needs the money
  row to outlive the profile it points at. The unique constraint keeps the original intent.
- **The legal copy is not the reference's.** The reference pages are App Factory, LLC boilerplate —
  Privacy Shield, arbitration, a governing-law clause for an entity that does not operate this build.
  Copying them would state things about this site that are false. The ported pages describe what this
  code actually does and say plainly that they have not been reviewed by a lawyer.
- **`/privacy` and `/terms` are in the sitemap, unlike `/pricing`.** They are the pages a crawler is
  supposed to index; the offer page describes a product that is not on sale.

#### Annotations, not ticks

The deletion acceptance row names two things that do not exist to delete:

- **`referral_code`** — `0001_accounts_schema.sql` has never had the column and nothing reads it, so
  there is nothing for the erase to clear. Recorded here so the row is not quietly claimed.
- **`certificates`** — no such table, and none before phase 6. The row's "the certificate is retained"
  is unimplementable today; the two rows that do exist (payment, entitlement) are retained and proved.

#### Open rows

| Row | Blocked by |
|---|---|
| A deletion purge running on a schedule (the plan's "purge job") | no scheduler and no cron in this repo; the purge is immediate and the executor is the route |
| The certificate half of the retention row | phase 6: no certificate is issued, so none can be retained |
| The referral-code half of the same row | the column never existed; nothing writes it |

### 2026-11-02 — unit 3g: institutional access (item 9)

**Closed:** work item 9 — `supabase/migrations/0007_institution_domains.sql`, the signup grant, the
seat limit, and `tests/db/institution.spec.js` (13 assertions). No UI, because the item says so: the
grant is the feature.

```
$ npm run db:check
ℹ tests 112
ℹ suites 29
ℹ pass 112
ℹ fail 0

$ npm run check
ℹ tests 794
ℹ suites 137
ℹ pass 794
ℹ fail 0
content: 16 of 88 catalogued lessons, 16 groups, 22 screens, 268 fixtures replayed
✓ content passes — 111 accepted and 157 rejected formulas agree with the grader
built 30 pages (788.2 kB of HTML+CSS) → /Users/danil/Desktop/excelsupreme/legacy/dist
next routes: 30 prerendered pages match the shared templates
verified 16 lesson pages, the index, the dashboard, the pricing page and 9 group pages — 908 checks passed

$ npx playwright test
  82 passed (11.3s)

$ npm run vendor:check
vendor: 25 files match manifest.json
```

`db:check` moved 99 → 112 assertions and 25 → 29 suites. Everything else holds exactly: this unit is
database-only, so no page, route, screen, fixture or count changed — which is itself the check that it
touched nothing it should not have.

#### What was built

- **`institution_domains`** — `domain citext primary key check (domain = lower(domain) and domain like
  '%.%')`, `label`, optional `group_id`, `seats`. RLS on and every client grant dropped (table,
  truncate, references, trigger, maintain), the same shape 0002 uses for the money tables: a table no
  policy reaches is unreadable, but the missing grant is what makes that true without relying on it.
- **`grant_institution_access(p_user uuid, p_email text) → citext`** — security definer,
  `set search_path = public, extensions`, lower-cased exact-domain match (never a suffix match), seat
  count over `entitlements ⋈ profiles where status = 'active' and deleted_at is null`, insert with
  `on conflict (user_id, plan) do nothing returning` so a second call is a no-op, and `profiles.group_id`
  set only when it is still null. Returns the domain granted or null. Execute revoked from `public,
  anon, authenticated`, granted to `service_role` only.
- **`handle_new_user_institution()`** — `after insert on auth.users`. The name is not cosmetic:
  PostgreSQL fires same-event triggers in alphabetical order, and `on_auth_user_created_institution`
  must run after `on_auth_user_created` so the profile the `entitlements.user_id` foreign key points at
  exists. The suite proves the ordering by reading `profiles.group_id` afterwards.
- **`entitlements.institution_domain`** — a citext column referencing the allowlist row. The plan's
  DDL did not have it and the seat count needs it: a profile has never held an email address, so "how
  many of this institution's seats are used" is unanswerable from `profiles` alone, and the grant would
  not be auditable after the fact. `on delete set null`, so retiring a domain does not delete the
  entitlement it paid for.
- **`my_entitlements()`** — dropped and recreated with `institution_domain` in the column list, grants
  reissued. `create or replace` cannot change a return type, and the export document is supposed to say
  who paid, so the new column has to be in it.
- **Tests:** `tests/db/institution.spec.js` signs real accounts up through GoTrue against a real
  Postgres and then asks the questions a learner would ask over HTTP: the grant exists, has no period,
  and carries the allowlist row's group; a mixed-case address matches a lowercase row; an absent domain
  signs up normally with no grant; `learner@northgate.example.evil.example` is refused, so the match is
  a domain and not a suffix; a two-seat institution grants two and refuses the third without revoking
  anyone; a deletion frees the seat it held; the allowlist answers a learner and the anon role with a
  permission error rather than an empty list; a learner cannot insert a domain, insert their own grant
  row, or call the grant function; and the service role can do all three, which is the operator's
  backfill path.

#### Deviations from this document

- **No bulk sweep, deliberately.** The item does not say whether a domain added today covers accounts
  that signed up yesterday. Retroactive granting is not implementable as a trigger, and running it is a
  product decision, not a code one — so an operator backfills one account at a time with
  `select grant_institution_access('<uuid>', '<email>')` as the service role, which is the same
  function the trigger calls and is idempotent. The migration header says so out loud rather than
  leaving the gap for someone to discover.
- **A `seats` column the plan did not name.** "Institutional access" without a seat count is an
  unlimited licence; a two-seat institution is the case that proves the limit is real, and the suite
  uses one. `default 1` keeps a row honest if the operator does not think about it.
- **`set search_path = public, extensions`, not `public`.** `citext` is installed in `extensions` (0001),
  and PostgreSQL resolves a function body's types against the function's own `search_path`. The first
  run of the migration failed on exactly this (`type "citext" does not exist`) — recorded because the
  next function that returns a citext column will hit it too.
- **`institution_domains` is not in `harness.mjs`'s `FIXTURE_TABLES`,** so the suite inserts and
  deletes its own rows. `resetFixtures` clears rows `not.is.null` on tables the seed populates; the
  allowlist has no seed row to restore, and the suite's `before`/`after` are the only writers.

#### Annotations, not ticks

- **Nothing reads `institution_domains` in the browser, and that is the delivered state.** The item's
  "No UI yet beyond the grant" is met: `app/account/page.js` learns about the plan only through
  `is_entitled()`, and the export names the domain because it is part of the money rows.
- **`group_invites` was already in 0001 and is unchanged here.** The item lists it beside `groups`;
  the institutional grant reuses `profiles.group_id` rather than issuing invites, because a cohort
  arriving through a domain does not need an invitation code.

#### Open rows

| Row | Blocked by |
|---|---|
| A retroactive sweep for domains added after sign-up | product decision, not code; the per-account backfill path is proved |
| Group admin UI for an institution owner | out of scope per the item ("No UI yet beyond the grant") |

### 2026-11-02 — unit 3h: the payment path (item 6)

**Closed:** work item 6 — `supabase/migrations/0008_stripe_webhook.sql`, `lib/stripe.js`,
`app/api/stripe/{checkout,portal,webhook}/route.js`, `scripts/stripe-seed.mjs`, the pricing page's
button, `tests/stripe.test.js` (32) and `tests/db/stripe.spec.js` (17). Written and proved without a
Stripe account: every network call is either injected (`stripePost` takes a `fetchImpl`) or replaced by
the database function the webhook would have called.

```
$ npm run db:check
ℹ tests 129
ℹ suites 33
ℹ pass 129
ℹ fail 0

$ npm run check
ℹ tests 826
ℹ suites 144
ℹ pass 826
ℹ fail 0
content: 16 of 88 catalogued lessons, 16 groups, 22 screens, 268 fixtures replayed
✓ content passes — 111 accepted and 157 rejected formulas agree with the grader
built 30 pages (788.2 kB of HTML+CSS) → /Users/danil/Desktop/excelsupreme/legacy/dist
next routes: 30 prerendered pages match the shared templates
verified 16 lesson pages, the index, the dashboard, the pricing page and 9 group pages — 908 checks passed

$ npx playwright test
  82 passed (12.5s)

$ npm run vendor:check
vendor: 25 files match manifest.json
```

`db:check` moved 112 → 129 assertions and 29 → 33 suites; `npm test` moved 794 → 826 and 137 → 144.
Everything else holds exactly, including the 788.2 kB of HTML: the pricing page renders byte-identically
when the deployment cannot take money, which is the state CI builds in.

#### What was built

- **`stripe_events` is the lock, and it was already there.** 0001 declared it; this unit is the first
  thing that writes to it. `apply_stripe_event()` inserts the event id **first** and returns
  `{applied: false, reason: "duplicate"}` when the insert loses, so every branch below runs at most
  once. One function rather than six route handlers means the claim and the work share a transaction:
  a handler that claims and then throws would leave a claimed-but-unapplied event, which is the one
  state that costs a learner their purchase.
- **Five handlers, one transaction.** `checkout.session.completed` records the payment and settles a
  lifetime purchase; `customer.subscription.created|updated|deleted` map Stripe's status to the four
  the schema allows (`trialing` is access, `past_due` is **not** — the plan's risk table says default to
  not entitled); `invoice.paid` records the money and extends `current_period_end`; `charge.refunded`
  marks the payment and revokes every `source = 'stripe'` plan of that account in one statement.
  Anything else is claimed and stamped `processed_at` with `reason: "ignored"`, because a delivery that
  is remembered is a delivery Stripe stops retrying.
- **`lib/stripe.js`** — configuration, the plan table, `checkoutForm`/`portalForm`, `verifySignature`
  and `stripePost`. Pure except for the `fetch` it is handed. `verifySignature` parses `t=`/`v1=`,
  refuses a timestamp outside ±300 s, accepts any one of several `v1` candidates (a key rotation), and
  compares with `timingSafeEqual` over `${t}.${raw}`. It is tested against real HMACs in both
  directions: good signature, one-byte change, wrong secret, stale timestamp, future timestamp,
  missing/malformed header, unset secret, empty body, non-hex candidate.
- **Three routes.** `/api/stripe/webhook` reads `request.text()` and verifies before it parses — never
  `request.json()`, because a JSON round trip is not byte-identical and the signature would fail for a
  reason nobody could see. `/api/stripe/checkout` creates the session **server-side** from the plan name
  and the session cookie, answers 303 for a form post and `{url}` for JSON, and sends a signed-out form
  post to `/signup?next=/pricing`. `/api/stripe/portal` reads `stripe_customer_id` with the service role
  filtered by `user.id`, so the browser never supplies a customer id.
- **`scripts/stripe-seed.mjs`** — one product, three prices, idempotent by `lookup_key`, printing the
  three `STRIPE_PRICE_*` lines to paste into `.env.local`. It prints; it never writes a secret file.
- **The pricing page has a button, conditionally.** `preparePricingPage({ checkout })` renders the
  existing gate-note when this deployment cannot take money and a plain `<form method="post">` to
  `/api/stripe/checkout?plan=annual` when it can. Both builds are handed the flag from the same
  environment, so the static page and the Next page cannot disagree; the disabled branch is byte-for-byte
  the markup that shipped before this unit.

#### Four defects found by running it, fixed at cause

- **`invoice.paid` matched on the invoice id.** The branch reused `v_sub` (`p_object ->> 'id'`, the
  invoice's own id) and then filtered entitlements by it, so a renewal fell through to the
  `stripe_subscription_id is null` arm and could extend an unrelated plan. It now overwrites `v_sub`
  with `p_object ->> 'subscription'`, and the test asserting the period moved is what caught it.
- **A renewal could not re-open a closed window.** The update required `status in ('active','past_due')`,
  so a paid invoice for a subscription that had already lapsed updated nothing — money taken, access
  still closed. `canceled` is now included, `revoked` excluded (that is a refund, and a stray invoice
  must not buy back what was returned) and `lifetime` excluded (no window to extend).
- **`export const dynamic = "force-dynamic"` is an error here.** `next.config.mjs` runs with
  `cacheComponents`, where route segment config is rejected outright and `next build` fails. Removed
  from all three routes; a `POST` handler is never cached and the responses carry `no-store`.
- **`legacy/src/build.mjs` may not import the Next app's `lib/`.** The first version did, and
  `tests/build.test.js` ("names the missing packages when legacy/ is copied without packages/") caught
  it: `legacy/` is deployed as a folder on its own, so the static build now derives the checkout flag
  from `STRIPE_SECRET_KEY` locally and `lib/stripe.js` stays the authority for how a session is built.

#### Deviations from this document

- **No Stripe SDK.** The two things Stripe is used for are a form-encoded POST and an HMAC-SHA256
  comparison; `fetch` and `node:crypto` do both. A dependency would add a second HTTP stack and a large
  type surface to the one code path that moves money, and the repo's "no new dependencies" rule applies.
- **No success/cancel routes — they are query parameters on the existing offer page.** The item says
  "success/cancel routes"; creating two pages would change the page, route and verify counts for no
  behaviour, so `success_url` and `cancel_url` are `/pricing?checkout=complete` and
  `/pricing?checkout=cancelled`. **The page does not yet read that parameter** — see the open rows.
- **A cancelled subscription is `canceled`, not `revoked`.** Only a refund revokes. Both fail
  `is_entitled()` (which requires `status = 'active'`), but the distinction is what lets a re-subscribe
  reuse the row without pretending the earlier subscription never existed.
- **`metadata.user_id` is the resolution path, with two fallbacks.** A session carries the account in
  `client_reference_id` and `metadata.user_id`; a subscription inherits it through
  `subscription_data[metadata]`, because the session object is not part of a subscription event. If an
  event names no learner the function falls back to the customer id then the subscription id already on
  an entitlement row, and refuses with `reason: "no_user"` rather than guessing.
- **The Billing Portal is an endpoint with no button.** `/api/stripe/portal` is proved as a route, and
  its 409 for an account that never paid is the honest answer; nothing links to it yet, because
  `/account` is a client-rendered screen whose markup is asserted by the phase-4 profile tests and the
  link belongs with the copy that says what cancelling does (open below).
- **`harness.mjs`'s `FIXTURE_TABLES` widened.** `entitlements` is cleaned by `id` rather than
  `user_id` (0006 lets an entitlement outlive its account, and an orphaned money row is exactly what a
  later assertion counts) and `stripe_events` was added. The first version of the payment spec failed
  on stale events from the previous run, which is the reason this is a fix and not a preference.

#### Annotations, not ticks

- **`is_entitled()` needed no change.** It already required `status = 'active'`, so `past_due`,
  `canceled` and `revoked` all read as "not entitled" the moment the webhook writes them. That is the
  plan's item 7 holding under the load item 6 puts on it.
- **`charge.refunded` deliberately does not touch `source = 'institution'`.** An employer did not refund
  anything; the spec buys a lifetime plan on an institutionally granted account, refunds it, and asserts
  the grant is still `active` and access is still open.
- **`stripe_events` rows are never deleted by the application.** Forty bytes each, and the row is the
  record that a delivery was applied. Only the test harness clears them.
- **Stripe Tax is requested, not configured.** `automatic_tax[enabled]=true` is in the session because
  the terms page says the price is the price; the registrations themselves are account state and cannot
  be created from this repo.

#### Open rows

| Row | Blocked by |
|---|---|
| Live test-mode proof: real Checkout, `stripe listen`, one subscription unlock in one tick | needs a Stripe account's test keys; the same code path is proved against the RPC it calls |
| `<5 s` unlock, and the whole flow through the route | same — the clock is Stripe's, not this repo's |
| `/pricing` reading `?checkout=complete|cancelled` and showing a receipt or a "payment cancelled" note | UI work that needs keys to be meaningful; today the parameters are ignored |
| A "Manage billing / cancel" button on `/account` posting to `/api/stripe/portal` | the endpoint is proved; the copy that says what cancelling does is not written |
| Flipping `PAYWALL=on` | every row above, plus a decision that the wall should ship before live keys exist |
| Stripe Tax registrations, test clocks, dunning settings | Stripe account state, not code |

### 2026-11-03 — the phase-4 verification plan

Eight units had landed and this document's own rule (`00-overview.md`: a review plan is written once a
phase has more than one unit) had come due, so the rolled-up gate is now
[`reviews/phase-04-accounts-entitlements-verification-plan.md`](reviews/phase-04-accounts-entitlements-verification-plan.md).
Nothing in `app/`, `lib/`, `supabase/` or `tests/` changed for this entry.

**Measured for the plan's baseline, all with no `.env.local`** (the state CI and a fresh clone are in):

```
$ npm run check
ℹ tests 1374
ℹ suites 153
ℹ pass 1374
ℹ fail 0
content: 85 of 88 catalogued lessons, 16 groups, 149 screens, 1903 fixtures replayed
✓ content passes — 885 accepted and 1018 rejected formulas agree with the grader
built 105 pages (10535.2 kB of HTML+CSS)
next routes: 105 prerendered pages match the shared templates
verified 85 lesson pages, the index, the dashboard, the pricing page and 15 group pages — 4237 checks passed

$ npx playwright test e2e/auth.spec.js e2e/paywall.spec.js e2e/legal.spec.js
17 passed (3.7s)

$ npx playwright test e2e/a11y.spec.js
18 passed (9.7s)

$ node --test tests/auth.test.js tests/stripe.test.js tests/paywall.test.js tests/legal.test.js \
    tests/profile-rules.test.js tests/progress-sender.test.js tests/progress-sync.test.js \
    tests/progress-migrate.test.js
ℹ tests 164
ℹ suites 37
ℹ pass 164
ℹ fail 0

$ npm run db:check
Applying migration 0001_accounts_schema.sql ... 0008_stripe_webhook.sql
Seeding data from supabase/seed.sql...
ℹ tests 129
ℹ suites 33
ℹ pass 129
ℹ fail 0

$ npm run vendor:check
vendor: 25 files match manifest.json
```

Per-spec database counts, measured by running each file alone (TAP does not nest by file, so the
combined run only reports the totals): rls 34, auth 18, progress 14, migrate 7, profile 16, legal 10,
institution 13, stripe 17 — 129 over 33 suites, which agrees with the combined run.

**What the plan adds beyond the unit log.** Fifteen gate rows instead of eleven units' worth of prose,
separating the commands that run here from the four that cannot: live test-mode checkout, the `<5 s`
unlock, a real cancellation through the portal, a second environment, and the `PAYWALL=on` flip. Two
of the unit log's open rows are code-only — `/pricing` reading `?checkout=complete|cancelled` and a
cancel button on `/account` — and the plan records them as **known-missing behaviour** rather than
verification gaps, because a gate row for something that was never built would read as a failure.

**Two facts the plan had to establish rather than assume**, both now in its baseline: all thirteen
tables have row level security enabled (ten policies over eight tables; `entitlements`, `payments`,
`stripe_events`, `progress_batches` and `institution_domains` are deny-all to every non-service role,
by design), and no `lib/` module carries `import "server-only"` — the boundary holds today because
only two lib modules are reachable from a `"use client"` file, which is why the plan's row 7 asserts
the import set rather than a marker.

### 2026-11-04 — unit 3i: the billing portal gets a button (item 6, follow-up)

Unit 3h proved `/api/stripe/portal` as a route and left "a 'Manage billing / cancel' button on
`/account`" open, because the button belongs with the copy that says what cancelling does. This unit
writes both, and closes the code half of that row.

**`app/account/page.js`** — an entitled account now renders a "Your plan" section between the sign-out
form and "Your data": one paragraph (cancelling stops the next charge and keeps the period already
paid for; a lifetime plan never renews so it has nothing to cancel) and a plain
`<form action="/api/stripe/portal" method="post">`. It sits inside the `entitled` branch, so a free
account never sees a button that cannot work, and it is a form rather than a fetch for the same reason
the pricing page's checkout button is: the route answers with a `303`.

**`app/api/stripe/portal/route.js`** — the route already redirected for
`application/x-www-form-urlencoded` callers, and it now distinguishes one *earlier*: an account with no
`stripe_customer_id` (a lifetime purchase, an institutional seat, or a free account that reached the
URL by hand) used to receive a JSON `409` in the browser. A form post is now answered `303` to
`/account`; the API answer is still `409 no_billing_account`, because a caller that asked for JSON
should keep getting JSON. The content-type check is computed once (`isForm`) and used by both
branches.

**Not a refactor:** no `server-only`, no new dependency, no change to how a portal session is created,
no change to `portalForm`, no copy on the pricing page.

```
$ node --test tests/stripe.test.js
ℹ tests 36
ℹ suites 8
ℹ pass 36
ℹ fail 0

$ npx playwright test
82 passed (15.1s)

$ npm run vendor:check
vendor: 25 files match manifest.json
```

The three standing gates, unchanged except for the four new tests:

```
ℹ tests 1378
ℹ suites 154
ℹ pass 1378
ℹ fail 0
content: 85 of 88 catalogued lessons, 16 groups, 149 screens, 1903 fixtures replayed
✓ content passes — 885 accepted and 1018 rejected formulas agree with the grader
built 105 pages (10535.2 kB of HTML+CSS)
next routes: 105 prerendered pages match the shared templates
verified 85 lesson pages, the index, the dashboard, the pricing page and 15 group pages — 4237 checks passed
```

`built 105 pages (10535.2 kB)` and `verified … 4237 checks` are byte-identical to the plan-writing
run, which is the point: nothing was added to the static build, so `/pricing` and every lesson page
are untouched.

**Tests added** to `tests/stripe.test.js` (32 → 36): the form post is separated from the API call and
still redirects; the page posts the portal form; the form is behind the `entitled` branch; and the copy
says what cancelling does and what a lifetime plan means.

**Still open, and why.** `/pricing` reading `?checkout=complete|cancelled` is not this kind of edit:
`/pricing` is one of the 105 pages the static build emits and `next:check` compares fragment for
fragment, so the receipt has to exist in both renderers, and the static page ships no JavaScript — a
client-side note would be a new asset and new bytes on a page whose budget is asserted. That is a
decision about the static build, not a defect in the Next route. The `feedback` row's
`return=representation` question is the same shape: a decision about whether the dialog ever shows the
stored row, not a missing assertion.
