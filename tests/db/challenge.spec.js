// Phase 5, unit 5e — the daily challenge, proved against real Postgres.
//
// `tests/retention-challenge.test.js` proves the draw, the payload and the grading without a database.
// This file proves the four rules only the database can hold: one challenge per day (so a race at
// midnight resolves to one day, not two), one attempt per learner per day, one verdict per screen (a
// resubmitted answer cannot improve a run), and a board ordered on accuracy first, time second, and
// whoever finished first after that.
//
//   npm run db:check

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { psql, rest, signIn } from './harness.mjs';

const DAY = '2026-05-04';
const RANK_DAY = '2026-05-06';
const ACTIVITY_SINCE = '2026-05-01 00:00:00+00';
const SCREENS = Array.from({ length: 10 }, (_, i) => `01-sum-basics#formula-${i + 1}`);
const EMAILS = Array.from({ length: 22 }, (_, i) => `dayb${i + 1}@example.com`);

let alice;
let players; // { [n]: { id, username } }

const rpc = (name, args, as = 'service') => rest(`rpc/${name}`, { as, method: 'POST', body: args });

async function call(name, args, as = 'service') {
  const { status, body } = await rpc(name, args, as);
  assert.equal(status, 200, `${name}: ${JSON.stringify(body)}`);
  return body;
}

const ensure = (args = {}) =>
  call('challenge_ensure', { p_day: DAY, p_topics: ['sum', 'lookup'], p_screens: SCREENS, ...args });

const begin = (n, day = DAY) => call('challenge_begin', { p_day: day, p_user: players[n].id });
const answer = (n, screen, ok, day = DAY) =>
  call('challenge_answer', { p_day: day, p_user: players[n].id, p_screen: screen, p_ok: ok });
const finish = (n, size = 10, day = DAY) =>
  call('challenge_finish', { p_day: day, p_user: players[n].id, p_size: size });

const wipe = () => psql(`delete from auth.users where email like 'dayb%@example.com';`);

before(async () => {
  await wipe();
  psql(`
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                            created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    select '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
           'dayb' || i || '@example.com', crypt('password123', gen_salt('bf')), now(), now(), now(), '{}', '{}'
    from generate_series(1, 22) i;
  `);

  const rows = JSON.parse(
    psql(`select coalesce(json_agg(json_build_object(
                    'n', replace(split_part(u.email, '@', 1), 'dayb', '')::int,
                    'id', u.id,
                    'username', (select p.username from profiles p where p.id = u.id))), '[]')
          from auth.users u where u.email like 'dayb%@example.com';`),
  );
  players = Object.fromEntries(rows.map((row) => [row.n, row]));

  alice = await signIn('alice@example.com');
});

after(async () => {
  await wipe();
});

describe('challenge_ensure', () => {
  it('creates the day once and returns it to every caller', async () => {
    const first = await ensure();
    assert.equal(first.day, DAY);
    assert.deepEqual(first.topics, ['sum', 'lookup']);
    assert.deepEqual(first.screens, SCREENS);

    // A second caller that drew differently loses: the stored day is what it gets back.
    const second = await ensure({ p_topics: ['date'], p_screens: ['02-other#picture-1'] });
    assert.deepEqual(second.topics, ['sum', 'lookup']);
    assert.deepEqual(second.screens, SCREENS);
  });

  it('refuses a day with no screens instead of storing an empty challenge', async () => {
    const { status, body } = await rpc('challenge_ensure', {
      p_day: '2026-05-20',
      p_topics: [],
      p_screens: [],
    });
    assert.equal(status, 400, JSON.stringify(body));
    assert.match(JSON.stringify(body), /at least one screen/);
  });
});

describe('challenge_begin', () => {
  it('starts a run once and resumes it afterwards, keeping the original clock', async () => {
    const first = await begin(1);
    assert.equal(first.created, true);
    assert.equal(first.answered, 0);
    assert.equal(first.correct, 0);
    assert.equal(first.finished_at, null);
    assert.ok(first.id);

    const again = await begin(1);
    assert.equal(again.created, false);
    assert.equal(again.id, first.id);
    assert.equal(again.started_at, first.started_at, 'a reopened tab is the same run, not a fresh clock');
  });

  it('refuses a day that was never drawn', async () => {
    const { status, body } = await rpc('challenge_begin', { p_day: '2026-05-21', p_user: players[1].id });
    assert.equal(status, 400, JSON.stringify(body));
    assert.match(JSON.stringify(body), /no challenge for/);
  });

  it('makes a second run for the same learner impossible at the table level', () => {
    // The rule is a unique constraint, not a check in code: the insert has to fail.
    assert.throws(
      () =>
        psql(
          `insert into challenge_attempts (day, user_id) values ('${DAY}', '${players[1].id}');`,
        ),
      /duplicate key value violates unique constraint/,
    );
  });
});

describe('challenge_answer', () => {
  before(async () => {
    await begin(2);
  });

  it('stores a verdict and counts it', async () => {
    const first = await answer(2, SCREENS[0], true);
    assert.equal(first.ok, true);
    assert.equal(first.first, true);
    assert.equal(first.verdict, true);
    assert.equal(first.answered, 1);
    assert.equal(first.correct, 1);

    const second = await answer(2, SCREENS[1], false);
    assert.equal(second.first, true);
    assert.equal(second.verdict, false);
    assert.equal(second.answered, 2);
    assert.equal(second.correct, 1);
  });

  it('keeps the first verdict when a screen is answered again', async () => {
    const again = await answer(2, SCREENS[1], true);
    assert.equal(again.first, false, 'the row already existed, whatever the new answer says');
    assert.equal(again.verdict, false, 'the stored verdict is returned, not the submitted one');
    assert.equal(again.answered, 2);
    assert.equal(again.correct, 1, 'a retried screen cannot turn a miss into a hit');

    const stored = psql(
      `select ok from challenge_answers a join challenge_attempts t on t.id = a.attempt_id
       where t.user_id = '${players[2].id}' and a.screen_id = '${SCREENS[1]}';`,
    );
    assert.equal(stored, 'f');
  });

  it('refuses a screen the day does not hold', async () => {
    const body = await answer(2, '99-not-today#formula-1', true);
    assert.equal(body.ok, false);
    assert.equal(body.error, 'unknown_screen');
  });

  it('refuses an answer for a learner who never started', async () => {
    const body = await answer(3, SCREENS[0], true);
    assert.equal(body.ok, false);
    assert.equal(body.error, 'not_started');
  });

  it('refuses an answer once the run is closed', async () => {
    await begin(4);
    await answer(4, SCREENS[0], true);
    await finish(4);
    const body = await answer(4, SCREENS[1], true);
    assert.equal(body.ok, false);
    assert.equal(body.error, 'already_finished');
  });
});

describe('challenge_finish', () => {
  it('scores accuracy over the whole challenge, not over what was answered', async () => {
    await begin(5);
    await answer(5, SCREENS[0], true);
    await answer(5, SCREENS[1], true);
    await answer(5, SCREENS[2], false);
    const score = await finish(5);
    assert.equal(score.ok, true);
    assert.equal(score.answered, 3);
    assert.equal(score.correct, 2);
    assert.equal(Number(score.accuracy), 0.2, 'two of ten screens: quitting early is not a high score');
  });

  it('is idempotent, so a double submit cannot rewrite the score', async () => {
    const first = await finish(5);
    const second = await finish(5);
    assert.equal(second.accuracy, first.accuracy);
    assert.equal(second.ms, first.ms);
    assert.equal(second.finished_at, first.finished_at);
  });

  it('clamps a run that outlasted its fifteen minutes', async () => {
    await begin(6);
    psql(
      `update challenge_attempts set started_at = now() - interval '2 hours'
       where user_id = '${players[6].id}' and day = '${DAY}';`,
    );
    const score = await finish(6);
    assert.equal(score.ms, 900_000, 'the cap is the worst time on the board');
  });

  it('reports a run that was never started', async () => {
    const body = await finish(7);
    assert.equal(body.ok, false);
    assert.equal(body.error, 'not_started');
  });
});

describe('challenge_rank', () => {
  const rows = [
    // [player, accuracy, ms, finished_at]
    [8, 1.0, 50_000, '10:00:00'],
    [9, 1.0, 50_000, '10:10:00'], // same score, same time: whoever finished first leads
    [11, 0.9, 20_000, '10:30:00'], // same accuracy as player 10, faster, so it leads
    [10, 0.9, 30_000, '10:20:00'],
    [12, 0.8, 60_000, '10:40:00'],
    [13, 0.7, 60_000, '10:50:00'],
    [14, 0.6, 60_000, '11:00:00'],
    [15, 0.5, 60_000, '11:10:00'],
    [16, 0.4, 60_000, '11:20:00'],
    [17, 0.3, 60_000, '11:30:00'],
    [18, 0.2, 60_000, '11:40:00'],
    [19, 0.1, 60_000, '11:50:00'],
  ];

  before(async () => {
    await call('challenge_ensure', { p_day: RANK_DAY, p_topics: ['sum'], p_screens: SCREENS });
    for (const [n] of rows) await call('challenge_begin', { p_day: RANK_DAY, p_user: players[n].id });
    psql(`
      update challenge_attempts a
      set finished_at   = timestamptz '${RANK_DAY} ' + v.finished::time,
          accuracy      = v.accuracy,
          ms            = v.ms,
          answered      = 10,
          correct       = (v.accuracy * 10)::int
      from (values ${rows
        .map(([n, accuracy, ms, finished]) => `('${players[n].id}', ${accuracy}, ${ms}, '${finished}')`)
        .join(', ')}) as v(user_id, accuracy, ms, finished)
      where a.user_id = v.user_id::uuid and a.day = '${RANK_DAY}';
    `);
    // Unfinished and unfinished-but-answered runs must not appear on the board at all.
    await call('challenge_begin', { p_day: RANK_DAY, p_user: players[20].id });
  });

  it('orders by accuracy, then time, then who finished first', async () => {
    const body = await call('challenge_rank', { p_day: RANK_DAY, p_user: null, p_limit: 50 });
    assert.deepEqual(
      body.map((row) => [row.rank, row.username]),
      rows.map(([n], index) => [index + 1, players[n].username]),
    );
    assert.deepEqual(
      body.map((row) => Number(row.accuracy)),
      rows.map(([, accuracy]) => accuracy),
    );
  });

  it('leaves an unfinished run off the board', async () => {
    const body = await call('challenge_rank', { p_day: RANK_DAY, p_user: null, p_limit: 50 });
    assert.equal(body.some((row) => row.user_id === players[20].id), false);
    assert.equal(body.some((row) => row.user_id === players[21].id), false, 'never started');
  });

  it('marks the caller and appends their line at 1, 3 and beyond the cut', async () => {
    const forPlayer = async (n, limit = 10) =>
      call('challenge_rank', { p_day: RANK_DAY, p_user: players[n].id, p_limit: limit });

    assert.deepEqual(
      (await forPlayer(8)).filter((row) => row.is_me).map((row) => row.rank),
      [1],
    );
    assert.deepEqual(
      (await forPlayer(11)).filter((row) => row.is_me).map((row) => row.rank),
      [3],
    );

    const last = await forPlayer(19);
    assert.equal(last.length, 11, 'the ten ranked rows plus the caller');
    assert.deepEqual(
      last.filter((row) => row.is_me).map((row) => row.rank),
      [12],
    );
    // The board half of the answer is the same list for everybody.
    const boardOnly = (body) => body.filter((row) => row.rank <= 10).map((row) => row.username);
    assert.deepEqual(boardOnly(last), boardOnly(await forPlayer(8)));
  });

  it('returns no own row for a learner with nothing finished', async () => {
    const body = await call('challenge_rank', { p_day: RANK_DAY, p_user: players[20].id, p_limit: 3 });
    assert.equal(body.length, 3);
    assert.equal(body.some((row) => row.is_me), false);
  });

  it('clamps a silly limit', async () => {
    const none = await call('challenge_rank', { p_day: RANK_DAY, p_user: null, p_limit: 0 });
    assert.equal(none.length, 1);
    const all = await call('challenge_rank', { p_day: RANK_DAY, p_user: null, p_limit: 999 });
    assert.equal(all.length, rows.length);
  });
});

describe('challenge_activity', () => {
  it('counts the screens attempted per lesson inside the window', async () => {
    psql(`
      delete from attempts where lesson_id in ('01-sum-basics', '07-lookup-basics');
      insert into attempts (user_id, lesson_id, screen_id, attempt_seq, started_at, ended_at,
                            correct_first_try, wrong_count, help_used)
      select '${players[1].id}', '01-sum-basics', 's' || i, 1, timestamptz '2026-05-02 09:00:00+00',
             timestamptz '2026-05-02 09:01:00+00', true, 0, false
      from generate_series(1, 4) i;
      insert into attempts (user_id, lesson_id, screen_id, attempt_seq, started_at, ended_at,
                            correct_first_try, wrong_count, help_used)
      select '${players[1].id}', '07-lookup-basics', 's' || i, 1, timestamptz '2026-04-01 09:00:00+00',
             timestamptz '2026-04-01 09:01:00+00', true, 0, false
      from generate_series(1, 2) i;
    `);

    const rows = await call('challenge_activity', { p_since: ACTIVITY_SINCE });
    const byLesson = new Map(rows.map((row) => [row.lesson_id, Number(row.screens)]));
    assert.equal(byLesson.get('01-sum-basics'), 4);
    assert.equal(byLesson.has('07-lookup-basics'), false, 'the April attempt is outside the window');
  });
});

describe('who can call these', () => {
  it('lets a learner read the board but nothing else', async () => {
    const board = await rpc('challenge_rank', { p_day: RANK_DAY, p_limit: 3 }, alice);
    assert.equal(board.status, 200, JSON.stringify(board.body));
    assert.ok(Array.isArray(board.body));

    for (const [name, args] of [
      ['challenge_ensure', { p_day: DAY, p_topics: [], p_screens: SCREENS }],
      ['challenge_begin', { p_day: DAY, p_user: alice.id }],
      ['challenge_answer', { p_day: DAY, p_user: alice.id, p_screen: SCREENS[0], p_ok: true }],
      ['challenge_finish', { p_day: DAY, p_user: alice.id, p_size: 10 }],
      ['challenge_activity', { p_since: ACTIVITY_SINCE }],
    ]) {
      const denied = await rpc(name, args, alice);
      assert.equal(denied.status, 403, `${name} as a learner: ${JSON.stringify(denied.body)}`);
    }
  });

  it('answers an anonymous caller with 401', async () => {
    const anon = await rpc('challenge_rank', { p_day: RANK_DAY }, 'anon');
    assert.equal(anon.status, 401, 'PostgREST answers a missing token with 401');
  });

  it('shows a learner only their own attempt row', async () => {
    const mine = await rest(`challenge_attempts?day=eq.${DAY}&select=user_id`, { as: alice });
    assert.equal(mine.status, 200);
    assert.deepEqual(mine.body, [], 'alice has no run today');
  });

  it('keeps the answer key closed to a learner', async () => {
    // No grant at all, not even a policy that filters to nothing: a learner's token is refused by the
    // table privileges before RLS is reached.
    const answers = await rest(`challenge_answers?select=screen_id`, { as: alice });
    assert.equal(answers.status, 403, JSON.stringify(answers.body));
  });
});
