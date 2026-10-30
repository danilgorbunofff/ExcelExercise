// Phase 4, item 3 — the profile a learner owns, proved against real Postgres.
//
// The profile page is a form over four columns, and every interesting property of that form lives in
// the database rather than in the server action: uniqueness is `citext unique`, and the columns a
// learner may write are a *column-level grant*, which is what stops a crafted PATCH from making its
// author a group owner. That second one is the reason this file exists — a server action can be
// skipped by anyone holding a JWT, and `updateProfile` nesting the object it sends is not a security
// boundary. The grant is.
//
//   npm run db:check

import { before, after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { purgeUsers, psql, rest, signIn, signUp } from './harness.mjs';

const A = 'profile-probe-a@example.test';
const B = 'profile-probe-b@example.test';
const ALL = [A, B];

let alice;
let bob;

// The columns named explicitly: PostgREST answers a representation request with `*` otherwise, and
// asserting on the whole row would make this file fail every time the schema gains a column.
const patch = (id, body, as) =>
  rest(`profiles?id=eq.${id}&select=username,display_name,linkedin_url`, {
    as,
    method: 'PATCH',
    body,
    prefer: 'return=representation',
  });

const row = (user) => psql(`select username, display_name, linkedin_url from profiles where id = '${user.id}'`);

before(async () => {
  purgeUsers(ALL);
  const created = await signUp(A, 'password123', { display_name: 'Profile A' });
  assert.equal(created.status, 200, `sign-up failed: ${created.status} ${JSON.stringify(created.body)}`);
  const second = await signUp(B, 'password123', { display_name: 'Profile B' });
  assert.equal(second.status, 200, `sign-up failed: ${second.status} ${JSON.stringify(second.body)}`);
  alice = await signIn(A);
  bob = await signIn(B);
});

after(() => {
  purgeUsers(ALL);
});

describe('editing your own profile', () => {
  it('writes the three editable fields and hands the row back', async () => {
    const { status, body } = await patch(
      alice.id,
      {
        username: 'alice.profile',
        display_name: 'Alice Probe',
        linkedin_url: 'https://www.linkedin.com/in/alice-probe',
      },
      alice,
    );
    assert.equal(status, 200, JSON.stringify(body));
    assert.deepEqual(body, [
      {
        username: 'alice.profile',
        display_name: 'Alice Probe',
        linkedin_url: 'https://www.linkedin.com/in/alice-probe',
      },
    ]);
  });

  it('keeps what was written', async () => {
    assert.equal(row(alice), 'alice.profile\tAlice Probe\thttps://www.linkedin.com/in/alice-probe');
  });

  it('lets the optional link be cleared', async () => {
    const { status } = await patch(alice.id, { linkedin_url: null }, alice);
    assert.equal(status, 200);
    assert.equal(psql(`select coalesce(linkedin_url, 'none') from profiles where id = '${alice.id}'`), 'none');
  });

  it('accepts the timezone column the day rollover needs', async () => {
    const { status } = await patch(alice.id, { timezone: 'Europe/Berlin' }, alice);
    assert.equal(status, 200);
    assert.equal(psql(`select timezone from profiles where id = '${alice.id}'`), 'Europe/Berlin');
  });

  it('lets a learner write their own username in another case without colliding with themselves', async () => {
    // `citext` makes `Alice.Profile` and `alice.profile` the same key, so this is a no-op on the
    // unique index rather than a conflict with the row being written.
    const { status } = await patch(alice.id, { username: 'Alice.Profile' }, alice);
    assert.equal(status, 200);
    assert.equal(psql(`select username from profiles where id = '${alice.id}'`), 'Alice.Profile');
    await patch(alice.id, { username: 'alice.profile' }, alice);
  });
});

describe('uniqueness is the database\'s decision', () => {
  it('refuses another account\'s username, whatever the case', async () => {
    await patch(bob.id, { username: 'bob.profile' }, bob);
    const { status, body } = await patch(alice.id, { username: 'BOB.PROFILE' }, alice);
    assert.equal(status, 409, `expected a unique violation, got ${status} ${JSON.stringify(body)}`);
    assert.equal(body.code, '23505', 'the code the server action turns into "That username is taken"');
  });

  it('leaves the refused row exactly as it was', async () => {
    assert.equal(psql(`select username from profiles where id = '${alice.id}'`), 'alice.profile');
    assert.equal(psql(`select username from profiles where id = '${bob.id}'`), 'bob.profile');
  });

  it('refuses an empty username outright', async () => {
    const { status } = await patch(alice.id, { username: null }, alice);
    assert.notEqual(status, 200, 'the column is not null, so a blank handle cannot be saved');
    assert.equal(psql(`select username from profiles where id = '${alice.id}'`), 'alice.profile');
  });
});

describe('the row you may edit is only your own', () => {
  it('cannot reach another account\'s row', async () => {
    const { status, body } = await patch(bob.id, { display_name: 'Hijacked' }, alice);
    // RLS makes the row invisible to the update, which PostgREST reports as zero rows changed rather
    // than as an error — so the assertion has to be on the row, not only on the status.
    assert.equal(status, 200);
    assert.deepEqual(body, []);
  });

  it('leaves that row untouched', async () => {
    assert.equal(psql(`select display_name from profiles where id = '${bob.id}'`), 'Profile B');
  });

  it('cannot read another account\'s row either', async () => {
    const { status, body } = await rest(`profiles?id=eq.${bob.id}&select=username,display_name`, { as: alice });
    assert.equal(status, 200);
    assert.deepEqual(body, [], 'the self-read policy is `id = auth.uid()` and nothing wider');
  });
});

describe('the columns that are not the learner\'s to write', () => {
  for (const [column, value] of [
    ['role', 'owner'],
    ['id', '00000000-0000-4000-8000-000000000000'],
  ]) {
    it(`refuses to change ${column}`, async () => {
      const { status } = await patch(alice.id, { [column]: value }, alice);
      assert.equal(status, 403, `grant update on profiles does not include ${column}`);
    });
  }

  it('refuses to change group_id', async () => {
    // No group exists in this fixture set, so this is refused either by the column grant or by the
    // foreign key — both are refusals, and neither can be the learner's own doing.
    const { status } = await patch(alice.id, { group_id: '00000000-0000-4000-8000-000000000001' }, alice);
    assert.notEqual(status, 200);
  });

  it('left every protected column alone', async () => {
    assert.equal(
      psql(`select role || ':' || (group_id is null)::text from profiles where id = '${alice.id}'`),
      'learner:true',
    );
  });
});

describe('a signed-out visitor cannot write a profile at all', () => {
  it('is refused by the anon role', async () => {
    const { status } = await patch(alice.id, { display_name: 'Anonymous' }, 'anon');
    assert.notEqual(status, 200, `anon must not be able to update a profile: ${status}`);
    assert.equal(psql(`select display_name from profiles where id = '${alice.id}'`), 'Alice Probe');
  });
});
