// Phase 4, unit 3a — the progress writer, proved against the real database.
//
// `lib/progress/derive.js` decides *what* should be written and `tests/progress-sync.test.js` covers
// that. This file covers the other half: that the function does what its comment claims when two
// batches, a retry, a second tab and a stranger's token all arrive. The properties worth attacking are
// the two the design rests on — the batch id is an idempotency key, and `attempt_seq` is the server's
// to assign — plus the guarantee that a learner still cannot write these tables directly.
//
// Every batch id here is used once, in order, so a later case cannot silently become a replay of an
// earlier one; `REPLAY` names the one batch the replay cases deliberately reuse.
//
//   npm run db:check

import { before, after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { purgeUsers, psql, rest, signIn, signUp } from './harness.mjs';

const LESSON = '01-sum-basics';
const SECOND_LESSON = '02-average-scores';
const THIRD_LESSON = '03-countif-open-tickets';
const A = 'progress-probe-a@example.test';
const B = 'progress-probe-b@example.test';
const ALL = [A, B];

const REPLAY = '11111111-1111-4111-8111-111111111111';
const SEQ = '22222222-2222-4222-8222-222222222222';
const WORSE = '33333333-3333-4333-8333-333333333333';
const HELPED = '44444444-4444-4444-8444-444444444444';
const NO_HELP = '55555555-5555-4555-8555-555555555555';
const AGAIN = '66666666-6666-4666-8666-666666666666';
const FAST = '77777777-7777-4777-8777-777777777777';
const NO_TIME = '88888888-8888-4888-8888-888888888888';
const FORGED = '99999999-9999-4999-8999-999999999999';
const BOB_BATCH = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const BOB_EMPTY = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

let alice;
let bob;

const at = (minute) => `2026-10-31T10:${String(minute).padStart(2, '0')}:00.000Z`;

function visit(screen, minute, { correct = true, wrong = 0, helped = false } = {}) {
  return {
    screen_id: `screen-${screen}`,
    started_at: at(minute),
    ended_at: at(minute + 1),
    correct_first_try: correct,
    wrong_count: wrong,
    help_used: helped,
    answer: null,
  };
}

function record(args = {}) {
  return rest('rpc/record_progress', {
    as: 'service',
    method: 'POST',
    body: {
      p_user: alice.id,
      p_lesson_id: LESSON,
      p_track: 'excel',
      p_batch: REPLAY,
      p_attempts: [],
      p_score: 100,
      p_wrong: 0,
      p_helped: false,
      p_ms: 9000,
      p_completed: true,
      ...args,
    },
  });
}

const mine = (sql) => psql(`${sql} where user_id = '${alice.id}'`);
const n = (sql) => Number(mine(sql));
const rows = async (path, as) => (await rest(path, { as })).body;

before(async () => {
  purgeUsers(ALL);
  const created = await signUp(A, 'password123', { display_name: 'Progress A' });
  assert.equal(created.status, 200, `sign-up failed: ${created.status} ${JSON.stringify(created.body)}`);
  await signUp(B, 'password123', { display_name: 'Progress B' });
  alice = await signIn(A);
  bob = await signIn(B);
});

after(() => {
  purgeUsers(ALL);
});

describe('record_progress writes what the events said', () => {
  it('inserts one attempt per screen with a server-assigned sequence', async () => {
    const { status, body } = await record({ p_attempts: [visit(1, 0), visit(2, 5)] });
    assert.equal(status, 200, JSON.stringify(body));
    assert.equal(body.replayed, false);
    assert.equal(body.attempts, 2);
    assert.equal(
      psql(`select string_agg(screen_id || ':' || attempt_seq, ',' order by screen_id)
             from attempts where user_id = '${alice.id}' and lesson_id = '${LESSON}'`),
      'screen-1:1,screen-2:1',
    );
    assert.equal(mine(`select status || ' ' || score || ' ' || attempts from lesson_progress`),
      'complete 100 2');
    assert.equal(psql(`select attempts from progress_batches where id = '${REPLAY}'`), '2');
  });

  it('ignores an attempt_seq the caller tries to supply', async () => {
    const { status } = await record({
      p_batch: SEQ,
      p_attempts: [{ ...visit(1, 20), attempt_seq: 99 }],
    });
    assert.equal(status, 200);
    assert.equal(
      mine(`select max(attempt_seq) from attempts`),
      '2',
      'the second visit continues the sequence rather than trusting the payload',
    );
  });
});

describe('the batch id is an idempotency key', () => {
  it('replays the same batch as a no-op', async () => {
    const before = n('select count(*) from attempts');
    const { status, body } = await record({ p_attempts: [visit(3, 30)] });
    assert.equal(status, 200);
    assert.equal(body.replayed, true);
    assert.equal(n('select count(*) from attempts'), before);
  });

  it('does not double-count a retried batch in the roll-up', async () => {
    const attempts = mine('select attempts from lesson_progress');
    await record();
    assert.equal(mine('select attempts from lesson_progress'), attempts);
  });
});

describe('a second batch merges into the same lesson row', () => {
  it('keeps the best score and adds the new attempts', async () => {
    const { body } = await record({
      p_batch: WORSE,
      p_attempts: [visit(3, 40, { correct: false, wrong: 2 })],
      p_score: 60,
      p_wrong: 2,
      p_completed: false,
      p_ms: null,
    });
    assert.equal(body.status, 'complete', 'a completed lesson does not go back to in_progress');
    assert.equal(body.score, 100, 'the best score survives a worse repeat');
    assert.equal(mine(`select attempts || ' ' || wrong_count from lesson_progress`), '4 2');
  });

  it('keeps help sticky once it has been used', async () => {
    await record({ p_batch: HELPED, p_attempts: [], p_helped: true, p_score: 40, p_completed: false });
    assert.equal(mine(`select helped from lesson_progress`), 't');
    await record({ p_batch: NO_HELP, p_attempts: [], p_helped: false, p_score: 30, p_completed: false });
    assert.equal(mine(`select helped from lesson_progress`), 't', 'a later clean run does not erase it');
  });

  it('records the first completion date, not the latest one', async () => {
    const first = mine('select completed_at from lesson_progress');
    assert.ok(first && first !== '', 'the first completed batch set a date');
    await record({ p_batch: AGAIN, p_attempts: [], p_completed: true });
    assert.equal(mine('select completed_at from lesson_progress'), first);
  });

  it('keeps the fastest run time and tolerates a batch without one', async () => {
    await record({ p_batch: FAST, p_attempts: [], p_ms: 4000, p_completed: true });
    assert.equal(mine(`select best_ms from lesson_progress`), '4000');
    await record({ p_batch: NO_TIME, p_attempts: [], p_ms: null, p_completed: true });
    assert.equal(mine(`select best_ms from lesson_progress`), '4000');
  });
});

describe('first-try accuracy belongs to the database', () => {
  it('recomputes it from the inserted rows instead of the payload', async () => {
    const { body } = await record({
      p_user: bob.id,
      p_lesson_id: SECOND_LESSON,
      p_batch: BOB_BATCH,
      p_attempts: [visit(1, 0), visit(2, 5, { correct: false, wrong: 1 })],
      p_score: 100,
      p_completed: true,
    });
    assert.equal(body.first_try_accuracy, 50);
    assert.equal(
      psql(`select first_try_accuracy from lesson_progress where user_id = '${bob.id}'`),
      '50.00',
      'a batch claiming a perfect score cannot claim a perfect accuracy',
    );
  });

  it('treats another account’s batch id as a collision, not a retry', async () => {
    const { status, body } = await record({ p_user: bob.id, p_batch: REPLAY, p_attempts: [visit(4, 60)] });
    assert.ok(status >= 400, `a stolen batch id must not be swallowed, got ${status} ${JSON.stringify(body)}`);
    assert.equal(psql(`select count(*) from attempts where user_id = '${bob.id}' and screen_id = 'screen-4'`), '0');
  });

  it('leaves accuracy null when no screen produced an answer', async () => {
    const { body } = await record({
      p_user: bob.id,
      p_lesson_id: THIRD_LESSON,
      p_batch: BOB_EMPTY,
      p_attempts: [],
      p_completed: false,
      p_score: 0,
      p_ms: null,
    });
    assert.equal(body.first_try_accuracy, null);
    assert.equal(body.status, 'in_progress');
  });
});

describe('the grants still hold', () => {
  it('refuses a learner calling record_progress directly', async () => {
    const before = n('select count(*) from attempts');
    const { status, body } = await rest('rpc/record_progress', {
      as: alice,
      method: 'POST',
      body: {
        p_user: alice.id,
        p_lesson_id: LESSON,
        p_track: 'excel',
        p_batch: FORGED,
        p_attempts: [visit(9, 50)],
        p_score: 100,
        p_wrong: 0,
        p_helped: false,
        p_ms: 1,
        p_completed: true,
      },
    });
    assert.ok(status >= 400, `the writer is service-role only, got ${status} ${JSON.stringify(body)}`);
    assert.equal(n('select count(*) from attempts'), before);
  });

  it('still refuses a direct insert into attempts, lesson_progress and progress_batches', async () => {
    for (const [table, row] of [
      ['attempts', { user_id: alice.id, lesson_id: LESSON, screen_id: 'screen-9', attempt_seq: 1, started_at: at(0) }],
      ['lesson_progress', { user_id: alice.id, lesson_id: 'forged-lesson', track: 'excel', score: 100 }],
      ['progress_batches', { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', user_id: alice.id }],
    ]) {
      const { status } = await rest(table, { as: alice, method: 'POST', body: row, prefer: 'return=minimal' });
      assert.equal(status, 403, `${table} must stay read-only for a learner`);
    }
  });

  it('hides one learner’s progress from another', async () => {
    const own = await rows(`lesson_progress?user_id=eq.${alice.id}`, alice);
    assert.equal(own.length, 1);
    assert.deepEqual(await rows(`lesson_progress?user_id=eq.${alice.id}`, bob), [], 'RLS filters it out');
    assert.deepEqual(await rows(`attempts?user_id=eq.${alice.id}`, bob), []);
  });
});
