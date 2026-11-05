// The feedback note, proved against real Postgres.
//
// `tests/feedback-note.test.js` proves the rules (a mood is required, the text is cut at the limit, the
// page must be a local path) and `e2e/feedback.spec.js` proves the browser half. What neither can prove
// is the write itself, and that is the part the dialog's copy now promises: a note reaches a row.
//
// Three properties need the database:
//
//   * the exact shape the route inserts — `user_id` null for a signed-out visitor — is accepted, which
//     is why the route needs the service role at all;
//   * a learner cannot file a note as somebody else, and an anonymous client cannot file one at all,
//     because the insert policy compares `user_id` to `auth.uid()`;
//   * the 500-character limit the browser enforces is the same one the column enforces, so a client
//     that skips the count is refused by the table rather than stored truncated.
//
//   npm run db:check

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { purgeUsers, rest, signIn, signUp } from './harness.mjs';

const WRITER = 'feedback-probe-a@example.test';
const OTHER = 'feedback-probe-b@example.test';
const ALL = [WRITER, OTHER];

// No `return=representation`: `feedback` has an insert policy but no select policy of its own, because
// a note is for the team and not for the learner's feed. Asking PostgREST to hand the row back turns
// the insert into a policy violation, which is a confusing way to learn that the row is not readable —
// so the assertions below read the table with the service role instead.
const write = (body, as) => rest('feedback', { as, method: 'POST', body });

const count = async (filter) => {
  const { body } = await rest(`feedback?select=id&${filter}`, { as: 'service' });
  return body.length;
};

let writer;
let other;

// The suite owns every row it writes. Notes filed without an account have no owner to purge, and a
// learner's row is orphaned to `user_id: null` when their account goes (`on delete set null`), so the
// cleanup is the same query at both ends.
const clear = () => rest('feedback?user_id=is.null', { as: 'service', method: 'DELETE' });

before(async () => {
  await clear();
  await signUp(WRITER);
  await signUp(OTHER);
  writer = await signIn(WRITER);
  other = await signIn(OTHER);
});

after(async () => {
  await purgeUsers(ALL);
  await clear();
});

describe('the feedback route can file a signed-out note', () => {
  it('accepts a null user_id from the service role, which is the route’s own write', async () => {
    const page = '/learn/excel/sum-basics/01-sum-basics';
    const { status, body } = await rest('feedback', {
      as: 'service',
      method: 'POST',
      body: { user_id: null, page, body: 'the second step lost me' },
      prefer: 'return=representation',
    });
    assert.equal(status, 201, JSON.stringify(body));
    assert.equal(body[0].user_id, null);
    assert.equal(body[0].page, page);
    assert.equal(body[0].body, 'the second step lost me');
  });

  it('refuses the same insert from an anonymous client', async () => {
    const { status } = await write({ user_id: null, page: '/', body: 'anonymous' }, 'anon');
    assert.ok(status >= 400, `an anonymous insert was accepted (${status})`);
  });
});

describe('a note belongs to the account that filed it', () => {
  it('lets a learner file their own, and it lands on their account', async () => {
    const { status, body } = await write({ user_id: writer.id, page: '/', body: 'mine' }, writer);
    assert.equal(status, 201, JSON.stringify(body));
    assert.equal(await count(`user_id=eq.${writer.id}`), 1, 'the note was not written');
  });

  it('does not let the learner read it back — a note is for the team, not the feed', async () => {
    const { status, body } = await rest('feedback?select=id,body', { as: writer });
    assert.ok(status === 200 || status === 403, `unexpected status ${status}`);
    assert.deepEqual(body ?? [], [], 'a learner could read a feedback row');
  });

  it('refuses a learner filing it as somebody else', async () => {
    const { status } = await write({ user_id: other.id, page: '/', body: 'not mine' }, writer);
    assert.ok(status >= 400, `a note filed as another account was accepted (${status})`);
  });

  it('refuses a learner reading the rows', async () => {
    const { status } = await rest('feedback?select=id&limit=1', { as: writer });
    // 200 with an empty array is also a pass: RLS filters rather than errors, and the point is that no
    // row comes back.
    assert.ok(status === 403 || status === 200, `unexpected status ${status}`);
    const { body } = await rest('feedback?select=id,body', { as: writer });
    assert.deepEqual(body, [], 'a learner could read feedback rows');
  });
});

describe('the column enforces the limit the browser enforces', () => {
  it('refuses a note over 500 characters', async () => {
    const { status } = await write({ user_id: null, page: '/', body: 'x'.repeat(501) }, 'service');
    assert.ok(status >= 400, 'a 501-character note was stored');
  });

  it('refuses an empty one', async () => {
    const { status } = await write({ user_id: null, page: '/', body: '' }, 'service');
    assert.ok(status >= 400, 'an empty note was stored');
  });

  it('accepts exactly 500', async () => {
    const { status } = await write({ user_id: null, page: '/', body: 'y'.repeat(500) }, 'service');
    assert.equal(status, 201);
    assert.equal(await count('body=eq.' + 'y'.repeat(500)), 1);
  });
});
