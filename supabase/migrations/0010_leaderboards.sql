-- Phase 5, unit 5d: the leaderboards.
--
-- Two boards, both read-only and both `security definer`: a learner cannot read another learner's
-- `daily_points` or `streaks` row (0002 made both self-read), so a board that only shows usernames and
-- numbers has to be computed here, by the owner, and handed back. That is the whole reason these are
-- functions and not views — a view would run as the caller and return three empty rows to everyone.
--
-- What is *not* here: any per-viewer term in the ordering. `rank` is a bare `row_number()` over
-- `(points desc, username asc, user_id asc)`, so two learners looking at the same day see the same
-- numbered list, including when two players tie on points. `is_me` marks the caller's own row; it is
-- the only column that differs between viewers, and it is never part of the sort.
--
-- Day boundaries are the learner's own, not the server's: `learner_zone` validates the profile's
-- timezone against `pg_timezone_names` and falls back to UTC, which is the same fallback
-- `lib/retention/points.js` makes. An invalid zone can therefore neither throw here nor credit a
-- different day there.

create or replace function learner_zone(p_user uuid) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(
    (select tz.name from pg_timezone_names tz
      where tz.name = (select p.timezone from profiles p where p.id = p_user)),
    'UTC'
  );
$$;

comment on function learner_zone(uuid) is
  'The learner''s timezone when Postgres recognises it, UTC otherwise — the SQL half of usableZone().';

-- The anti-cheat heuristic from the phase plan: 100% first-try accuracy across more than 20 screens in
-- under 30 seconds. It flags a day, it never deletes one — a wrong accusation that silently erases a
-- learner's points is worse than a wrong accusation that hides them from a board for a day, and the
-- flagged row stays readable through `leaderboard_flags` for whoever reviews it.
create or replace function implausible_day(p_user uuid, p_day date) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  with zone as (select learner_zone(p_user) as name)
  select coalesce((
    select count(*) > 20
       and bool_and(a.correct_first_try)
       and bool_and(not a.help_used)
       and (max(a.ended_at) - min(a.started_at)) < interval '30 seconds'
    from attempts a, zone z
    where a.user_id = p_user
      and a.ended_at is not null
      and (a.started_at at time zone z.name)::date = p_day
  ), false);
$$;

comment on function implausible_day(uuid, date) is
  'True when a day looks machine-made: >20 screens, all first try, all unhelped, inside 30 seconds.';

/**
 * The points board: the top `p_limit` learners for a day, plus the caller's own row.
 *
 * Flagged rows are ranked out, not numbered: the ranking window runs over the displayable set only, so
 * a flagged learner cannot hold rank 1 and leave a visible hole at 1 while honest players sit at 2.
 * The caller's own row is appended separately, with `flagged = true` and a null rank, so the page can
 * say "under review" instead of quietly showing a learner a board they are missing from.
 */
create or replace function leaderboard_points(p_day date, p_user uuid default null, p_limit int default 3)
returns table (rank bigint, user_id uuid, username text, points int, flagged bool, is_me bool)
language sql stable security definer set search_path = public, pg_temp as $$
  with scored as (
    select dp.user_id, p.username::text as username, dp.points,
           implausible_day(dp.user_id, p_day) as flagged
    from daily_points dp
    join profiles p on p.id = dp.user_id
    where dp.day = p_day and dp.points > 0
  ), ranked as (
    select row_number() over (order by s.points desc, s.username asc, s.user_id asc) as rank,
           s.user_id, s.username, s.points
    from scored s
    where not s.flagged
  ), board as (
    select r.rank, r.user_id, r.username, r.points, false as flagged, (r.user_id = p_user) as is_me
    from ranked r
    where r.rank <= greatest(1, least(coalesce(p_limit, 3), 25)) or r.user_id = p_user
  ), mine as (
    select null::bigint as rank, s.user_id, s.username, s.points, true as flagged, true as is_me
    from scored s
    where s.user_id = p_user and s.flagged
  )
  select * from board union all select * from mine order by 1 nulls last;
$$;

comment on function leaderboard_points(date, uuid, int) is
  'Top learners by points on a day, plus the caller''s rank. Identical ordering for every viewer.';

-- The streak board counts a run as live when `last_day` is today *or* yesterday: a learner whose day
-- has not started yet is not on a break, and the board is read in one timezone at a time. A cheater
-- flag does not apply here — the heuristic judges accuracy against the clock, and a streak is a
-- completion count with no clock to judge. Documented as a deviation in the phase doc.
create or replace function leaderboard_streaks(p_day date, p_user uuid default null, p_limit int default 3)
returns table (rank bigint, user_id uuid, username text, streak int, is_me bool)
language sql stable security definer set search_path = public, pg_temp as $$
  with live as (
    select s.user_id, p.username::text as username, s.current
    from streaks s
    join profiles p on p.id = s.user_id
    where s.current > 0 and s.last_day is not null and s.last_day >= p_day - 1
  ), ranked as (
    select row_number() over (order by l.current desc, l.username asc, l.user_id asc) as rank,
           l.user_id, l.username, l.current
    from live l
  )
  select r.rank, r.user_id, r.username, r.current as streak, (r.user_id = p_user) as is_me
  from ranked r
  where r.rank <= greatest(1, least(coalesce(p_limit, 3), 25)) or r.user_id = p_user
  order by r.rank;
$$;

comment on function leaderboard_streaks(date, uuid, int) is
  'Top learners by current streak, plus the caller''s rank. A run whose last_day is older than
   yesterday is not live and does not appear.';

-- The review queue behind the flag. Service-role only: it names learners whose day looks machine-made,
-- which is not a public list, and showing it on the board would be the "soft delete with public shame"
-- the phase plan explicitly avoids.
create or replace function leaderboard_flags(p_day date)
returns table (user_id uuid, username text, points int, screens int, seconds numeric)
language sql stable security definer set search_path = public, pg_temp as $$
  select dp.user_id, p.username::text, dp.points,
         (select count(*)::int from attempts a
           where a.user_id = dp.user_id
             and a.ended_at is not null
             and (a.started_at at time zone learner_zone(dp.user_id))::date = p_day) as screens,
         (select extract(epoch from max(a.ended_at) - min(a.started_at))
            from attempts a
           where a.user_id = dp.user_id
             and a.ended_at is not null
             and (a.started_at at time zone learner_zone(dp.user_id))::date = p_day) as seconds
  from daily_points dp
  join profiles p on p.id = dp.user_id
  where dp.day = p_day and implausible_day(dp.user_id, p_day)
  order by dp.points desc, p.username asc;
$$;

comment on function leaderboard_flags(date) is
  'The review queue: learners whose points day trips the cheating heuristic, with the numbers that
   tripped it.';

-- The boards are readable by a signed-in learner because the server calls them on the learner's behalf
-- and a board with no viewers has no purpose. The heuristic and the review queue are not: a learner
-- could otherwise ask "was I flagged" and learn how to tune their timings.
revoke execute on function learner_zone(uuid) from public, anon, authenticated;
revoke execute on function implausible_day(uuid, date) from public, anon, authenticated;
revoke execute on function leaderboard_flags(date) from public, anon, authenticated;
revoke execute on function leaderboard_points(date, uuid, int) from public, anon;
revoke execute on function leaderboard_streaks(date, uuid, int) from public, anon;
grant execute on function learner_zone(uuid) to service_role;
grant execute on function implausible_day(uuid, date) to service_role;
grant execute on function leaderboard_flags(date) to service_role;
grant execute on function leaderboard_points(date, uuid, int) to authenticated, service_role;
grant execute on function leaderboard_streaks(date, uuid, int) to authenticated, service_role;
