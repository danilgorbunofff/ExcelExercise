-- Phase 4 work item 9: an institution covers a whole email domain.
--
-- The allowlist is the only authority. A row here is a contract that a new account at that domain is
-- paid for, up to `seats` live grants; nothing in the browser can read, write, or probe it. The grant
-- itself is an `entitlements` row with `source = 'institution'`, which `is_entitled()` already treats
-- as paid with no period to expire — so nothing downstream needs to learn a new plan.
--
-- Why `entitlements.institution_domain` exists: "how many of this institution's seats are used" cannot
-- be answered from `profiles`, because the profile has never held the email address. Recording the
-- allowlist row that paid for each grant makes the seat count a query instead of a guess, and makes the
-- grant auditable after the fact.
--
-- Deliberately absent: a bulk sweep. A domain added after learners have already signed up does not
-- retroactively grant them; an operator backfills one account at a time with
-- `select grant_institution_access('<uuid>', '<email>')` as the service role, which is the same
-- function the signup trigger calls.

create table institution_domains (
  domain     citext primary key check (domain = lower(domain) and domain like '%.%'),
  label      text not null check (char_length(label) between 1 and 120),
  group_id   uuid references groups (id) on delete set null,
  seats      int not null default 1 check (seats > 0),
  created_at timestamptz not null default now()
);

comment on table institution_domains is
  'Email domains an institution pays for. Inserted with the service role; no client role has a grant.';
comment on column institution_domains.group_id is
  'Optional group the granted learner joins, so a cohort lands in one place.';
comment on column institution_domains.seats is
  'Live grants allowed at once. A deleted account frees its seat (see grant_institution_access).';

alter table institution_domains enable row level security;
-- The platform grants anon/authenticated table privileges by default; a table with RLS on and no
-- policy is already unreadable, but the grant is what would make a policy the only thing standing
-- between a client and the allowlist. Drop it, the same way 0002 does for the money tables.
revoke all on institution_domains from anon, authenticated;
revoke truncate, references, trigger, maintain on institution_domains from anon, authenticated;

alter table entitlements
  add column institution_domain citext references institution_domains (domain) on delete set null;

comment on column entitlements.institution_domain is
  'Which allowlist row granted this entitlement. Null for anything bought through Stripe.';

create or replace function grant_institution_access(p_user uuid, p_email text)
returns citext
-- citext lives in the `extensions` schema (0001 installs it there) and PostgreSQL resolves the
-- body's types against the function's own search_path, not the caller's.
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_domain citext := lower(nullif(split_part(coalesce(p_email, ''), '@', 2), ''));
  v_row    institution_domains;
  v_used   int;
  v_granted citext;
begin
  if v_domain is null then
    return null;
  end if;

  select * into v_row from institution_domains d where d.domain = v_domain;
  if not found then
    return null;
  end if;

  -- A seat is held by a live account. Counting `deleted_at is null` is what makes a deletion free the
  -- seat it took, instead of leaking it forever on a row that no longer names anyone.
  select count(*) into v_used
  from entitlements e
  join profiles p on p.id = e.user_id
  where e.institution_domain = v_domain
    and e.status = 'active'
    and p.deleted_at is null;

  if v_used >= v_row.seats then
    raise warning 'institution: % is at its seat limit (% of %)', v_domain, v_used, v_row.seats;
    return null;
  end if;

  insert into entitlements (user_id, plan, status, source, current_period_end, institution_domain)
    values (p_user, 'institution', 'active', 'institution', null, v_domain)
    on conflict (user_id, plan) do nothing
    returning institution_domain into v_granted;

  if v_granted is null then
    -- The account already has an institution grant; the sweep is idempotent by construction.
    return null;
  end if;

  -- Only when the profile has no group: an existing membership is not overwritten by a domain row.
  if v_row.group_id is not null then
    update profiles set group_id = v_row.group_id
    where id = p_user and group_id is null;
  end if;

  return v_granted;
end;
$$;

comment on function grant_institution_access(uuid, text) is
  'Grants an institution entitlement when the email domain is on the allowlist and a seat is free. Returns the domain granted, or null.';

-- Runs after `on_auth_user_created`, which is what makes the profile (`entitlements.user_id` points at
-- it). PostgreSQL fires triggers for the same event in alphabetical order of trigger name, so the
-- `_institution` suffix is the ordering, not a style choice.
create or replace function public.handle_new_user_institution() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform grant_institution_access(new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created_institution
  after insert on auth.users
  for each row execute function public.handle_new_user_institution();

-- Functions are executable by PUBLIC unless told otherwise, and this one writes a money row. The
-- trigger does not need the grant at run time (it is checked when the trigger is created), so only the
-- service role — which is what an operator uses to backfill — keeps it.
revoke execute on function grant_institution_access(uuid, text) from public, anon, authenticated;
grant execute on function grant_institution_access(uuid, text) to service_role;

-- The export is the "everything we hold about you" document, so it has to say who paid when the answer
-- is an institution. The return type changes, which `create or replace` refuses, so the function is
-- dropped and recreated — and with it its grants, which is why they are reissued here rather than
-- assumed.
drop function if exists my_entitlements();

create or replace function my_entitlements() returns table (
  plan               text,
  status             text,
  source             text,
  current_period_end timestamptz,
  institution_domain citext,
  updated_at         timestamptz
)
language sql stable security definer set search_path = public, extensions as $$
  select e.plan, e.status, e.source, e.current_period_end, e.institution_domain, e.updated_at
  from entitlements e
  where e.user_id = auth.uid()
  order by e.plan;
$$;

revoke all on function my_entitlements() from public, anon;
grant execute on function my_entitlements() to authenticated;
