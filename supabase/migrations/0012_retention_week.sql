-- Phase 5, unit 5g: the week's accuracy, in one query.
--
-- The dashboard is byte-pinned against the legacy build, so the trend cannot live there; it is read by
-- the account page instead. The numbers come from `attempts`, which 0002 left self-read only, so a
-- learner can already count their own rows — this function exists for the shape, not for the privilege:
-- one row per day of the window, including the days with nothing in them, so the caller never has to
-- invent a gap.
--
-- Days are the learner's own, through the same `learner_zone` fallback 0010 uses (a profile timezone
-- Postgres recognises, UTC otherwise). A learner in Auckland therefore sees a day roll over at their
-- midnight, which is the boundary `daily_points` and `streaks` already use.

-- `attempts` is indexed by (user_id, lesson_id) because the drill reads a lesson; a week asks a
-- different question and would otherwise scan every attempt a learner has ever made.
create index if not exists attempts_user_ended_idx on attempts (user_id, ended_at);

create or replace function retention_week(p_days int default 7)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with me as (select auth.uid() as id),
  zone as (select learner_zone((select id from me)) as name),
  bounds as (
    select (now() at time zone z.name)::date as today,
           least(greatest(coalesce(p_days, 7), 1), 30) as days
    from zone z
  ),
  window_days as (
    select generate_series(b.today - (b.days - 1), b.today, '1 day')::date as day
    from bounds b
  ),
  counted as (
    select (a.ended_at at time zone z.name)::date as day,
           count(*)::int as screens,
           count(*) filter (where a.correct_first_try)::int as first_try
    from attempts a, zone z, bounds b
    where a.user_id = (select id from me)
      and a.ended_at is not null
      and (a.ended_at at time zone z.name)::date >= b.today - (b.days - 1)
      -- A clock that ran fast should not add a day the window has not reached yet.
      and (a.ended_at at time zone z.name)::date <= b.today
    group by 1
  )
  select jsonb_build_object(
    'day',          (select today from bounds),
    'days',         (select days from bounds),
    'pointsToday',  coalesce((
      select dp.points from daily_points dp
      where dp.user_id = (select id from me) and dp.day = (select today from bounds)
    ), 0),
    'pointsTotal',  coalesce((
      select sum(dp.points)::int from daily_points dp where dp.user_id = (select id from me)
    ), 0),
    'streakCurrent', coalesce((
      select s.current from streaks s where s.user_id = (select id from me)
    ), 0),
    'streakLongest', coalesce((
      select s.longest from streaks s where s.user_id = (select id from me)
    ), 0),
    'streakLastDay', (
      select s.last_day from streaks s where s.user_id = (select id from me)
    ),
    'series', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'day', w.day,
                 'screens', coalesce(c.screens, 0),
                 'firstTry', coalesce(c.first_try, 0)
               ) order by w.day
             )
      from window_days w
      left join counted c on c.day = w.day
    ), '[]'::jsonb)
  );
$$;

comment on function retention_week(int) is
  'One learner''s last p_days (clamped to 1..30, default 7) of attempts per day, with the days that have none, plus points and streak totals.';

revoke execute on function retention_week(int) from public, anon;
grant execute on function retention_week(int) to authenticated;
