// Phase 5, unit 5b — the retention write path, proved against real Postgres.
//
// `tests/retention.test.js` proves the arithmetic; this file proves the three things arithmetic
// cannot: that the per-screen claim survives two calls for the same screen, that the day's ceiling
// holds when it is reached from many calls, and that a learner's own token cannot reach either
// function. It also runs the streak matrix through `touch_streak` and asserts the outcomes match
// `streakAfter`, so the JavaScript and the SQL cannot drift apart in silence.
//
//   npm run db:check

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { rest, signIn } from './harness.mjs';

import { DAILY_CAP, MAX_UNITS, dayKey, parseLessonNumber } from '../../lib/retention/points.js';
import { streakAfter } from '../../lib/retention/streak.js';
import { accuracyOf, shiftDay, weekView } from '../../lib/retention/trend.js';

const ALICE = 'alice@example.com'; // seeded
const BOB = 'bob@example.com'; // seeded
const LESSON = '05-sum-group-of-rows';
const SCREEN = 'screen-1';
const DAY = '2026-05-04';
const NEXT_DAY = '2026-05-05';
const LATER = '2026-05-09';

let alice;
let bob;

const write = (path, as, body) => rest(path, { as, method: 'POST', body });

async function award(args = {}) {
  const { status, body } = await write('rpc/award_points', 'service', {
    p_user: alice.id,
    p_lesson_id: LESSON,
    p_screen_id: SCREEN,
    p_day: DAY,
    p_award: 5,
    ...args,
  });
  assert.equal(status, 200, JSON.stringify(body));
  return body;
}

async function streak(args = {}) {
  const { status, body } = await write('rpc/touch_streak', 'service', {
    p_user: alice.id,
    p_day: DAY,
    ...args,
  });
  assert.equal(status, 200, JSON.stringify(body));
  return body;
}

async function dayTotal(day = DAY) {
  const { status, body } = await rest(
    `daily_points?user_id=eq.${alice.id}&day=eq.${day}&select=points`,
    { as: 'service' },
  );
  assert.equal(status, 200, JSON.stringify(body));
  return body.length === 0 ? 0 : body[0].points;
}

async function clearRetention() {
  // Through PostgREST as the service role, because a delete is a write and no learner may make one.
  for (const table of ['screen_awards', 'daily_points', 'streaks']) {
    const { status, body } = await rest(`${table}?user_id=not.is.null`, { as: 'service', method: 'DELETE' });
    if (status >= 400) throw new Error(`could not clear ${table}: ${status} ${JSON.stringify(body)}`);
  }
}

before(async () => {
  alice = await signIn(ALICE);
  bob = await signIn(BOB);
  await clearRetention();
});

after(async () => {
  await clearRetention();
});

describe('the day ceiling and the week of rules agree across the two languages', () => {
  it('keeps one number in two places', async () => {
    // The cap is a literal in the migration because SQL cannot import JavaScript. This is the test
    // that notices when only one of them is edited.
    const { body } = await write('rpc/retention_daily_cap', 'service', {});
    assert.equal(body, DAILY_CAP);
  });

  it('reads the same lesson number out of an id', async () => {
    for (const id of ['01-sum-basics', '12-nested-if', 'sql-04-lookups', 'project-ufo', 'capstone']) {
      const { body } = await write('rpc/lesson_number', 'service', { p_lesson_id: id });
      assert.equal(body, parseLessonNumber(id), id);
    }
  });
});

describe('award_points', () => {
  before(async () => {
    await clearRetention();
  });

  it('pays a screen once', async () => {
    const first = await award({ p_award: 20 });
    assert.equal(first.awarded, 20);
    assert.equal(first.total, 20);
    assert.equal(first.reason, 'paid');
    assert.equal(await dayTotal(), 20);
  });

  it('pays nothing for the same screen a second time that day', async () => {
    const again = await award({ p_award: 20 });
    assert.equal(again.awarded, 0);
    assert.equal(again.total, 20, 'a repeat is not a new total');
    assert.equal(again.reason, 'already_paid');
    assert.equal(await dayTotal(), 20);
  });

  it('pays the same screen again on a new day', async () => {
    const tomorrow = await award({ p_award: 20, p_day: NEXT_DAY });
    assert.equal(tomorrow.awarded, 20);
    assert.equal(await dayTotal(NEXT_DAY), 20);
  });

  it('refuses an award above 5 x the lesson number', async () => {
    const forged = await award({ p_screen_id: 'screen-2', p_award: 5000 });
    assert.equal(forged.awarded, 5 * parseLessonNumber(LESSON));
    assert.equal(forged.total, 20 + 5 * parseLessonNumber(LESSON));
  });

  it('treats a negative award as nothing', async () => {
    const negative = await award({ p_screen_id: 'screen-3', p_award: -50 });
    assert.equal(negative.awarded, 0);
    assert.equal(negative.reason, 'paid');
  });

  it('pays nothing for a lesson with no number', async () => {
    const project = await award({ p_lesson_id: 'project-ufo', p_award: 20 });
    assert.equal(project.awarded, 0);
    assert.equal(project.reason, 'unnumbered');
  });

  it('stops at the day ceiling and says so', async () => {
    await clearRetention();
    // Twenty-four lessons at the maximum unit: 24 × 5 × 5 = 600, past the 500 ceiling.
    for (let n = 1; n <= 24; n += 1) {
      await award({
        p_lesson_id: `${String(n).padStart(2, '0')}-filler`,
        p_screen_id: 'screen-1',
        p_award: MAX_UNITS * n,
      });
    }
    const total = await dayTotal();
    assert.equal(total, DAILY_CAP, 'the day stops exactly at the ceiling, not past it');
    const blocked = await award({ p_lesson_id: '25-filler', p_screen_id: 'screen-1', p_award: 5 });
    assert.equal(blocked.awarded, 0);
    assert.equal(blocked.total, DAILY_CAP);
    assert.equal(blocked.reason, 'capped');
  });

  it('keeps two learners\u2019 totals apart', async () => {
    await clearRetention();
    await award({ p_award: 20 });
    const theirs = await award({ p_user: bob.id, p_award: 5 });
    assert.equal(theirs.awarded, 5);
    assert.equal(await dayTotal(), 20);
  });
});

describe('touch_streak', () => {
  before(async () => {
    await clearRetention();
  });

  it('matches streakAfter on every edge in the unit matrix', async () => {
    // The matrix is the point: the SQL is allowed to be a second implementation only because the two
    // are compared case by case rather than assumed equal.
    const cases = [
      { state: { current: 0, longest: 0, last_day: null }, day: '2026-03-07' },
      { state: { current: 4, longest: 6, last_day: '2026-03-07' }, day: '2026-03-07' },
      { state: { current: 4, longest: 6, last_day: '2026-03-07' }, day: '2026-03-08' },
      { state: { current: 6, longest: 6, last_day: '2026-03-07' }, day: '2026-03-08' },
      { state: { current: 12, longest: 12, last_day: '2026-03-07' }, day: '2026-03-09' },
      { state: { current: 3, longest: 3, last_day: '2026-03-07' }, day: '2026-03-08' },
      { state: { current: 3, longest: 3, last_day: '2026-10-31' }, day: '2026-11-01' },
      { state: { current: 9, longest: 9, last_day: '2026-03-07' }, day: '2026-03-06' },
    ];

    for (const { state, day } of cases) {
      await clearRetention();
      const { status, body } = await write('streaks', 'service', {
        user_id: alice.id,
        current: state.current,
        longest: state.longest,
        last_day: state.last_day,
      });
      assert.ok(status < 400, JSON.stringify(body));

      const expected = streakAfter(state, day);
      const actual = await streak({ p_day: day });
      assert.equal(actual.current, expected.current, `current after ${day} from ${state.last_day}`);
      assert.equal(actual.longest, expected.longest, `longest after ${day} from ${state.last_day}`);
      assert.equal(actual.last_day, expected.last_day, `last_day after ${day}`);
      assert.equal(actual.changed, expected.changed, `changed after ${day}`);
    }
  });

  it('counts a day once, however many lessons finished on it', async () => {
    await clearRetention();
    const first = await streak({ p_day: DAY });
    assert.equal(first.current, 1);
    assert.equal(first.changed, true);
    const second = await streak({ p_day: DAY });
    assert.equal(second.current, 1);
    assert.equal(second.changed, false);
  });

  it('keeps the longest run when a gap restarts the current one', async () => {
    await clearRetention();
    await streak({ p_day: DAY });
    await streak({ p_day: NEXT_DAY });
    const after = await streak({ p_day: LATER });
    assert.equal(after.current, 1);
    assert.equal(after.longest, 2);
  });

  it('is the only write a streak gets \u2014 no client can move the row', async () => {
    await clearRetention();
    await streak({ p_day: DAY });
    const { status } = await write('streaks', alice, {
      user_id: alice.id,
      current: 999,
      longest: 999,
      last_day: DAY,
    });
    assert.equal(status, 403, 'a learner may read their streak and never write it');
  });
});

describe('the retention functions are not reachable from a browser', () => {
  it('refuses award_points to a learner and to anon', async () => {
    for (const as of [alice, bob, 'anon']) {
      const { status } = await write('rpc/award_points', as, {
        p_user: as === 'anon' ? alice.id : as.id,
        p_lesson_id: LESSON,
        p_screen_id: 'screen-9',
        p_day: DAY,
        p_award: 440,
      });
      assert.ok(status === 401 || status === 403, `award_points answered ${status}`);
    }
  });

  it('refuses touch_streak to a learner and to anon', async () => {
    for (const as of [alice, bob, 'anon']) {
      const { status } = await write('rpc/touch_streak', as, {
        p_user: as === 'anon' ? alice.id : as.id,
        p_day: DAY,
      });
      assert.ok(status === 401 || status === 403, `touch_streak answered ${status}`);
    }
  });

  it('lets a learner read only their own awards and streak', async () => {
    await clearRetention();
    await award({ p_award: 20 });
    await streak({ p_day: DAY });

    const mine = await rest('screen_awards?select=points', { as: alice });
    assert.equal(mine.status, 200);
    assert.equal(mine.body.length, 1);

    const theirs = await rest('screen_awards?select=points', { as: bob });
    assert.equal(theirs.status, 200);
    assert.deepEqual(theirs.body, [], 'another learner reads an empty table, not a forbidden one');

    const streakRow = await rest('streaks?select=current', { as: bob });
    assert.deepEqual(streakRow.body, []);
  });
});
// The week aggregate the account page reads. `tests/retention-trend.test.js` proves the shaping; this
// suite proves the SQL half: the caller's rows and nobody else's, bucketed in the caller's own zone,
// with the days that have nothing in them still present. Attempts go in through PostgREST as the
// service role under a lesson id nobody else uses, so the suite can clear exactly what it added, and
// every count is asserted as a delta from a baseline so another spec's attempts cannot tip it over.
const WEEK_LESSON = '99-trend-spec';
const DAY_MS = 24 * 60 * 60 * 1000;
const today = () => dayKey(new Date());
const ago = (days) => new Date(Date.now() - days * DAY_MS).toISOString();

async function clearWeek() {
  const { status, body } = await rest(`attempts?lesson_id=eq.${WEEK_LESSON}`, {
    as: 'service',
    method: 'DELETE',
  });
  if (status >= 400) throw new Error(`could not clear attempts: ${status} ${JSON.stringify(body)}`);
}

async function attempt(user, { daysAgo = 0, firstTry = true, seq = 1, screen = SCREEN, endedAt } = {}) {
  const ended = endedAt ?? ago(daysAgo);
  const { status, body } = await write('attempts', 'service', {
    user_id: user.id,
    lesson_id: WEEK_LESSON,
    screen_id: screen,
    attempt_seq: seq,
    started_at: ended,
    ended_at: ended,
    correct_first_try: firstTry,
  });
  assert.ok(status < 400, JSON.stringify(body));
}

async function week(as = alice, days = 7) {
  const { status, body } = await write('rpc/retention_week', as, { p_days: days });
  assert.equal(status, 200, JSON.stringify(body));
  return body;
}

async function setZone(zone) {
  const { status, body } = await rest(`profiles?id=eq.${alice.id}`, {
    as: 'service',
    method: 'PATCH',
    body: { timezone: zone },
  });
  assert.ok(status < 300, JSON.stringify(body));
}

const byDay = (series, day) => series.find((row) => row.day === day);
const screensOf = (series) => series.reduce((total, row) => total + row.screens, 0);
const screensOn = (body, day) => byDay(body.series, day)?.screens ?? 0;
const firstTryOn = (body, day) => byDay(body.series, day)?.firstTry ?? 0;

describe('retention_week', () => {
  before(async () => {
    await clearRetention();
    await clearWeek();
    await setZone('UTC');
  });

  after(async () => {
    await clearWeek();
    await clearRetention();
    await setZone('UTC');
  });

  it('answers one row per day, oldest first, ending today', async () => {
    const body = await week();
    assert.equal(body.days, 7);
    assert.equal(body.series.length, 7);
    for (const [index, row] of body.series.entries()) {
      assert.equal(row.day, shiftDay(today(), index - 6), `row ${index}`);
    }
  });

  it('counts the caller’s screens and nobody else’s', async () => {
    const mineBefore = await week();
    const theirsBefore = await week(bob);

    await attempt(alice, { seq: 1 });
    await attempt(alice, { seq: 2, firstTry: false });
    for (const seq of [1, 2, 3]) await attempt(bob, { seq });

    const mine = await week();
    assert.equal(screensOn(mine, today()) - screensOn(mineBefore, today()), 2);
    assert.equal(firstTryOn(mine, today()) - firstTryOn(mineBefore, today()), 1);

    const theirs = await week(bob);
    assert.equal(screensOn(theirs, today()) - screensOn(theirsBefore, today()), 3);
    assert.equal(screensOn(mine, today()), screensOn(mineBefore, today()) + 2, 'bob’s rows stay his');
  });

  it('keeps a day with nothing in it instead of dropping it', async () => {
    const target = shiftDay(today(), -3);
    const before = await week();
    await attempt(alice, { daysAgo: 3, seq: 3 });

    const body = await week();
    assert.equal(body.series.length, 7, 'seven days asked for, seven days answered');
    for (const row of body.series) {
      assert.ok(Number.isInteger(row.screens), row.day);
      assert.ok(Number.isInteger(row.firstTry), row.day);
    }

    assert.equal(screensOn(body, target), screensOn(before, target) + 1);
    for (const row of before.series) {
      if (row.day === target) continue;
      assert.equal(screensOn(body, row.day), row.screens, `${row.day} did not move`);
    }
  });

  it('ignores attempts outside the window, past or future', async () => {
    const baseline = screensOf((await week()).series);
    await attempt(alice, { daysAgo: 7, seq: 4 });
    await attempt(alice, { seq: 5, endedAt: new Date(Date.now() + 2 * DAY_MS).toISOString() });

    const body = await week();
    assert.equal(screensOf(body.series), baseline, 'a seven-day window holds neither of them');
  });

  it('buckets the day in the learner’s own zone', async () => {
    await clearWeek();
    // One attempt, three days back: under UTC and under Auckland it is the same row on two different
    // calendar days either side of the date line, so a UTC bucket cannot pass this by accident.
    const instant = new Date(Date.now() - 3 * DAY_MS);
    const auckland = dayKey(instant, 'Pacific/Auckland');
    const utc = dayKey(instant, 'UTC');
    await attempt(alice, { seq: 1, endedAt: instant.toISOString() });

    await setZone('Pacific/Auckland');
    const theirs = await week();
    assert.equal(screensOf(theirs.series), 1, 'one attempt, one screen');
    assert.equal(screensOn(theirs, auckland), 1, `expected ${auckland}`);

    await setZone('UTC');
    const naive = await week();
    assert.equal(screensOf(naive.series), 1);
    assert.equal(screensOn(naive, utc), 1, `expected ${utc}`);
    if (auckland !== utc) {
      assert.equal(screensOn(naive, auckland), 0, 'not the Auckland day');
    }
  });

  it('reads points and the streak from the learner’s own rows', async () => {
    await clearRetention();
    await award({ p_day: today(), p_award: 5 });
    await award({ p_day: shiftDay(today(), -10), p_award: 7, p_screen_id: 'screen-2' });
    await streak({ p_day: today() });

    const body = await week();
    assert.equal(body.pointsToday, 5, 'only today counts as today');
    assert.equal(body.pointsTotal, 12, 'the total is every day, not the window');
    assert.equal(body.streakCurrent, 1);
    assert.equal(body.streakLongest, 1);
    assert.equal(body.streakLastDay, today());
  });

  it('agrees with the JavaScript that shapes the same series', async () => {
    const body = await week();
    const view = weekView(body);
    const screens = screensOf(body.series);
    const firstTry = body.series.reduce((total, row) => total + row.firstTry, 0);

    assert.equal(view.day, body.day);
    assert.equal(view.screens, screens);
    assert.equal(view.firstTry, firstTry);
    assert.deepEqual(view.accuracy, accuracyOf(screens, firstTry), JSON.stringify(body));
    assert.deepEqual(view.streak, {
      current: body.streakCurrent,
      longest: body.streakLongest,
      lastDay: body.streakLastDay,
    });
  });

  it('clamps p_days to between one and thirty', async () => {
    assert.equal((await week(alice, 1)).series.length, 1);
    assert.equal((await week(alice, 1)).series.at(-1).day, today());
    assert.equal((await week(alice, 0)).series.length, 1);
    assert.equal((await week(alice, -5)).series.length, 1);
    assert.equal((await week(alice, 30)).series.length, 30);
    assert.equal((await week(alice, 500)).series.length, 30);
  });

  it('is not callable from a browser', async () => {
    const { status } = await write('rpc/retention_week', 'anon', {});
    assert.ok(status === 401 || status === 403, `retention_week answered ${status}`);
  });
});
