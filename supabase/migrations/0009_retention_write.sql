-- Phase 5, unit 5b: the retention write path.
--
-- Points and streaks are the two numbers a learner will screenshot, so neither may be written by the
-- browser. `daily_points` and `streaks` have carried a self-read policy since 0002 and no write grant
-- at all; this migration adds the two functions that write them, and both are service-role only.
--
-- The rules live here *and* in `lib/retention/` because they have two different jobs. The JavaScript is
-- what the route calls and what `tests/retention.test.js` can prove quickly; the SQL is what makes the
-- write atomic — the row lock, the per-screen claim and the day's ceiling have to hold when two tabs
-- submit at once, which is the one thing a unit test cannot show. `tests/db/retention.spec.js` runs the
-- same streak matrix through both and asserts they agree, so the duplication is checked, not hoped for.
--
-- Why the award is passed in at all: `p_award` comes from the route, which draws it, but it is clamped
-- here against `5 × lesson_number` computed from the lesson id. A caller that invents a number cannot
-- get more than the formula allows, so the clamp does not depend on the caller being honest.

create table screen_awards (
  user_id    uuid not null references profiles (id) on delete cascade,
  day        date not null,
  lesson_id  text not null,
  screen_id  text not null,
  points     int  not null check (points >= 0),
  awarded_at timestamptz not null default now(),
  primary key (user_id, day, lesson_id, screen_id)
);
create index screen_awards_user_day_idx on screen_awards (user_id, day);

comment on table screen_awards is
  'One row per screen paid, per learner, per day: the claim that makes points un-farmable, and the audit trail behind daily_points.';

alter table screen_awards enable row level security;
create policy awards_self_read on screen_awards for select using (user_id = auth.uid());
revoke all on table screen_awards from anon, authenticated;
grant select on table screen_awards to authenticated;

-- One day's ceiling, matching DAILY_CAP in lib/retention/points.js. It is duplicated as a literal
-- because a migration cannot import it; `tests/db/retention.spec.js` asserts the two are equal, so a
-- change to one that forgets the other fails the suite rather than drifting.
create or replace function retention_daily_cap() returns int
language sql immutable as $$ select 500; $$;

-- The curriculum number inside a lesson id: `01-sum-basics` → 1, `sql-04-lookups` → 4, `project-ufo`
-- → null. Mirrors `parseLessonNumber` in lib/retention/points.js.
create or replace function lesson_number(p_lesson_id text) returns int
language sql immutable as $$
  select nullif((regexp_match(coalesce(p_lesson_id, ''), '(?:^|-)(\d{1,3})(?=-|$)'))[1], '')::int;
$$;

create or replace function award_points(
  p_user      uuid,
  p_lesson_id text,
  p_screen_id text,
  p_day       date,
  p_award     int
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ceiling int;
  v_points  int;
  v_total   int;
  v_paid    int;
begin
  if p_user is null then raise exception 'award_points needs a user' using errcode = '22023'; end if;
  if p_day is null then raise exception 'award_points needs a day' using errcode = '22023'; end if;
  if p_screen_id is null or p_screen_id = '' then
    raise exception 'award_points needs a screen' using errcode = '22023';
  end if;

  -- The day row is created and locked first, so the ceiling is read from a row nobody else can
  -- change while this call decides. The claim below is then the only thing that can lose a race,
  -- and losing it means "already paid", not "error".
  insert into daily_points (user_id, day, points) values (p_user, p_day, 0)
  on conflict (user_id, day) do nothing;
  select points into v_total from daily_points where user_id = p_user and day = p_day for update;

  v_ceiling := coalesce(lesson_number(p_lesson_id), 0) * 5;
  if v_ceiling = 0 then
    -- An unnumbered lesson (a project, a capstone) pays nothing. Recorded as a decision, not a bug:
    -- points are per lesson number, and a project has no number to multiply.
    return jsonb_build_object('awarded', 0, 'total', v_total, 'reason', 'unnumbered');
  end if;
  v_points := least(greatest(coalesce(p_award, 0), 0), v_ceiling);

  insert into screen_awards (user_id, day, lesson_id, screen_id, points)
  values (p_user, p_day, p_lesson_id, p_screen_id, 0)
  on conflict (user_id, day, lesson_id, screen_id) do nothing;
  if not found then
    -- A second visit to the same screen on the same day: the row is the claim, and the claim is spent.
    return jsonb_build_object('awarded', 0, 'total', v_total, 'reason', 'already_paid');
  end if;

  v_paid := least(v_points, greatest(0, retention_daily_cap() - v_total));
  update screen_awards set points = v_paid
  where user_id = p_user and day = p_day and lesson_id = p_lesson_id and screen_id = p_screen_id;
  if v_paid > 0 then
    update daily_points set points = points + v_paid where user_id = p_user and day = p_day;
  end if;

  return jsonb_build_object(
    'awarded', v_paid,
    'total', v_total + v_paid,
    'reason', case when v_paid < v_points then 'capped' else 'paid' end,
    'capped', v_paid < v_points
  );
end;
$$;

-- The streak transition, as one atomic statement pair. `streakAfter` in lib/retention/streak.js is the
-- same rule in JavaScript: a day already counted changes nothing, the next day continues the run, a
-- gap of two restarts it at one, and `longest` is never lowered. A `p_day` behind `last_day` — a
-- timezone change, a device with the wrong date — also changes nothing rather than ending the run.
create or replace function touch_streak(p_user uuid, p_day date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current int;
  v_longest int;
  v_last    date;
  v_changed boolean := false;
begin
  if p_user is null then raise exception 'touch_streak needs a user' using errcode = '22023'; end if;
  if p_day is null then raise exception 'touch_streak needs a day' using errcode = '22023'; end if;

  insert into streaks (user_id) values (p_user) on conflict (user_id) do nothing;
  select current, longest, last_day into v_current, v_longest, v_last
  from streaks where user_id = p_user for update;

  if v_last is null then
    v_current := 1;
    v_longest := greatest(v_longest, 1);
    v_last    := p_day;
    v_changed := true;
  elsif p_day > v_last then
    v_current := case when p_day = v_last + 1 then v_current + 1 else 1 end;
    v_longest := greatest(v_longest, v_current);
    v_last    := p_day;
    v_changed := true;
  end if;

  if v_changed then
    update streaks set current = v_current, longest = v_longest, last_day = v_last
    where user_id = p_user;
  end if;

  return jsonb_build_object(
    'current', v_current, 'longest', v_longest, 'last_day', v_last, 'changed', v_changed
  );
end;
$$;

-- Neither function is a door a learner may knock on: the browser could otherwise award itself points
-- and invent a hundred-day streak. The route reaches them with the service role, which is the same
-- client that writes progress (0004) and for the same reason.
revoke execute on function award_points(uuid, text, text, date, int) from public, anon, authenticated;
revoke execute on function touch_streak(uuid, date) from public, anon, authenticated;
revoke execute on function retention_daily_cap() from public, anon, authenticated;
grant execute on function award_points(uuid, text, text, date, int) to service_role;
grant execute on function touch_streak(uuid, date) to service_role;
grant execute on function retention_daily_cap() to service_role;
