-- Phase 5, unit 5e: the daily challenge.
--
-- Three tables and a handful of functions, all `security definer` and all service-role only. The
-- answer key never leaves the server: the run page is handed a screen's prompt and grid, and the
-- verdict comes back from here, so a client cannot score itself and cannot retry a screen it already
-- answered. `challenge_answers` is the claim that makes "one attempt" true per screen, not just per
-- day — a second answer for the same screen returns the first verdict instead of overwriting it.
--
-- The challenge itself (which five topics, which ten screens) is chosen in
-- `lib/retention/challenge.js` and inserted here as keys, not as payloads. Content stays the source of
-- truth: a lesson edited after the fact cannot leave a challenge pointing at a stale answer, because
-- only the choice of screens is frozen. `screens` holds `lessonId#screenId` so the day is readable by a
-- human in psql.
--
-- The phase plan calls for a cron at 00:00 UTC. There is no scheduler in this stack, so the row is
-- created on first use for the day, which is the same observable — one challenge per day, the same one
-- all day, chosen deterministically from the day's seed so a race creates it once and both callers
-- agree. Recorded as a deviation in the phase doc.

create table daily_challenges (
  day        date primary key,
  topics     text[] not null default '{}',
  screens    text[] not null,
  created_at timestamptz not null default now(),
  check (cardinality(screens) > 0)
);

comment on table daily_challenges is
  'One row per day: the topics drawn and the screens to answer, frozen for the day by challenge_ensure.';

alter table daily_challenges enable row level security;
create policy challenge_day_read on daily_challenges for select to authenticated using (true);
revoke all on table daily_challenges from anon, authenticated;
grant select on table daily_challenges to authenticated;

create table challenge_attempts (
  id          uuid primary key default gen_random_uuid(),
  day         date not null references daily_challenges (day) on delete cascade,
  user_id     uuid not null references profiles (id) on delete cascade,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  answered    int not null default 0 check (answered >= 0),
  correct     int not null default 0 check (correct >= 0 and correct <= answered),
  accuracy    numeric(5, 4),
  ms          int,
  unique (day, user_id)                                       -- one attempt per learner per day
);
create index challenge_attempts_day_idx on challenge_attempts (day, finished_at);

comment on table challenge_attempts is
  'One run per learner per day. The unique constraint is the rule, not a check: a second run cannot be inserted at all.';

alter table challenge_attempts enable row level security;
create policy challenge_attempt_self_read on challenge_attempts for select using (user_id = auth.uid());
revoke all on table challenge_attempts from anon, authenticated;
grant select on table challenge_attempts to authenticated;

create table challenge_answers (
  attempt_id  uuid not null references challenge_attempts (id) on delete cascade,
  screen_id   text not null,
  ok          boolean not null,
  answered_at timestamptz not null default now(),
  primary key (attempt_id, screen_id)                         -- the first verdict is the verdict
);

comment on table challenge_answers is
  'One row per screen per run, holding the server''s own verdict. Its primary key is what makes a retried answer a no-op.';

alter table challenge_answers enable row level security;
revoke all on table challenge_answers from anon, authenticated;

-- Create the day if it is not there, and hand back the row either way. The caller passes the choice it
-- computed; a second caller with a different choice loses, and gets the stored one, so the day cannot
-- change under two request handlers racing at 00:00.
create or replace function challenge_ensure(p_day date, p_topics text[], p_screens text[])
returns daily_challenges
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_row daily_challenges;
begin
  if p_day is null then raise exception 'challenge_ensure needs a day' using errcode = '22023'; end if;
  if coalesce(cardinality(p_screens), 0) = 0 then
    raise exception 'challenge_ensure needs at least one screen' using errcode = '22023';
  end if;

  insert into daily_challenges (day, topics, screens)
  values (p_day, coalesce(p_topics, '{}'), p_screens)
  on conflict (day) do nothing;

  select * into v_row from daily_challenges where day = p_day;
  return v_row;
end;
$$;

comment on function challenge_ensure(date, text[], text[]) is
  'Inserts the day''s challenge once and returns the stored row, so a race resolves to one challenge.';

-- Begin, or resume, the learner's run for a day. Resuming is the interesting half: a learner who closes
-- the tab comes back to the same `started_at`, so the fifteen minutes are the run's clock, not the tab's.
create or replace function challenge_begin(p_day date, p_user uuid)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_row challenge_attempts;
  v_new boolean := false;
begin
  if p_user is null then raise exception 'challenge_begin needs a user' using errcode = '22023'; end if;
  if not exists (select 1 from daily_challenges where day = p_day) then
    raise exception 'no challenge for %', p_day using errcode = '22023';
  end if;

  insert into challenge_attempts (day, user_id) values (p_day, p_user)
  on conflict (day, user_id) do nothing
  returning * into v_row;

  if v_row.id is null then
    select * into v_row from challenge_attempts where day = p_day and user_id = p_user;
  else
    v_new := true;
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'started_at', v_row.started_at,
    'finished_at', v_row.finished_at,
    'answered', v_row.answered,
    'correct', v_row.correct,
    'accuracy', v_row.accuracy,
    'ms', v_row.ms,
    'created', v_new
  );
end;
$$;

comment on function challenge_begin(date, uuid) is
  'Starts the day''s run, or returns the one already started. The run clock is `started_at`, never the client''s.';

-- Record the server's verdict for one screen. Re-answering a screen is not an error and not a retry:
-- the stored verdict is returned with `first = false`, so a client that resubmits learns the truth and
-- cannot improve its score. A screen outside the day's set is refused outright.
create or replace function challenge_answer(p_day date, p_user uuid, p_screen text, p_ok boolean)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_attempt challenge_attempts;
  v_ok boolean;
  v_first boolean;
  v_answered int;
  v_correct int;
begin
  if p_user is null then raise exception 'challenge_answer needs a user' using errcode = '22023'; end if;
  if p_screen is null or p_screen = '' then
    raise exception 'challenge_answer needs a screen' using errcode = '22023';
  end if;

  select * into v_attempt from challenge_attempts where day = p_day and user_id = p_user for update;
  if v_attempt.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_started');
  end if;
  if v_attempt.finished_at is not null then
    return jsonb_build_object('ok', false, 'error', 'already_finished',
                              'accuracy', v_attempt.accuracy, 'ms', v_attempt.ms,
                              'answered', v_attempt.answered, 'correct', v_attempt.correct);
  end if;
  if not exists (select 1 from daily_challenges c where c.day = p_day and p_screen = any (c.screens)) then
    return jsonb_build_object('ok', false, 'error', 'unknown_screen');
  end if;

  -- `returning` is the honest "did this insert a row" signal: a screen answered a second time conflicts,
  -- returns nothing, and `first` is false — even when the second answer happens to match the first.
  insert into challenge_answers (attempt_id, screen_id, ok)
  values (v_attempt.id, p_screen, coalesce(p_ok, false))
  on conflict (attempt_id, screen_id) do nothing
  returning true into v_first;

  select a.ok into v_ok from challenge_answers a where a.attempt_id = v_attempt.id and a.screen_id = p_screen;
  select count(*), count(*) filter (where a.ok) into v_answered, v_correct
  from challenge_answers a where a.attempt_id = v_attempt.id;

  update challenge_attempts
  set answered = v_answered, correct = v_correct
  where id = v_attempt.id;

  return jsonb_build_object(
    'ok', true,
    'first', v_first is not null,
    'verdict', v_ok,
    'answered', v_answered,
    'correct', v_correct
  );
end;
$$;

comment on function challenge_answer(date, uuid, text, boolean) is
  'Stores one screen''s server verdict for the day''s run. A repeated screen keeps its first verdict.';

-- Close the run. Accuracy is correct answers over the size of the challenge, so abandoning a run after
-- one correct screen scores 10%, not 100% — quitting is not a strategy. Time is the server's elapsed
-- time clamped to the cap, so a run that outlasted its fifteen minutes ranks at fifteen minutes.
create or replace function challenge_finish(p_day date, p_user uuid, p_size int, p_cap_seconds int default 900)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_row challenge_attempts;
  v_ms int;
begin
  select * into v_row from challenge_attempts where day = p_day and user_id = p_user for update;
  if v_row.id is null then return jsonb_build_object('ok', false, 'error', 'not_started'); end if;

  if v_row.finished_at is null then
    v_ms := least(
      greatest(ceil(extract(epoch from (now() - v_row.started_at)) * 1000)::int, 0),
      greatest(p_cap_seconds, 1) * 1000
    );
    update challenge_attempts
    set finished_at = now(),
        ms = v_ms,
        accuracy = round(v_row.correct::numeric / greatest(coalesce(p_size, 1), 1), 4)
    where id = v_row.id
    returning * into v_row;
  end if;

  return jsonb_build_object(
    'ok', true,
    'accuracy', v_row.accuracy,
    'ms', v_row.ms,
    'answered', v_row.answered,
    'correct', v_row.correct,
    'finished_at', v_row.finished_at
  );
end;
$$;

comment on function challenge_finish(date, uuid, int, int) is
  'Closes the run: accuracy over the whole challenge, elapsed time clamped to the cap. Idempotent.';

-- The board for a day: accuracy desc, then time asc, then whoever finished first. `is_me` is the only
-- viewer-dependent column and it is not part of the sort, so every learner sees the same ordering.
create or replace function challenge_rank(p_day date, p_user uuid default null, p_limit int default 10)
returns table (rank bigint, user_id uuid, username text, accuracy numeric, ms int, is_me bool)
language sql stable security definer set search_path = public, pg_temp as $$
  with scored as (
    select a.user_id, p.username::text as username, a.accuracy, a.ms, a.finished_at
    from challenge_attempts a
    join profiles p on p.id = a.user_id
    where a.day = p_day and a.finished_at is not null and a.accuracy is not null
  ), ranked as (
    select row_number() over (
             order by s.accuracy desc, s.ms asc, s.finished_at asc, s.user_id asc
           ) as rank,
           s.user_id, s.username, s.accuracy, s.ms
    from scored s
  )
  select r.rank, r.user_id, r.username, r.accuracy, r.ms, (r.user_id = p_user) as is_me
  from ranked r
  where r.rank <= greatest(1, least(coalesce(p_limit, 10), 50)) or r.user_id = p_user
  order by r.rank;
$$;

comment on function challenge_rank(date, uuid, int) is
  'The day''s challenge board: accuracy desc, time asc, first-to-finish, plus the caller''s own line.';

-- Which lessons were drilled in the window, for the topic weighting: five topics drawn uniformly would
-- keep serving a group nobody has opened, and the point of the weighting is to follow the cohort.
create or replace function challenge_activity(p_since timestamptz)
returns table (lesson_id text, screens bigint)
language sql stable security definer set search_path = public, pg_temp as $$
  select a.lesson_id, count(*)::bigint
  from attempts a
  where a.started_at >= p_since
  group by a.lesson_id;
$$;

comment on function challenge_activity(timestamptz) is
  'Screens attempted per lesson since an instant — the weight behind the daily topic draw.';

revoke execute on function challenge_ensure(date, text[], text[]) from public, anon, authenticated;
revoke execute on function challenge_begin(date, uuid) from public, anon, authenticated;
revoke execute on function challenge_answer(date, uuid, text, boolean) from public, anon, authenticated;
revoke execute on function challenge_finish(date, uuid, int, int) from public, anon, authenticated;
revoke execute on function challenge_rank(date, uuid, int) from public, anon;
revoke execute on function challenge_activity(timestamptz) from public, anon, authenticated;

grant execute on function challenge_ensure(date, text[], text[]) to service_role;
grant execute on function challenge_begin(date, uuid) to service_role;
grant execute on function challenge_answer(date, uuid, text, boolean) to service_role;
grant execute on function challenge_finish(date, uuid, int, int) to service_role;
grant execute on function challenge_rank(date, uuid, int) to authenticated, service_role;
grant execute on function challenge_activity(timestamptz) to service_role;
