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
   later; username uniqueness enforced, case-insensitive.
4. **Progress writer.** `app/api/progress/route.js` consumes the phase-2 event stream in batches,
   writes with the **service-role** client (learners hold read-only grants on these tables), upserts
   `lesson_progress` on its primary key and inserts `attempts` with a **server-assigned**
   `attempt_seq` per `(user, lesson, screen)`. Replay safety comes from
   `unique (user_id, lesson_id, screen_id, attempt_seq)` — a resent batch is a no-op, never a
   duplicate row. `first_try_accuracy` is recomputed from `attempts`, never from client totals.
5. **Migration of anonymous progress.** On first sign-in, read `es.progress` from localStorage, POST
   it, merge with `min(completed_at)` and keep the higher accuracy; then set `es.progress.migrated`.
6. **Stripe.** Products/prices created from `scripts/stripe-seed.mjs`; Checkout session server-side
   (never client-created); success/cancel routes; Billing Portal link; webhook with signature
   verification, and handlers for `checkout.session.completed`,
   `customer.subscription.created|updated|deleted`, `invoice.paid`, `charge.refunded`. The handler
   inserts the Stripe event id into `stripe_events` **before** doing any work: a duplicate
   primary-key insert short-circuits it, so a replayed or retried delivery cannot double-apply.
7. **Entitlement check, authoritative at request time.** `is_entitled(uid)`, `security definer`:
   active subscription OR non-refunded lifetime payment OR institutional grant. Every gated request
   calls it through `my_entitlements()` (one indexed lookup, in-process cache capped at 60 s per
   user). A custom `entitled` JWT claim may be stamped as a UI hint, but it is **never the gate**: a
   webhook cannot mutate a token that has already been issued, so a refund would otherwise leave
   access open for the token's remaining lifetime and a fresh purchase would not unlock on a second
   device.
8. **Paywall.** `FREE_LESSON_COUNT=3` (config, not code). Lesson 4 shows a soft prompt with
   "continue free this once"; lesson 5 hard-gates to `/pricing`. Intro/`free: true` lessons bypass.
   Server-side check in the lesson route, not only client-side. This is a deliberate change from the
   shipped build (`content/track.json` has `freeLessonCount: 5`; the reference allows 2): update the
   existing trial/paywall tests and the site copy in this phase, not later.
9. **Institutional access.** `groups` + `group_invites`; domain allowlist table; on signup, a matching
   domain creates an `institution` entitlement. No UI yet beyond the grant.
10. **Legal and data rights.** `/privacy`, `/terms`, cookie banner (only if non-essential cookies
    exist — goal is none), `POST /api/account/delete` (soft delete then purge job), export as JSON.
11. **RLS tests.** `tests/db/rls.spec.js` creates two users and asserts 15 negative cases, including a
    direct-PostgREST attempt by user A to insert a completion for themselves (must fail: no insert
    grant, no insert policy).

## Acceptance criteria

- [ ] Progress survives a device switch and a browser cache clear.
- [ ] A test-mode subscription unlocks gated lessons within one webhook tick (<5 s).
- [ ] A refund revokes access on the next request.
- [ ] Revocation holds with a pre-existing access token: sign in and load a gated lesson, refund,
      then re-request with the same token (no refresh) → blocked. This is the test that proves the
      gate is the database check, not a JWT claim.
- [ ] A second device signed in before the purchase unlocks on its next request without a re-login.
- [ ] Free user is soft-prompted at lesson 4 and hard-gated at lesson 5; direct URL is blocked
      server-side.
- [ ] Deleting an account removes profile, progress, attempts, points, streaks, and the profile's
      referral code; `payments`, `entitlements` and the certificate are retained in the documented
      legal-retention form with the name anonymised — the retention list is written down, not implied.
- [ ] RLS suite proves user A cannot read or write user B's rows, and cannot insert a completion for
      themselves through PostgREST with their own JWT (15 assertions covering the policy set above).
- [ ] Webhook replay of the same event produces no duplicate entitlement.
- [ ] No secret is present in the client bundle (`grep` gate in CI).

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

Evidence for this phase lives here rather than in `reviews/`: no `reviews/phase-04-*-verification-plan.md`
has been written yet, so this section is the record until one is.

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
