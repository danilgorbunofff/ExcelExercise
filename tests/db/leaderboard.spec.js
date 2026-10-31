// Phase 5, unit 5d — the leaderboards, proved against real Postgres.
//
// `tests/retention-leaderboard.test.js` proves the shaping and the cache; this file proves the things
// only a database can: that two learners holding different tokens get the *same numbered list*, that a
// tie is broken the same way for both, that the caller's own rank is right at rank 1, 3 and 50, that a
// day made by a machine is flagged out of the board instead of shown, and that a learner cannot call
// the heuristic or the review queue at all.
//
//   npm run db:check

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { psql, rest, signIn } from './harness.mjs';

const DAY = '2026-05-04';
const LOAD_DAY = '2026-05-10';
const EMAILS = Array.from({ length: 55 }, (_, i) => `lbb${i + 1}@example.com`);

let alice;
let board; // { [n]: { id, username } } for the 55 probe learners

const rpc = (name, args, as = 'service') =>
  rest(`rpc/${name}`, { as, method: 'POST', body: args });

async function boardPoints(args) {
  const { status, body } = await rpc('leaderboard_points', { p_day: DAY, ...args });
  assert.equal(status, 200, JSON.stringify(body));
  return body;
}

async function boardStreaks(args) {
  const { status, body } = await rpc('leaderboard_streaks', { p_day: DAY, ...args });
  assert.equal(status, 200, JSON.stringify(body));
  return body;
}

const withoutIsMe = (rows) => rows.map(({ is_me, ...rest }) => rest);

async function wipe() {
  psql(`delete from auth.users where email like 'lbb%@example.com';`);
}

before(async () => {
  // The probe learners are inserted through psql rather than GoTrue: 55 sign-ups would spend the local
  // mail rate limit, and the only thing this suite needs from an account is the profile row the
  // sign-up trigger creates. The insert goes through `auth.users`, so the trigger does run.
  await wipe();
  psql(`
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                            created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    select '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
           'lbb' || i || '@example.com', crypt('password123', gen_salt('bf')), now(), now(), now(), '{}', '{}'
    from generate_series(1, 55) i;
  `);

  const rows = JSON.parse(
    psql(`select coalesce(json_agg(json_build_object(
                    'n', replace(split_part(u.email, '@', 1), 'lbb', '')::int,
                    'id', u.id,
                    'username', (select p.username from profiles p where p.id = u.id))), '[]')
          from auth.users u where u.email like 'lbb%@example.com';`),
  );
  board = Object.fromEntries(rows.map((row) => [row.n, row]));

  // The small board. `lbb2` and `lbb3` tie on points, which is the case the ordering has to settle the
  // same way for two different viewers.
  psql(`
    insert into daily_points (user_id, day, points) values
      ('${board[1].id}', '${DAY}', 100),
      ('${board[2].id}', '${DAY}', 100),
      ('${board[3].id}', '${DAY}',  80),
      ('${board[4].id}', '${DAY}',  60),
      ('${board[5].id}', '${DAY}',  40),
      ('${board[6].id}', '${DAY}', 500);
  `);

  // The load board: 50 learners with strictly descending, distinct points, so `lbbN` sits at rank N.
  psql(`
    insert into daily_points (user_id, day, points)
    select u.id, '${LOAD_DAY}', (56 - replace(split_part(u.email, '@', 1), 'lbb', '')::int) * 10
    from auth.users u
    where u.email like 'lbb%@example.com'
      and replace(split_part(u.email, '@', 1), 'lbb', '')::int <= 50;
  `);

  psql(`
    insert into streaks (user_id, current, longest, last_day) values
      ('${board[1].id}', 30, 30, '${DAY}'),
      ('${board[2].id}', 12, 12, '${DAY}'),
      ('${board[3].id}', 12, 12, '2026-05-03'),
      ('${board[4].id}',  7,  9, '2026-04-20');
  `);

  // A day that looks machine-made: 21 screens, all first try, all unhelped, inside 21 seconds.
  psql(`
    insert into attempts (user_id, lesson_id, screen_id, attempt_seq, started_at, ended_at,
                          correct_first_try, wrong_count, help_used)
    select '${board[6].id}', '01-sum-basics', 'screen-' || i, 1,
           timestamptz '2026-05-04 10:00:00+00' + ((i - 1) * interval '1 second'),
           timestamptz '2026-05-04 10:00:00+00' + (i * interval '1 second'),
           true, 0, false
    from generate_series(1, 21) i;
  `);

  alice = await signIn('alice@example.com');
});

after(async () => {
  await wipe();
});

describe('leaderboard_points', () => {
  it('gives two different viewers the same numbered list', async () => {
    // Both viewers are below the cut, so each call returns the same three rows plus one own row at a
    // different rank. The board is the part that must not depend on who is asking.
    const cut = (rows) => withoutIsMe(rows.filter((row) => row.rank <= 3));
    const one = await boardPoints({ p_user: board[4].id });
    const other = await boardPoints({ p_user: board[5].id });
    assert.deepEqual(cut(one), cut(other));
    assert.deepEqual(
      one.filter((row) => row.is_me).map((row) => row.rank),
      [4],
    );
    assert.deepEqual(
      other.filter((row) => row.is_me).map((row) => row.rank),
      [5],
    );
  });

  it('ranks by points, settling a tie on the username', async () => {
    const rows = await boardPoints({ p_user: null });
    assert.deepEqual(
      rows.map((row) => [row.rank, row.username, row.points]),
      [
        [1, board[1].username, 100],
        [2, board[2].username, 100],
        [3, board[3].username, 80],
      ],
    );
  });

  it('appends the caller at rank 1, 3 and 50 without moving anyone else', async () => {
    const top = (n, day = LOAD_DAY) => rpc('leaderboard_points', { p_day: day, p_user: board[n].id, p_limit: 3 });

    for (const n of [1, 3, 50]) {
      const { status, body } = await top(n);
      assert.equal(status, 200, JSON.stringify(body));
      assert.deepEqual(
        body.map((row) => [row.rank, row.is_me]),
        n <= 3
          ? [
              [1, n === 1],
              [2, n === 2],
              [3, n === 3],
            ]
          : [
              [1, false],
              [2, false],
              [3, false],
              [n, true],
            ],
        `rank ${n}`,
      );
    }
  });

  it('returns no own row for a learner with nothing scored', async () => {
    const rows = await boardPoints({ p_user: board[9].id });
    assert.equal(rows.filter((row) => row.is_me).length, 0);
    assert.equal(rows.length, 3);
  });

  it('clamps a silly limit instead of returning the whole table', async () => {
    const none = await boardPoints({ p_user: null, p_limit: 0 });
    assert.equal(none.length, 1);
    const many = await boardPoints({ p_user: null, p_limit: 999 });
    assert.equal(many.length, 5, 'five displayable learners that day; the sixth is flagged');
  });

  it('keeps a flagged day off the board and hands it to the review queue', async () => {
    const rows = await boardPoints({ p_user: null });
    assert.equal(
      rows.some((row) => row.user_id === board[6].id),
      false,
      'lbb6 has the most points and is the only flagged learner',
    );

    const mine = await boardPoints({ p_user: board[6].id });
    const self = mine.find((row) => row.is_me);
    assert.ok(self, 'the flagged learner can still see their own row');
    assert.equal(self.rank, null);
    assert.equal(self.flagged, true);

    const { status, body } = await rpc('leaderboard_flags', { p_day: DAY });
    assert.equal(status, 200, JSON.stringify(body));
    assert.equal(body.length, 1);
    assert.equal(body[0].user_id, board[6].id);
    assert.equal(body[0].screens, 21);
    assert.ok(Number(body[0].seconds) < 30);
  });

  it('does not flag an honest, slow day', async () => {
    const { status, body } = await rpc('implausible_day', { p_user: board[1].id, p_day: DAY });
    assert.equal(status, 200);
    assert.equal(body, false);
  });

  it('is readable by a learner but the heuristic is not', async () => {
    const allowed = await rpc('leaderboard_points', { p_day: DAY, p_user: alice.id }, alice);
    assert.equal(allowed.status, 200, JSON.stringify(allowed.body));
    assert.ok(Array.isArray(allowed.body));

    for (const [name, args] of [
      ['leaderboard_flags', { p_day: DAY }],
      ['implausible_day', { p_user: alice.id, p_day: DAY }],
      ['learner_zone', { p_user: alice.id }],
    ]) {
      const denied = await rpc(name, args, alice);
      assert.equal(denied.status, 403, `${name} as a learner`);
    }
    const anon = await rpc('leaderboard_points', { p_day: DAY }, 'anon');
    assert.equal(anon.status, 401, 'PostgREST answers a missing token with 401');
  });
});

describe('learner_zone', () => {
  it('returns the stored zone, and UTC when it is not a real one', async () => {
    psql(`update profiles set timezone = 'Pacific/Auckland' where id = '${board[7].id}';`);
    psql(`update profiles set timezone = 'Mars/Olympus_Mons' where id = '${board[8].id}';`);
    const read = async (n) => (await rpc('learner_zone', { p_user: board[n].id })).body;
    assert.equal(await read(7), 'Pacific/Auckland');
    assert.equal(await read(8), 'UTC');
  });
});

describe('leaderboard_streaks', () => {
  it('orders by the current run and settles a tie on the username', async () => {
    const rows = await boardStreaks({ p_user: null });
    assert.deepEqual(
      rows.map((row) => [row.rank, row.username, row.streak]),
      [
        [1, board[1].username, 30],
        [2, board[2].username, 12],
        [3, board[3].username, 12],
      ],
    );
  });

  it('leaves out a run whose last day is older than yesterday', async () => {
    const rows = await boardStreaks({ p_user: null, p_limit: 25 });
    assert.equal(
      rows.some((row) => row.user_id === board[4].id),
      false,
      'lbb4 last drilled on 2026-04-20 and is not on a live run',
    );
  });

  it('gives the caller their own rank below the cut', async () => {
    const rows = await boardStreaks({ p_user: board[3].id, p_limit: 1 });
    assert.deepEqual(
      rows.map((row) => [row.rank, row.is_me]),
      [
        [1, false],
        [3, true],
      ],
    );
  });
});
