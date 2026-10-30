// Phase 4 work item 11 — RLS proofs.
//
// Runs against the local Supabase stack (`npm run db:start`, `npm run db:reset`), over HTTP with
// real user JWTs, so the role under test is `authenticated` and not the superuser that bypasses
// everything. Every negative case here corresponds to a policy gap the phase-4 plan names.
//
//   npm run db:check

import { before, after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { signIn, rest, resetFixtures, psql } from './harness.mjs';

const LESSON = 'db-test-lesson-01';
const OTHER_LESSON = 'db-test-lesson-02';

let alice;
let bob;
let carol;
let groupId;

const minimal = 'return=minimal';
const representation = 'return=representation';

async function rows(path, as) {
  const { status, body } = await rest(path, { as });
  assert.equal(status, 200, `GET ${path} as ${as === 'service' ? 'service' : as?.email} failed`);
  return body;
}

async function write(path, as, body, prefer = minimal) {
  return rest(path, { as, method: 'POST', body, prefer });
}

async function isEntitled(session, uid) {
  const { status, body } = await write('rpc/is_entitled', session, { uid }, minimal);
  assert.equal(status, 200, 'is_entitled should be callable');
  return body === true || body === 'true';
}

before(async () => {
  alice = await signIn('alice@example.com');
  bob = await signIn('bob@example.com');
  carol = await signIn('carol@example.com');
  await resetFixtures();

  const groups = await rows('groups?select=id,name', 'service');
  assert.ok(groups.length >= 1, 'the seed should ship at least one group');
  groupId = groups[0].id;

  for (const [user, lesson] of [
    [alice, LESSON],
    [bob, OTHER_LESSON],
  ]) {
    const progress = await write(
      'lesson_progress',
      'service',
      { user_id: user.id, lesson_id: lesson, status: 'complete', score: 100, completed_at: new Date().toISOString() },
    );
    assert.equal(progress.status, 201, 'service role must be able to write progress');

    const attempt = await write('attempts', 'service', {
      user_id: user.id,
      lesson_id: lesson,
      screen_id: 'screen-1',
      attempt_seq: 1,
      started_at: new Date().toISOString(),
      ended_at: new Date().toISOString(),
      correct_first_try: true,
    });
    assert.equal(attempt.status, 201, 'service role must be able to write attempts');

    await write('daily_points', 'service', { user_id: user.id, day: '2026-01-01', points: 10 });
    await write('streaks', 'service', { user_id: user.id, current: 3, longest: 5, last_day: '2026-01-01' });
  }
});

after(async () => {
  await resetFixtures();
});

describe('RLS is on and default-denied', () => {
  it('every phase-4 table has row level security enabled', () => {
    const tables = [
      'profiles',
      'lesson_progress',
      'attempts',
      'daily_points',
      'streaks',
      'entitlements',
      'payments',
      'stripe_events',
      'groups',
      'group_invites',
      'feedback',
    ];
    const state = psql(
      `select relname, relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r'`,
    )
      .split('\n')
      .map((line) => line.split('\t'))
      .reduce((acc, [name, on]) => ({ ...acc, [name]: on === 't' }), {});
    for (const table of tables) assert.equal(state[table], true, `${table} must have RLS enabled`);
  });

  it('the policy set is exactly the documented one', () => {
    const counts = psql(
      `select tablename, count(*) from pg_policies where schemaname = 'public' group by 1 order by 1`,
    )
      .split('\n')
      .map((line) => line.split('\t'))
      .reduce((acc, [table, n]) => ({ ...acc, [table]: Number(n) }), {});
    assert.equal(counts.profiles, 3, 'profiles: self read, self update, group owner read');
    for (const table of ['lesson_progress', 'attempts', 'daily_points', 'streaks', 'groups', 'group_invites', 'feedback']) {
      assert.equal(counts[table], 1, `${table} should carry exactly one policy`);
    }
    // Money tables carry no policy at all: only the service role touches them.
    for (const table of ['entitlements', 'payments', 'stripe_events']) {
      assert.equal(counts[table], undefined, `${table} must have no policy`);
    }
  });

  it('learners hold no write grant on the progress tables', () => {
    const grants = psql(
      `select table_name, privilege_type from information_schema.role_table_grants
       where grantee in ('anon', 'authenticated')
         and table_name in ('lesson_progress', 'attempts', 'daily_points', 'streaks')`,
    );
    for (const line of grants ? grants.split('\n') : []) {
      const [, privilege] = line.split('\t');
      assert.equal(privilege, 'SELECT', `unexpected ${privilege} grant on a progress table`);
    }
  });

  it('no learner can truncate a table in the exposed schema, which RLS would not stop', () => {
    // Scoped to public: the platform's own storage/auth tables carry their own grants and are not
    // this project's to change.
    assert.equal(
      psql(
        `select count(*) from information_schema.role_table_grants
         where grantee in ('anon', 'authenticated') and privilege_type = 'TRUNCATE'
           and table_schema = 'public'`,
      ),
      '0',
    );
  });

  it('learners hold no privilege at all on the money tables', () => {
    assert.equal(
      psql(
        `select count(*) from information_schema.role_table_grants
         where grantee in ('anon', 'authenticated')
           and table_name in ('entitlements', 'payments', 'stripe_events')`,
      ),
      '0',
    );
  });
});

describe('cross-user reads are blocked', () => {
  it('a learner sees only their own profile row', async () => {
    const profiles = await rows('profiles?select=id', bob);
    assert.deepEqual(
      profiles.map((p) => p.id),
      [bob.id],
    );
  });

  it('anon sees no profile rows at all', async () => {
    assert.deepEqual(await rows('profiles?select=id', 'anon'), []);
  });

  it('a learner cannot read another learner in a different group', async () => {
    assert.deepEqual(await rows(`profiles?id=eq.${bob.id}&select=id`, carol), []);
  });

  it('a group owner can read their members (positive case for profiles_group_owner_read)', async () => {
    const profiles = await rows(`profiles?id=eq.${bob.id}&select=id`, alice);
    assert.deepEqual(
      profiles.map((p) => p.id),
      [bob.id],
    );
  });

  it('a learner cannot read another learner progress', async () => {
    assert.deepEqual(await rows(`lesson_progress?user_id=eq.${bob.id}`, carol), []);
    assert.equal((await rows(`lesson_progress?select=lesson_id`, alice)).length, 1);
  });

  it('a learner cannot read another learner attempts', async () => {
    assert.deepEqual(await rows(`attempts?user_id=eq.${bob.id}`, carol), []);
    assert.equal((await rows(`attempts?select=id`, bob)).length, 1);
  });

  it('a learner cannot read another learner points or streak', async () => {
    assert.deepEqual(await rows(`daily_points?user_id=eq.${bob.id}`, carol), []);
    assert.deepEqual(await rows(`streaks?user_id=eq.${bob.id}`, carol), []);
    assert.equal((await rows(`streaks?select=user_id`, bob)).length, 1);
  });

  it('a learner cannot read the money tables at all', async () => {
    for (const table of ['entitlements', 'payments', 'stripe_events']) {
      const { status } = await rest(`${table}?select=*`, { as: alice });
      assert.equal(status, 403, `${table} must refuse a learner outright`);
    }
  });
});

describe('cross-user writes are blocked', () => {
  it('a learner cannot update another learner profile', async () => {
    const res = await rest(`profiles?id=eq.${bob.id}`, {
      as: alice,
      method: 'PATCH',
      body: { display_name: 'hijacked' },
      prefer: representation,
    });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, [], 'the update must match no row');
    const [bobRow] = await rows(`profiles?id=eq.${bob.id}&select=display_name`, 'service');
    assert.notEqual(bobRow.display_name, 'hijacked');
  });

  it('a learner can update their own display name (positive case)', async () => {
    const res = await rest(`profiles?id=eq.${bob.id}`, {
      as: bob,
      method: 'PATCH',
      body: { display_name: 'Bobby', linkedin_url: 'https://example.com/bob' },
      prefer: representation,
    });
    assert.equal(res.status, 200);
    assert.equal(res.body[0].display_name, 'Bobby');
    assert.equal(res.body[0].linkedin_url, 'https://example.com/bob');
  });

  it('a learner cannot grant themselves a role or a group', async () => {
    for (const patch of [{ role: 'admin' }, { group_id: null }, { cohort: 7 }]) {
      const res = await rest(`profiles?id=eq.${alice.id}`, {
        as: alice,
        method: 'PATCH',
        body: patch,
        prefer: representation,
      });
      assert.equal(res.status, 403, `patching ${Object.keys(patch)[0]} must be refused by the column grants`);
    }
    const [row] = await rows(`profiles?id=eq.${alice.id}&select=role,group_id`, 'service');
    assert.equal(row.role, 'owner');
    assert.equal(row.group_id, groupId);
  });

  it('a learner cannot insert a profile row for themselves', async () => {
    const res = await write('profiles', bob, { id: bob.id, username: 'bob-clone' });
    assert.equal(res.status, 403);
  });
});

describe('a learner cannot forge a completion', () => {
  it('cannot insert lesson_progress through PostgREST with their own JWT', async () => {
    const res = await write('lesson_progress', alice, { user_id: alice.id, lesson_id: 'forged', status: 'complete' }, representation);
    assert.equal(res.status, 403);
    assert.deepEqual(await rows('lesson_progress?lesson_id=eq.forged', 'service'), []);
  });

  it('cannot update or delete their own existing progress', async () => {
    const patch = await rest(`lesson_progress?user_id=eq.${alice.id}`, {
      as: alice,
      method: 'PATCH',
      body: { score: 100 },
      prefer: minimal,
    });
    assert.equal(patch.status, 403);
    const del = await rest(`lesson_progress?user_id=eq.${alice.id}`, { as: alice, method: 'DELETE' });
    assert.equal(del.status, 403);
  });

  it('cannot insert attempts, points or a streak', async () => {
    const attempts = await write('attempts', alice, {
      user_id: alice.id,
      lesson_id: LESSON,
      screen_id: 'screen-1',
      attempt_seq: 2,
      started_at: new Date().toISOString(),
    });
    const points = await write('daily_points', alice, { user_id: alice.id, day: '2026-02-02', points: 999 });
    const streaks = await write('streaks', alice, { user_id: alice.id, current: 999 });
    assert.equal(attempts.status, 403);
    assert.equal(points.status, 403);
    assert.equal(streaks.status, 403);
  });
});

describe('groups and invites', () => {
  it('a member sees no group rows, the owner sees their own', async () => {
    assert.deepEqual(await rows('groups?select=id', bob), []);
    const owned = await rows('groups?select=id', alice);
    assert.deepEqual(
      owned.map((g) => g.id),
      [groupId],
    );
  });

  it('only the owner may invite into the group', async () => {
    const byMember = await write('group_invites', bob, { group_id: groupId, email: 'nope@example.com' });
    assert.equal(byMember.status, 403);
    const byOwner = await write('group_invites', alice, { group_id: groupId, email: 'invited@example.com' });
    assert.equal(byOwner.status, 201);
    assert.equal((await rows(`group_invites?group_id=eq.${groupId}&select=email`, bob)).length, 0);
    assert.equal((await rows(`group_invites?group_id=eq.${groupId}&select=email`, alice)).length, 1);
  });

  it('create_group is a definer RPC that sets ownership', async () => {
    const res = await write('rpc/create_group', carol, { group_name: 'Carol Academy', group_seats: 4 });
    assert.equal(res.status, 200);
    const newId = res.body;
    assert.match(newId, /^[0-9a-f-]{36}$/);
    const [group] = await rows(`groups?id=eq.${newId}&select=owner_id,seats`, 'service');
    assert.equal(group.owner_id, carol.id);
    assert.equal(group.seats, 4);
    const [profile] = await rows(`profiles?id=eq.${carol.id}&select=group_id,role`, 'service');
    assert.equal(profile.group_id, newId);
    assert.equal(profile.role, 'owner');
    const owned = await rows('groups?select=id', carol);
    assert.ok(owned.some((g) => g.id === newId), 'the creator must be able to read the group they own');
  });

  it('create_group refuses an anonymous caller', async () => {
    const res = await write('rpc/create_group', 'anon', { group_name: 'Anon Ltd' });
    assert.equal(res.status, 401);
  });
});

describe('feedback', () => {
  it('a signed-in learner can submit their own feedback', async () => {
    assert.equal((await write('feedback', carol, { user_id: carol.id, body: 'clear lesson' })).status, 201);
  });

  it('cannot submit feedback attributed to someone else', async () => {
    assert.equal((await write('feedback', carol, { user_id: alice.id, body: 'spoofed' })).status, 403);
    assert.equal((await write('feedback', carol, { body: 'unattributed' })).status, 403);
    assert.equal((await write('feedback', 'anon', { user_id: carol.id, body: 'anon' })).status, 401);
  });

  // Recorded in the phase-4 review doc as an open row: the documented policy set has no SELECT
  // policy on feedback, so Postgres refuses RETURNING. The API must insert with return=minimal.
  it('has no read path, so a representation insert is refused', async () => {
    const res = await write('feedback', carol, { user_id: carol.id, body: 'read me back' }, representation);
    assert.equal(res.status, 403);
    assert.deepEqual(await rows('feedback?select=id', carol), []);
  });
});

describe('is_entitled is the only gate', () => {
  async function setEntitlement(userId, row) {
    await rest(`entitlements?user_id=eq.${userId}`, { as: 'service', method: 'DELETE' });
    if (!row) return;
    const res = await write('entitlements', 'service', { user_id: userId, ...row });
    assert.equal(res.status, 201);
  }

  const future = () => new Date(Date.now() + 86_400_000).toISOString();
  const past = () => new Date(Date.now() - 86_400_000).toISOString();

  it('a learner with no entitlement is not entitled', async () => {
    await setEntitlement(carol.id, null);
    assert.equal(await isEntitled(carol, carol.id), false);
  });

  it('an active subscription inside its period is entitled', async () => {
    await setEntitlement(carol.id, { plan: 'monthly', status: 'active', current_period_end: future() });
    assert.equal(await isEntitled(carol, carol.id), true);
  });

  it('an active subscription past its period is not entitled', async () => {
    await setEntitlement(carol.id, { plan: 'annual', status: 'active', current_period_end: past() });
    assert.equal(await isEntitled(carol, carol.id), false);
  });

  it('a lifetime purchase is entitled without a period', async () => {
    await setEntitlement(carol.id, { plan: 'lifetime', status: 'active', current_period_end: null });
    assert.equal(await isEntitled(carol, carol.id), true);
  });

  it('past_due, canceled and revoked are not entitled', async () => {
    for (const status of ['past_due', 'canceled', 'revoked']) {
      await setEntitlement(carol.id, { plan: 'monthly', status, current_period_end: future() });
      assert.equal(await isEntitled(carol, carol.id), false, `${status} must not unlock`);
    }
  });

  it('an institutional grant is entitled', async () => {
    await setEntitlement(carol.id, { plan: 'institution', status: 'active', source: 'institution' });
    assert.equal(await isEntitled(carol, carol.id), true);
  });

  it('a learner cannot probe another account subscription state', async () => {
    await setEntitlement(alice.id, { plan: 'lifetime', status: 'active' });
    assert.equal(await isEntitled(bob, alice.id), false, 'is_entitled must be self-scoped');
    assert.equal(await isEntitled(alice, alice.id), true);
    await setEntitlement(alice.id, null);
  });
});
