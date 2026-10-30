-- Phase 4 data model. Transcribed from docs/plans/parity/phase-04-accounts-entitlements.md.
-- The plan doc names db/migrations; the Supabase CLI fixes this path, so the doc carries a
-- dated deviation note instead of the code carrying a second migration directory.

create extension if not exists citext with schema extensions;
create extension if not exists pgcrypto with schema extensions;

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
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references profiles (id) on delete cascade,
  stripe_payment_intent text unique,
  stripe_event_id       text,
  amount                int  not null,
  currency              text not null default 'usd',
  kind                  text not null check (kind in ('subscription', 'lifetime', 'refund')),
  refunded              bool not null default false,
  created_at            timestamptz not null default now()
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
