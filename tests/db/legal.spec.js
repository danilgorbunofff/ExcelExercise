// Phase 4, item 10 — the data rights, proved against real Postgres.
//
// Three properties are worth a database and none of them can be proved in JavaScript:
//
//   * the erase really erases, and only for the caller — `request_account_deletion()` is
//     `security definer`, so the grants on it are the whole authority check;
//   * the money rows survive the identity that produced them, first with a `user_id` that no longer
//     names anyone, then with `null` once the identity is deleted — the `on delete set null` in 0006;
//   * the export cannot reach a row that belongs to someone else, because both RPCs read
//     `auth.uid()` rather than a parameter they were handed.
//
//   npm run db:check

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { purgeUsers, psql, rest, signIn, signUp } from './harness.mjs';

const A = 'legal-probe-a@example.test';
const B = 'legal-probe-b@example.test';
const ALL = [A, B];
const LESSON = '01-sum-basics';
const BATCH = {
  [A]: 'aa111111-1111-4111-8111-111111111111',
  [B]: 'bb222222-2222-4222-8222-222222222222',
};

let alice;
let bob;

const write = (path, as, body) => rest(path, { as, method: 'POST', body });
const num = (sql) => Number(psql(sql));

function record(session) {
  return write('rpc/record_progress', 'service', {
    p_user: session.id,
    p_lesson_id: LESSON,
    p_track: 'excel',
    p_batch: BATCH[session.email],
    p_attempts: [
      {
        screen_id: 'screen-1',
        started_at: '2026-11-02T10:00:00.000Z',
        ended_at: '2026-11-02T10:01:00.000Z',
        correct_first_try: true,
        wrong_count: 0,
        help_used: false,
        answer: '=SUM(A1:A4)',
      },
    ],
    p_score: 100,
    p_wrong: 0,
    p_helped: false,
    p_ms: 9000,
    p_completed: true,
  });
}

before(async () => {
  purgeUsers(ALL);
  for (const email of ALL) {
    const created = await signUp(email, 'password123', { display_name: email });
    assert.equal(created.status, 200, `sign-up failed for ${email}: ${JSON.stringify(created.body)}`);
  }
  alice = await signIn(A);
  bob = await signIn(B);

  for (const session of [alice, bob]) {
    const recorded = await record(session);
    assert.ok(recorded.status < 300, `record_progress failed: ${JSON.stringify(recorded.body)}`);
    // The money rows are written by the service role because no learner has a grant on them (0002) —
    // which is exactly the situation the export RPCs exist for.
    const entitled = await write('entitlements', 'service', {
      user_id: session.id,
      plan: 'annual',
      status: 'active',
      source: 'stripe',
      stripe_customer_id: `cus_${session.id.slice(0, 8)}`,
    });
    assert.ok(entitled.status < 300, `entitlement insert failed: ${JSON.stringify(entitled.body)}`);
    // Points and streaks are awarded by the service role too (nothing grants a learner a write on
    // them, 0002), so the erase has to be proved on rows written the only way they ever are.
    const points = await write('daily_points', 'service', { user_id: session.id, day: '2026-11-02', points: 40 });
    assert.ok(points.status < 300, `points insert failed: ${JSON.stringify(points.body)}`);
    const streak = await write('streaks', 'service', { user_id: session.id, current: 3, longest: 5, last_day: '2026-11-02' });
    assert.ok(streak.status < 300, `streak insert failed: ${JSON.stringify(streak.body)}`);
    const paid = await write('payments', 'service', {
      user_id: session.id,
      amount: 5999,
      currency: 'usd',
      kind: 'subscription',
      stripe_payment_intent: `pi_${session.id.slice(0, 8)}`,
    });
    assert.ok(paid.status < 300, `payment insert failed: ${JSON.stringify(paid.body)}`);
  }
});

after(() => {
  purgeUsers(ALL);
});

describe('the export reads only your own rows', () => {
  it('returns the caller’s entitlement and payment, with no Stripe identifier', async () => {
    const { status, body } = await write('rpc/my_entitlements', alice, {});
    const { status: paidStatus, body: payments } = await write('rpc/my_payments', alice, {});
    assert.equal(status, 200, JSON.stringify(body));
    assert.equal(paidStatus, 200, JSON.stringify(payments));
    assert.equal(body.length, 1);
    assert.equal(body[0].plan, 'annual');
    assert.equal(payments.length, 1);
    assert.equal(payments[0].amount, 5999);
    for (const forbidden of ['user_id', 'stripe_customer_id', 'stripe_payment_intent', 'stripe_subscription_id']) {
      assert.ok(!(forbidden in body[0]) && !(forbidden in payments[0]), `${forbidden} leaked into the export`);
    }
  });

  it('hands a signed-out caller nothing at all', async () => {
    for (const rpc of ['my_entitlements', 'my_payments']) {
      const { status } = await write(`rpc/${rpc}`, 'anon', {});
      assert.ok(status >= 400, `${rpc} answered an anonymous caller with ${status}`);
    }
  });

  it('cannot be pointed at another learner: the functions take no argument', async () => {
    // A `{ uid }` body is ignored rather than honoured — the scope is `auth.uid()`, so the only way to
    // get another learner's rows would be to sign in as them.
    const { status } = await write('rpc/my_entitlements', alice, { uid: bob.id });
    // PostgREST resolves a function by name *and* signature, so a body carrying `uid` does not reach
    // `my_entitlements()` at all — there is no signature to match. Either answer is a refusal; what
    // must never happen is Bob's row coming back.
    assert.equal(status, 404, `a uid parameter was accepted: ${status}`);
    const own = await write('rpc/my_entitlements', alice, {});
    assert.equal(own.status, 200, JSON.stringify(own.body));
    assert.equal(own.body.length, 1);
    assert.equal(own.body[0].plan, 'annual');
  });
});

describe('deleting the account', () => {
  it('refuses a signed-out caller, and refuses it as a permission error', async () => {
    const { status } = await write('rpc/request_account_deletion', 'anon', {});
    assert.ok(status === 401 || status === 403, `anonymous deletion answered ${status}`);
    // Nobody was harmed by the refusal.
    assert.equal(num(`select count(*) from lesson_progress where user_id = '${alice.id}'`), 1);
  });

  it('erases the behavioural rows and anonymises the profile for the caller', async () => {
    const { status, body } = await write('rpc/request_account_deletion', alice, {});
    assert.equal(status, 200, JSON.stringify(body));
    assert.equal(body.progress, 1);
    assert.equal(body.attempts, 1);
    assert.ok(body.points >= 1, 'no daily points were erased');
    assert.ok(body.streaks >= 1, 'no streak was erased');
    assert.equal(body.already_requested, false);

    for (const table of ['lesson_progress', 'attempts', 'daily_points', 'streaks']) {
      assert.equal(num(`select count(*) from ${table} where user_id = '${alice.id}'`), 0, `${table} survived`);
    }

    const profile = psql(
      `select username || '|' || coalesce(display_name, '-') || '|' || coalesce(linkedin_url, '-') || '|' || coalesce(group_id::text, '-') || '|' || role || '|' || (deleted_at is not null)
       from profiles where id = '${alice.id}'`,
    );
    const [username, display, linkedin, group, role, stamped] = profile.split('|');
    assert.match(username, /^deleted-[0-9a-f]{12}$/, `username is still identifying: ${username}`);
    assert.equal(display, '-');
    assert.equal(linkedin, '-');
    assert.equal(group, '-');
    assert.equal(role, 'learner');
    assert.equal(stamped, 'true', 'deleted_at was not set');
  });

  it('revokes entitlement immediately, before the identity is deleted', async () => {
    const { body } = await write('rpc/is_entitled', alice, { uid: alice.id });
    assert.equal(body, false, 'a deleted account is still served the paid drills');
    const { body: bobStill } = await write('rpc/is_entitled', bob, { uid: bob.id });
    assert.equal(bobStill, true, 'deleting one account revoked another');
  });

  it('leaves the other learner untouched', async () => {
    assert.equal(num(`select count(*) from lesson_progress where user_id = '${bob.id}'`), 1);
    assert.equal(num(`select count(*) from attempts where user_id = '${bob.id}'`), 1);
    const profile = psql(`select username || '|' || (deleted_at is not null) from profiles where id = '${bob.id}'`);
    assert.ok(!profile.startsWith('deleted-'), 'another learner was anonymised');
    assert.ok(profile.endsWith('|false'), 'another learner was marked deleted');
  });

  it('keeps the money, still linked to a profile that no longer names anyone', async () => {
    assert.equal(num(`select count(*) from entitlements where user_id = '${alice.id}'`), 1);
    assert.equal(num(`select count(*) from payments where user_id = '${alice.id}'`), 1);
    // The Stripe identifiers are the processor's, not the learner's: they are retained on purpose and
    // are not part of any export (`my_payments` does not return them).
    assert.equal(num(`select count(*) from payments where stripe_payment_intent is not null and user_id = '${alice.id}'`), 1);
  });

  it('is idempotent enough to retry, and says when it is a retry', async () => {
    const { status, body } = await write('rpc/request_account_deletion', alice, {});
    assert.equal(status, 200, JSON.stringify(body));
    assert.equal(body.already_requested, true);
    assert.equal(body.progress, 0);
    assert.equal(body.attempts, 0);
  });

  it('unlinks the money when the identity itself is deleted, and keeps the rows', async () => {
    // Counted as a delta: earlier runs of this file leave their own unlinked rows behind, and a total
    // would turn that history into a flake.
    const before = {
      entitlements: num(`select count(*) from entitlements where user_id is null`),
      payments: num(`select count(*) from payments where user_id is null`),
    };
    // What `auth.admin.deleteUser` does, done over psql so this file needs no service trigger.
    psql(`delete from auth.users where email = '${A}';`);
    assert.equal(num(`select count(*) from profiles where id = '${alice.id}'`), 0, 'the profile outlived the identity');
    assert.equal(
      num(`select count(*) from entitlements where user_id is null`),
      before.entitlements + 1,
      'the entitlement was cascade-deleted',
    );
    assert.equal(
      num(`select count(*) from payments where user_id is null`),
      before.payments + 1,
      'the payment was cascade-deleted',
    );
    assert.equal(
      num(`select count(*) from entitlements where user_id = '${bob.id}'`),
      1,
      'the other learner’s entitlement was unlinked too',
    );
  });
});
