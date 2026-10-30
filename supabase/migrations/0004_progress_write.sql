-- Phase 4, unit 3a: the one door a learner's progress comes in through.
--
-- `lesson_progress` and `attempts` are read-only for learners (0002 revoked insert/update/delete), so
-- the writer is the service role. Two things make that safe rather than merely privileged:
--
--   1. The batch id is the client's idempotency key. It is inserted first, alone, and a duplicate
--      primary key short-circuits the whole call — so a retried POST is a no-op instead of a second
--      copy of the same screen visits.
--   2. `attempt_seq` is assigned here, never by the caller, and the unique key on
--      (user, lesson, screen, attempt_seq) turns a race between two tabs into a retried increment
--      rather than a duplicate row.
--
-- Both properties are asserted against the real database in tests/db/progress.spec.js, not assumed.

create table progress_batches (
  id          uuid primary key,
  user_id     uuid not null references profiles (id) on delete cascade,
  received_at timestamptz not null default now(),
  attempts    int not null default 0 check (attempts >= 0)
);
create index progress_batches_user_idx on progress_batches (user_id, received_at desc);

comment on table progress_batches is
  'One row per accepted batch: the idempotency key for POST /api/progress, and the audit trail of how much each batch wrote.';

create or replace function record_progress(
  p_user       uuid,
  p_lesson_id  text,
  p_track      text,
  p_batch      uuid,
  p_attempts   jsonb,
  p_score      int,
  p_wrong      int,
  p_helped     boolean,
  p_ms         int,
  p_completed  boolean
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a            jsonb;
  v_seq        int;
  v_inserted   int := 0;
  v_total      int;
  v_first_try  int;
  v_accuracy   numeric(5,2);
  v_retry      int;
  v_status     text := case when p_completed then 'complete' else 'in_progress' end;
begin
  if p_user is null then raise exception 'record_progress needs a user' using errcode = '22023'; end if;

  -- The claim. `not found` after `on conflict do nothing` means this batch id is already taken; that is
  -- a replay only when the same account sent it. A batch id owned by somebody else is a collision, and
  -- swallowing it would let one account suppress another's writes by re-using its keys.
  insert into progress_batches (id, user_id) values (p_batch, p_user)
  on conflict (id) do nothing;
  if not found then
    if exists (select 1 from progress_batches where id = p_batch and user_id = p_user) then
      return jsonb_build_object('replayed', true);
    end if;
    raise exception 'batch % belongs to another account', p_batch using errcode = '23505';
  end if;

  for a in select * from jsonb_array_elements(coalesce(p_attempts, '[]'::jsonb)) loop
    -- A retry loop rather than a lock: two tabs on one screen would otherwise compute the same next
    -- seq and one of them would fail a constraint instead of completing. Five attempts is far past
    -- any real contention; the sixth raises and the route answers 503 rather than losing the batch.
    for v_retry in 1..5 loop
      begin
        select coalesce(max(attempt_seq), 0) + 1 into v_seq
        from attempts
        where user_id = p_user
          and lesson_id = p_lesson_id
          and screen_id = a->>'screen_id';

        insert into attempts (user_id, lesson_id, screen_id, attempt_seq, started_at, ended_at,
                              correct_first_try, wrong_count, help_used, answer)
        values (p_user, p_lesson_id, a->>'screen_id', v_seq,
                coalesce((a->>'started_at')::timestamptz, now()),
                (a->>'ended_at')::timestamptz,
                coalesce((a->>'correct_first_try')::boolean, false),
                coalesce((a->>'wrong_count')::int, 0),
                coalesce((a->>'help_used')::boolean, false),
                a->>'answer');
        v_inserted := v_inserted + 1;
        exit;
      exception when unique_violation then
        if v_retry = 5 then raise; end if;
      end;
    end loop;
  end loop;

  -- Recomputed from the rows, never taken from the payload: this column is the one a report reads.
  select count(*), count(*) filter (where correct_first_try) into v_total, v_first_try
  from attempts where user_id = p_user and lesson_id = p_lesson_id;
  v_accuracy := case when v_total = 0 then null else round(100.0 * v_first_try / v_total, 2) end;

  insert into lesson_progress as lp (
    user_id, lesson_id, track, status, score, attempts, wrong_count, helped,
    first_try_accuracy, best_ms, completed_at, last_seen_at
  ) values (
    p_user, p_lesson_id, p_track, v_status, greatest(p_score, 0), v_inserted, greatest(p_wrong, 0),
    coalesce(p_helped, false), v_accuracy, p_ms,
    case when p_completed then now() end, now()
  )
  on conflict (user_id, lesson_id) do update set
    status             = case when lp.status = 'complete' or v_status = 'complete' then 'complete' else lp.status end,
    score              = greatest(lp.score, excluded.score),
    attempts           = lp.attempts + excluded.attempts,
    wrong_count        = lp.wrong_count + excluded.wrong_count,
    helped             = lp.helped or excluded.helped,
    first_try_accuracy = excluded.first_try_accuracy,
    best_ms            = least(coalesce(lp.best_ms, excluded.best_ms), coalesce(excluded.best_ms, lp.best_ms)),
    completed_at       = coalesce(lp.completed_at, excluded.completed_at),
    last_seen_at       = now();

  update progress_batches set attempts = v_inserted where id = p_batch;

  return jsonb_build_object(
    'replayed', false,
    'attempts', v_inserted,
    'status', (select status from lesson_progress where user_id = p_user and lesson_id = p_lesson_id),
    'score', (select score from lesson_progress where user_id = p_user and lesson_id = p_lesson_id),
    'first_try_accuracy', v_accuracy
  );
end $$;

-- The table is as private as the function: Supabase's default privileges grant `anon` and
-- `authenticated` everything on a new public table, and without a policy a learner could claim an
-- arbitrary batch id (their own or another account's) before the server ever used it.
alter table progress_batches enable row level security;
revoke all on table progress_batches from anon, authenticated;

-- The service role is the only caller. A learner holding a valid token must not be able to write
-- progress rows for someone else by calling this directly.
revoke all on function record_progress(uuid, text, text, uuid, jsonb, int, int, boolean, int, boolean)
  from public, anon, authenticated;

comment on function record_progress is
  'Writes one batch of screen visits and its lesson roll-up. Idempotent on the batch id; assigns attempt_seq itself.';
