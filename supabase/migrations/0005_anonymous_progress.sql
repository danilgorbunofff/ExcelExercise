-- Phase 4, item 5: bring a signed-out learner's progress across on first sign-in.
--
-- The browser has kept `es.progress` since phase 2 — a roll-up, not an event stream: per lesson a
-- completion timestamp, how many checks were missed, and whether the reference answer was ever
-- opened. Converting that into `attempts` rows would invent screen visits that were never recorded,
-- so this path writes a roll-up and nothing else: it never touches `attempts`, and therefore never
-- touches `first_try_accuracy`, which stays null until the first real batch arrives.
--
-- Everything it can promise is a merge, because the same lesson may already have a row from a real
-- batch (the learner signs in, then finishes the same drill):
--
--   * `completed_at` takes the earlier of the two — a completion that happened while signed out is
--     still the first time the learner finished it.
--   * `status` latches to `complete`, exactly as `record_progress` does.
--   * `score` keeps the greater value, and `helped` stays true once true.
--   * `attempts` and `wrong_count` are not incremented: a local `tries` count cannot be attributed to
--     screens, and adding it would double-count checks the next real batch will report itself.
--
-- The batch id is the same idempotency key as `record_progress`, claimed from the same table, with the
-- same owner-scoped replay rule: a resend is a no-op, and another account's key is a collision. Unlike
-- the event path the merge here is idempotent in effect, so a duplicate is harmless either way — the
-- claim just keeps the two write paths on one contract instead of two.

create or replace function import_lesson_progress(
  p_user    uuid,
  p_batch   uuid,
  p_lessons jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  item      jsonb;
  v_written int := 0;
begin
  if p_user is null then raise exception 'import_lesson_progress needs a user' using errcode = '22023'; end if;
  if p_lessons is null or jsonb_typeof(p_lessons) <> 'array' then
    raise exception 'p_lessons must be an array' using errcode = '22023';
  end if;

  insert into progress_batches (id, user_id) values (p_batch, p_user)
  on conflict (id) do nothing;
  if not found then
    if exists (select 1 from progress_batches where id = p_batch and user_id = p_user) then
      return jsonb_build_object('replayed', true, 'lessons', 0);
    end if;
    raise exception 'batch % belongs to another account', p_batch using errcode = '23505';
  end if;

  for item in select * from jsonb_array_elements(p_lessons) loop
    if coalesce(item->>'lesson_id', '') = '' then
      raise exception 'every lesson needs an id' using errcode = '22023';
    end if;

    insert into lesson_progress as lp (
      user_id, lesson_id, track, status, score, attempts, wrong_count, helped, completed_at, last_seen_at
    ) values (
      p_user,
      item->>'lesson_id',
      coalesce(nullif(item->>'track', ''), 'excel'),
      case when (item->>'completed_at') is null then 'in_progress' else 'complete' end,
      greatest(coalesce((item->>'score')::int, 0), 0),
      0,
      0,
      coalesce((item->>'helped')::boolean, false),
      (item->>'completed_at')::timestamptz,
      now()
    )
    on conflict (user_id, lesson_id) do update set
      status       = case when lp.status = 'complete' or excluded.status = 'complete' then 'complete' else lp.status end,
      score        = greatest(lp.score, excluded.score),
      helped       = lp.helped or excluded.helped,
      completed_at = least(
        coalesce(lp.completed_at, excluded.completed_at),
        coalesce(excluded.completed_at, lp.completed_at)
      ),
      last_seen_at = now();

    v_written := v_written + 1;
  end loop;

  update progress_batches set attempts = 0 where id = p_batch;

  return jsonb_build_object('replayed', false, 'lessons', v_written);
end;
$$;

comment on function import_lesson_progress(uuid, uuid, jsonb) is
  'Merges the roll-up a signed-out browser kept in `es.progress`. Writes lesson_progress only: no attempts, so no invented screen visits and no fabricated accuracy.';

-- Same posture as record_progress: the service role calls it, nobody else may.
revoke all on function import_lesson_progress(uuid, uuid, jsonb) from public, anon, authenticated;
