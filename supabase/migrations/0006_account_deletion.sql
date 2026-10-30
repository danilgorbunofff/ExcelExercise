-- Phase 4, item 10: a learner can take their data out, and a learner can end their account.
--
-- Two things this migration changes, and one thing it refuses to change:
--
--   * Money outlives the identity that produced it. `payments` and `entitlements` cascade from
--     `profiles` today, so deleting an account would delete the record of the refund it asks about,
--     the tax row it is owed, and the certificate it earned (phase 6 reads `lesson_progress`). Both
--     foreign keys become `on delete set null`: the row stays, the person leaves, and the retained
--     record holds no name and no email — the profile it pointed at is gone.
--   * `request_account_deletion()` is the soft step: it erases the behavioural rows (progress,
--     attempts, points, streaks, feedback) and anonymises the profile in one transaction, so a
--     deletion that fails later has still stopped collecting anything. The caller finishes the job by
--     deleting the auth identity, which is the only thing that can revoke sign-in.
--   * `is_entitled()` learns about `deleted_at`. Without that, a half-deleted account keeps its
--     subscription: the money row is still `active`, so every request the doomed session makes is
--     still served the paid drills.
--
-- Deliberately absent: a referral code. The acceptance row names one, but `0001_accounts_schema.sql`
-- has never had that column and nothing reads it, so there is nothing to clear.

-- `entitlements` is keyed by `(user_id, plan)`, and a primary key column cannot be null, so the
-- unlinked row this migration needs requires a surrogate key first. The old key survives as a unique
-- constraint: an insert still means "one entitlement per plan per learner", and item 6's `on conflict
-- (user_id, plan)` keeps working. `payments` is keyed by `id` and needs no change.
alter table entitlements drop constraint entitlements_pkey;
alter table entitlements add column id uuid not null default gen_random_uuid();
alter table entitlements add primary key (id);
alter table entitlements add constraint entitlements_user_plan_key unique (user_id, plan);

alter table entitlements alter column user_id drop not null;
alter table entitlements drop constraint entitlements_user_id_fkey;
alter table entitlements add constraint entitlements_user_id_fkey
  foreign key (user_id) references profiles (id) on delete set null;

alter table payments alter column user_id drop not null;
alter table payments drop constraint payments_user_id_fkey;
alter table payments add constraint payments_user_id_fkey
  foreign key (user_id) references profiles (id) on delete set null;

-- Null, not `now()`: a row that has never been asked to delete itself must not look like one that has.
alter table profiles add column deleted_at timestamptz;

comment on column profiles.deleted_at is
  'Set by request_account_deletion(). A non-null value means the learner erased their data and the auth identity is on its way out.';

-- The gate, with the one extra condition the paid drills need: a deleted account is not entitled,
-- even while its auth identity still exists.
create or replace function is_entitled(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from entitlements e
    join profiles p on p.id = e.user_id
    where e.user_id = uid
      and p.deleted_at is null
      and e.status = 'active'
      and (uid = auth.uid() or auth.role() = 'service_role')
      and (
        e.plan in ('lifetime', 'institution')
        or e.current_period_end is null
        or e.current_period_end > now()
      )
  );
$$;

grant execute on function is_entitled(uuid) to authenticated, anon;

-- The soft step. Returns the counts it erased so the route can say what happened instead of claiming
-- a success it cannot see, and so a retry is honest about being a retry.
create or replace function request_account_deletion() returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_user     uuid := auth.uid();
  v_profile  profiles;
  v_progress int := 0;
  v_attempts int := 0;
  v_points   int := 0;
  v_streaks  int := 0;
  v_feedback int := 0;
begin
  if v_user is null then
    raise exception 'deleting an account needs a signed-in learner' using errcode = '42501';
  end if;

  select * into v_profile from profiles where id = v_user for update;
  if not found then
    raise exception 'no profile for this account' using errcode = '42501';
  end if;

  delete from attempts where user_id = v_user;
  get diagnostics v_attempts = row_count;
  delete from lesson_progress where user_id = v_user;
  get diagnostics v_progress = row_count;
  delete from daily_points where user_id = v_user;
  get diagnostics v_points = row_count;
  delete from streaks where user_id = v_user;
  get diagnostics v_streaks = row_count;
  delete from feedback where user_id = v_user;
  get diagnostics v_feedback = row_count;

  -- `username` is `not null` and unique, so the name is replaced rather than cleared: a digest of the
  -- id is not the id, it cannot be looked up, and it keeps the constraint honest. The row itself is
  -- deleted with the auth identity a moment later; this only matters if that step has to be retried.
  update profiles set
    deleted_at   = coalesce(deleted_at, now()),
    username     = 'deleted-' || substr(md5(id::text), 1, 12),
    display_name = null,
    linkedin_url = null,
    group_id     = null,
    role         = 'learner'
  where id = v_user;

  return jsonb_build_object(
    'already_requested', v_profile.deleted_at is not null,
    'deleted_at',        coalesce(v_profile.deleted_at, now()),
    'progress',          v_progress,
    'attempts',          v_attempts,
    'points',            v_points,
    'streaks',           v_streaks,
    'feedback',          v_feedback
  );
end;
$$;

comment on function request_account_deletion() is
  'Erases the behavioural rows and anonymises the profile for the caller. Money rows are retained and are unlinked when the auth identity is deleted.';

revoke all on function request_account_deletion() from public, anon;
grant execute on function request_account_deletion() to authenticated;

-- Export. `entitlements` and `payments` have no grant for anyone but `service_role` (0002), so the
-- learner's own copy of the money history comes through a definer function that is scoped to
-- `auth.uid()` and returns a column list rather than a table. Stripe identifiers are not in it: they
-- are the processor's keys to an account, not a record of what the learner bought.
create or replace function my_entitlements() returns table (
  plan               text,
  status             text,
  source             text,
  current_period_end timestamptz,
  updated_at         timestamptz
)
language sql stable security definer set search_path = public as $$
  select e.plan, e.status, e.source, e.current_period_end, e.updated_at
  from entitlements e
  where e.user_id = auth.uid()
  order by e.plan;
$$;

create or replace function my_payments() returns table (
  id         uuid,
  amount     int,
  currency   text,
  kind       text,
  refunded   bool,
  created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select p.id, p.amount, p.currency, p.kind, p.refunded, p.created_at
  from payments p
  where p.user_id = auth.uid()
  order by p.created_at;
$$;

comment on function my_entitlements() is
  'The caller''s own entitlement history, for the JSON export. No grant exists on the table itself.';
comment on function my_payments() is
  'The caller''s own payment history, for the JSON export. Stripe identifiers are deliberately not returned.';

revoke all on function my_entitlements() from public, anon;
revoke all on function my_payments() from public, anon;
grant execute on function my_entitlements() to authenticated;
grant execute on function my_payments() to authenticated;
