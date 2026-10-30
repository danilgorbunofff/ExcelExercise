// Phase 4, item 5 — the signed-out roll-up's way into the database, proved against real Postgres.
//
// The thing that must not happen: a migration inventing screen visits. `es.progress` records a
// completion, how many checks were missed and whether help was opened — not which screens were seen —
// so this path writes `lesson_progress` and never `attempts`, which is also why it cannot move
// `first_try_accuracy`. The other properties are merge properties, and they are the ones a learner
// would notice: an older completion must not overwrite a newer one, and signing in must not erase what
// the database already knew.
//
//   npm run db:check

import { before, after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { purgeUsers, psql, rest, signIn, signUp } from './harness.mjs';

const LESSON = '01-sum-basics';
const STARTED = '02-average-scores';
const EVENT = '03-countif-open-tickets';
const A = 'migrate-probe-a@example.test';
const B = 'migrate-probe-b@example.test';
const ALL = [A, B];

const FIRST = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const SECOND = 'aaaaaaaa-2222-4222-8222-aaaaaaaaaaaa';
const THIRD = 'aaaaaaaa-3333-4333-8333-aaaaaaaaaaaa';
const FOURTH = 'aaaaaaaa-4444-4444-8444-aaaaaaaaaaaa';
const FIFTH = 'aaaaaaaa-5555-4555-8555-aaaaaaaaaaaa';
const BOBS = 'aaaaaaaa-6666-4666-8666-aaaaaaaaaaaa';

let alice;
let bob;

const early = '2026-02-01T09:00:00.000Z';
const later = '2026-03-01T09:00:00.000Z';

const item = (lesson_id, extra = {}) => ({ lesson_id, completed_at: early, helped: false, score: 0, ...extra });

const migrate = (batch, lessons, as = 'service') =>
  rest('rpc/import_lesson_progress', {
    as,
    method: 'POST',
    body: { p_user: alice.id, p_batch: batch, p_lessons: lessons },
  });

const mine = (sql) => psql(`${sql} where user_id = '${alice.id}'`);
const n = (sql) => Number(mine(sql));
const one = (sql) => psql(sql.replaceAll("$A", alice.id));

before(async () => {
  purgeUsers(ALL);
  const created = await signUp(A, 'password123', { display_name: 'Migrate A' });
  assert.equal(created.status, 200, `sign-up failed: ${created.status} ${JSON.stringify(created.body)}`);
  await signUp(B, 'password123', { display_name: 'Migrate B' });
  alice = await signIn(A);
  bob = await signIn(B);
});

after(() => {
  purgeUsers(ALL);
});

describe('import_lesson_progress writes the roll-up and nothing else', () => {
  it('marks a finished lesson complete, with its date, and writes no attempts', async () => {
    const { status, body } = await migrate(FIRST, [item(LESSON, { helped: true, score: 70 })]);
    assert.equal(status, 200, JSON.stringify(body));
    assert.equal(body.replayed, false);
    assert.equal(body.lessons, 1);

    assert.equal(
      mine(`select status || ' ' || score || ' ' || attempts || ' ' || helped from lesson_progress`),
      'complete 70 0 true',
    );
    assert.equal(
      mine(`select completed_at = '${early}'::timestamptz from lesson_progress`),
      't',
      'the completion keeps the date the browser recorded, not the moment it was uploaded',
    );
    assert.equal(n('select count(*) from attempts'), 0, 'a roll-up cannot describe screens');
    assert.equal(
      mine(`select coalesce(first_try_accuracy::text, 'null') from lesson_progress`),
      'null',
      'accuracy needs attempts, so it stays unknown rather than guessed',
    );
    assert.equal(psql(`select attempts from progress_batches where id = '${FIRST}'`), '0');
  });

  it('records a lesson that was only started as in progress', async () => {
    const { status } = await migrate(SECOND, [item(STARTED, { completed_at: null })]);
    assert.equal(status, 200);
    assert.equal(
      one(`select status || ' ' || coalesce(completed_at::text, 'null') from lesson_progress where user_id = '$A' and lesson_id = '${STARTED}'`),
      'in_progress null',
    );
  });

  it('refuses a lesson with no id, and writes nothing when it does', async () => {
    const before = n('select count(*) from lesson_progress');
    const { status } = await migrate(THIRD, [{ lesson_id: '', completed_at: early }]);
    assert.ok(status >= 400, `expected a refusal, got ${status}`);
    assert.equal(n('select count(*) from lesson_progress'), before);
  });
});

describe('migrating merges instead of overwriting', () => {
  it('keeps the earliest completion, the higher score and the sticky help flag', async () => {
    // A real batch first: the learner finished this drill while signed in, today.
    const recorded = await rest('rpc/record_progress', {
      as: 'service',
      method: 'POST',
      body: {
        p_user: alice.id,
        p_lesson_id: EVENT,
        p_track: 'excel',
        p_batch: FOURTH,
        p_attempts: [
          {
            screen_id: 'screen-1',
            started_at: later,
            ended_at: later,
            correct_first_try: true,
            wrong_count: 0,
            help_used: false,
            answer: null,
          },
        ],
        p_score: 100,
        p_wrong: 0,
        p_helped: false,
        p_ms: 8000,
        p_completed: true,
      },
    });
    assert.equal(recorded.status, 200, JSON.stringify(recorded.body));

    // Then the browser's older, worse record arrives for the same lesson.
    const { status } = await migrate(FIFTH, [item(EVENT, { completed_at: early, helped: true, score: 5 })]);
    assert.equal(status, 200);

    assert.equal(
      one(`select completed_at = '${early}'::timestamptz from lesson_progress where user_id = '$A' and lesson_id = '${EVENT}'`),
      't',
      'the completion that happened first is the one that counts',
    );
    assert.equal(one(`select score from lesson_progress where user_id = '$A' and lesson_id = '${EVENT}'`), '100');
    assert.equal(one(`select helped from lesson_progress where user_id = '$A' and lesson_id = '${EVENT}'`), 't');
    assert.equal(
      one(`select attempts from lesson_progress where user_id = '$A' and lesson_id = '${EVENT}'`),
      '1',
      'a migration does not add checks it cannot attribute to screens',
    );
    assert.equal(Number(one(`select count(*) from attempts where user_id = '$A'`)), 1);
  });

  it('replays the same batch as a no-op', async () => {
    const before = psql(`select status || ' ' || score from lesson_progress where user_id = '${alice.id}' and lesson_id = '${EVENT}'`);
    const { status, body } = await migrate(FIFTH, [item(EVENT, { completed_at: early, helped: true, score: 5 })]);
    assert.equal(status, 200);
    assert.equal(body.replayed, true);
    assert.equal(body.lessons, 0);
    assert.equal(
      psql(`select status || ' ' || score from lesson_progress where user_id = '${alice.id}' and lesson_id = '${EVENT}'`),
      before,
    );
  });
});

describe('the migration path is not open to learners', () => {
  it('refuses a learner calling the function directly', async () => {
    const { status, body } = await migrate(BOBS, [item(LESSON)], alice);
    assert.ok(status >= 400, `expected a refusal, got ${status} ${JSON.stringify(body)}`);
    assert.equal(
      Number(one(`select count(*) from lesson_progress where user_id = '$A' and lesson_id = '${LESSON}' and status = 'in_progress'`)),
      0,
    );
  });

  it('refuses a batch id that belongs to another account', async () => {
    const claimed = await migrate(BOBS, [], 'service');
    assert.equal(claimed.status, 200, 'an empty list under a fresh key is legal and writes nothing');
    assert.equal(claimed.body.lessons, 0);

    // Bob cannot ride Alice's key, and Alice cannot ride hers a second time as if nothing happened.
    const clash = await rest('rpc/import_lesson_progress', {
      as: 'service',
      method: 'POST',
      body: { p_user: bob.id, p_batch: BOBS, p_lessons: [item(LESSON)] },
    });
    assert.ok(clash.status >= 400, `expected a collision, got ${clash.status}`);
    assert.equal(
      psql(`select count(*) from lesson_progress where user_id = '${bob.id}'`),
      '0',
      'the refused write left nothing behind',
    );
  });
});
