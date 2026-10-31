-- Phase 6, unit 1: the certificate of completion.
--
-- 0002 already said why `lesson_progress` is server-write-only — "a certificate is issued off this
-- data" — and this is the table that reads it. Everything a learner could use to forge a credential is
-- therefore kept out of the browser's reach: learners may read their own row and nothing else, all
-- writes go through the definer functions below, and the identity columns are write-once even for the
-- service role, because the one thing that must never happen after a certificate is handed out is the
-- holder's name quietly changing.
--
-- Three deliberate choices, in the same spirit as the rest of the schema:
--
--   * **One row per learner, forever.** The primary key is `user_id`, not a serial. "Issuing twice
--     returns the existing certificate" is not a check the route remembers to make — it is the shape of
--     the table. A learner who finishes more lessons later does not get a second certificate, and the
--     `lesson_count` frozen at issue time is what the verify page keeps showing.
--   * **Attendance is proved inside the transaction.** `issue_certificate` re-counts the required
--     lessons from `lesson_progress` itself rather than trusting a number the caller computed, so a
--     route bug (or a future second caller) cannot mint a certificate for a learner who has not
--     finished the track.
--   * **Revocation is a state, not a deletion.** A revoked certificate still resolves on `/verify`, with
--     the status saying so. Erasing the row would turn a withdrawn credential into an "unknown ID",
--     which is a different and more confusing claim than "this record exists and was revoked".
--
-- `days_taken` is nullable by design: it is the span between the first and last finished lesson at
-- issue time, and a learner whose progress rows predate this migration has no honest answer to give.
-- Null renders as "not recorded" rather than as a made-up number.
--
-- There is no minimum accuracy. The reference has none beyond completion, and inventing one would make
-- a finished track fail a bar the curriculum never told the learner about. Documented here so the
-- absence is a decision rather than an oversight.

create table certificates (
  user_id         uuid primary key references profiles (id) on delete cascade,
  -- Crockford base32 (no I, L, O, U), 16 characters: 80 bits, opaque and case-insensitive on input.
  credential_id   text not null unique
                  check (credential_id ~ '^[0-9A-HJKMNP-TV-Z]{16}$'),
  display_name    text not null check (length(btrim(display_name)) between 2 and 60),
  issued_at       timestamptz not null default now(),
  lesson_count    int not null check (lesson_count > 0),
  days_taken      int check (days_taken >= 0),
  pdf_path        text,                              -- storage key, filled when the render lands
  revoked_at      timestamptz,
  revoked_reason  text,
  revoked_by      uuid references profiles (id) on delete set null,
  created_at      timestamptz not null default now()
);

comment on table certificates is
  'One certificate of completion per learner, write-once: name, id, date and lesson count never change.';

alter table certificates enable row level security;

create policy certificates_self_read on certificates for select using (user_id = auth.uid());

-- Same reasoning as 0002's progress tables: the browser never writes here. `0002` also revoked
-- TRUNCATE on every table that existed then, and a table created later gets the platform's default
-- grants back — so the same four dunder privileges are revoked here, as `0007` had to do for its table.
revoke insert, update, delete, truncate, references, trigger, maintain on certificates from anon, authenticated;

-- --- write-once identity -------------------------------------------------------------------------
--
-- A trigger rather than a grant, because service_role holds every grant: RLS and column privileges
-- would both let the issuing server rewrite a name, and this must hold against the server too. What
-- stays mutable is exactly what revocation and the PDF render need — `revoked_at`, `revoked_reason`,
-- `revoked_by`, `pdf_path` — and nothing else.
--
-- Revocation is one-way: clearing `revoked_at` would let a withdrawn credential look live again without
-- any record, which is the one direction that actually helps an attacker.

create or replace function certificates_write_once() returns trigger
language plpgsql as $$
begin
  if new.user_id      is distinct from old.user_id
  or new.credential_id is distinct from old.credential_id
  or new.display_name  is distinct from old.display_name
  or new.issued_at     is distinct from old.issued_at
  or new.lesson_count  is distinct from old.lesson_count
  or new.days_taken    is distinct from old.days_taken
  or new.created_at    is distinct from old.created_at then
    raise exception 'a certificate''s holder, id, date and lesson count are write-once'
      using errcode = 'restrict_violation';
  end if;

  if old.revoked_at is not null and new.revoked_at is null then
    raise exception 'revocation is permanent; a withdrawn certificate cannot be reinstated'
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

create trigger certificates_write_once before update on certificates
  for each row execute function certificates_write_once();

-- --- issuance ------------------------------------------------------------------------------------
--
-- Returns the learner's certificate, issuing it only if there is not one already. Two things can race:
--
--   * two requests for the same learner — the insert loses on the primary key, and the handler below
--     re-reads and returns the winner's row, so both callers get the same credential;
--   * two learners drawing the same random credential id — a unique violation on `credential_id`,
--     re-raised so the caller can retry with a fresh one rather than issuing an ambiguous id.
--
-- Eligibility is counted here, from `lesson_progress`, against the caller's list of required lesson
-- ids. `track = 'excel'` is pinned rather than passed: certificates cover the Excel catalog, and the SQL
-- track's own certificate is phase 8's decision.

create or replace function issue_certificate(
  p_user       uuid,
  p_name       text,
  p_credential text,
  p_required   text[],
  p_days       int default null
) returns certificates
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  existing certificates;
  total    int := coalesce(cardinality(p_required), 0);
  finished int;
begin
  select * into existing from certificates c where c.user_id = p_user;
  if found then
    return existing;
  end if;

  if total = 0 then
    raise exception 'no required lessons were named, so nobody is eligible'
      using errcode = 'check_violation';
  end if;

  select count(*) into finished
    from lesson_progress lp
   where lp.user_id = p_user
     and lp.track = 'excel'
     and lp.status = 'complete'
     and lp.lesson_id = any (p_required);

  if finished < total then
    raise exception 'not eligible: % of % lessons finished', finished, total
      using errcode = 'check_violation';
  end if;

  begin
    insert into certificates (user_id, credential_id, display_name, lesson_count, days_taken)
      values (p_user, upper(btrim(p_credential)), btrim(p_name), total, p_days)
      returning * into existing;
    return existing;
  exception when unique_violation then
    select * into existing from certificates c where c.user_id = p_user;
    if found then
      return existing;
    end if;
    raise;  -- a credential-id collision; the caller retries with a new id
  end;
end;
$$;

comment on function issue_certificate(uuid, text, text, text[], int) is
  'Issues at most one certificate per learner, after re-counting the required lessons itself.';

-- --- verification (public) -----------------------------------------------------------------------
--
-- Anonymous by design: the point of a credential is that a stranger can check it. The function returns
-- only what the verify page shows — no user id, no email, no lesson list — so a guessed credential id
-- leaks a name, a date and a status and nothing else. Input is trimmed and upper-cased because a
-- credential is read off a PDF or typed by hand.

create or replace function verify_certificate(p_credential text)
returns table (
  credential_id text,
  display_name  text,
  issued_at     timestamptz,
  lesson_count  int,
  status        text,
  revoked_at    timestamptz
)
language sql stable security definer set search_path = public, pg_temp as $$
  select c.credential_id,
         c.display_name,
         c.issued_at,
         c.lesson_count,
         case when c.revoked_at is null then 'valid' else 'revoked' end,
         c.revoked_at
    from certificates c
   where c.credential_id = upper(btrim(coalesce(p_credential, '')));
$$;

revoke all on function verify_certificate(text) from public;
grant execute on function verify_certificate(text) to anon, authenticated, service_role;

-- --- revocation (admin) --------------------------------------------------------------------------
--
-- Actor-checked rather than key-checked: the caller's own profile must say admin or owner. The route
-- does not exist yet — revocation is an operator action for now, run through psql or a service-role
-- script — so the gate lives here, where a future route cannot forget it.

create or replace function revoke_certificate(p_credential text, p_reason text, p_actor uuid)
returns certificates
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  updated certificates;
begin
  if not exists (
    select 1 from profiles p
     where p.id = p_actor and p.role in ('admin', 'owner')
  ) then
    raise exception 'only an admin or owner may revoke a certificate'
      using errcode = 'insufficient_privilege';
  end if;

  update certificates c
     set revoked_at = now(),
         revoked_reason = nullif(btrim(p_reason), ''),
         revoked_by = p_actor
   where c.credential_id = upper(btrim(coalesce(p_credential, '')))
     and c.revoked_at is null
  returning * into updated;

  if not found then
    raise exception 'no live certificate for that credential id'
      using errcode = 'no_data_found';
  end if;

  return updated;
end;
$$;

revoke all on function revoke_certificate(text, text, uuid) from public;
grant execute on function revoke_certificate(text, text, uuid) to service_role;
