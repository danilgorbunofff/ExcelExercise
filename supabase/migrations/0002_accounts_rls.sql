-- Phase 4 RLS set. Transcribed from docs/plans/parity/phase-04-accounts-entitlements.md.
-- Every table is enabled and default-denied; tests/db/rls.spec.js asserts against these
-- policies over HTTP with real user JWTs, not against prose.

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

-- profiles_self_update only proves the row belongs to the caller; without column grants it would
-- also let them write role = 'admin' or join any group_id they like. Column-level grants are the
-- narrowest fix that keeps the policy above verbatim.
revoke update on profiles from anon, authenticated;
grant update (username, display_name, linkedin_url, timezone) on profiles to authenticated;

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

-- TRUNCATE, REFERENCES, TRIGGER and MAINTAIN are not subject to row level security at all, and the
-- platform default grants them to anon/authenticated alongside insert/update/delete. Nothing in
-- the app uses them, so drop them for every table in the exposed schema rather than leaving a
-- RLS-bypassing write privilege behind.
revoke truncate, references, trigger, maintain on all tables in schema public from anon, authenticated;

create or replace function create_group(group_name text, group_seats int default 1)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'create_group requires an authenticated user' using errcode = '42501';
  end if;
  insert into groups (name, owner_id, seats)
    values (group_name, auth.uid(), group_seats)
    returning id into new_id;
  update profiles set group_id = new_id, role = 'owner' where id = auth.uid();
  return new_id;
end;
$$;

-- The single entitlement gate (work item 7). Security definer so a learner can read their own
-- verdict without any grant on the money tables, and self-scoped so it cannot be used to probe
-- another account's subscription state.
create or replace function is_entitled(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from entitlements e
    where e.user_id = uid
      and e.status = 'active'
      and (uid = auth.uid() or auth.role() = 'service_role')
      and (
        e.plan in ('lifetime', 'institution')
        or e.current_period_end is null
        or e.current_period_end > now()
      )
  );
$$;

grant execute on function is_group_owner(uuid) to authenticated;
grant execute on function create_group(text, int) to authenticated;
grant execute on function is_entitled(uuid) to authenticated, anon;
