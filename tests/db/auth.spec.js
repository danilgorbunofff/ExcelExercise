// Phase 4 work item 2 — the auth flows, proved against the real auth server.
//
// What the review cares about here is not that GoTrue works (it is a dependency) but that *this
// project's* half of the flow holds: every sign-up produces exactly one profile row, usernames are
// unique and derived, and the emailed links are actually delivered by the local mail catcher.
//
//   npm run db:check

import { before, after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { gotrue, mailbox, message, psql, purgeUsers, rest, signIn, signUp } from './harness.mjs';

const LOCAL = 'probe-local@example.test';
const SECOND = 'probe-local@example.org';
const SHORT = 'ab@example.test';
const KNOWN = 'alice@example.com';
const UNKNOWN = 'nobody-at-all@example.test';
// Its own address: GoTrue enforces `max_frequency` per email, so reusing KNOWN would make this test
// depend on how long the previous one took rather than on the flow.
const MAGIC = 'probe-magic@example.test';
const ALL = [LOCAL, SECOND, SHORT, UNKNOWN, MAGIC];

let session;

before(async () => {
  purgeUsers(ALL);
  const created = await signUp(LOCAL, 'password123', { display_name: 'Probe Local' });
  assert.equal(created.status, 200, `sign-up failed: ${created.status} ${JSON.stringify(created.body)}`);
  assert.ok(created.body.access_token, 'local stack confirms emails, so sign-up returns a session');
  session = { token: created.body.access_token, id: created.body.user.id, email: LOCAL, refresh: created.body.refresh_token };
  await signUp(SECOND, 'password123');
  await signUp(SHORT, 'password123');
});

after(() => {
  purgeUsers(ALL);
});

describe('sign-up provisions a profile', () => {
  it('creates exactly one profile row per account', () => {
    assert.equal(psql(`select count(*) from profiles where id = '${session.id}'`), '1');
  });

  it('derives the username from the email local part', () => {
    assert.equal(psql(`select username from profiles where id = '${session.id}'`), 'probe-local');
  });

  it('keeps the display name from the sign-up metadata', () => {
    assert.equal(psql(`select display_name from profiles where id = '${session.id}'`), 'Probe Local');
  });

  it('suffixes a colliding local part instead of failing the sign-up', async () => {
    const { body } = await gotrue('user', { method: 'GET', token: (await signIn(SECOND)).token });
    const username = psql(`select username from profiles where id = '${body.id}'`);
    assert.equal(username, 'probe-local1', 'the second account keeps the base name with a counter');
  });

  it('gives an unusable local part a generated handle', () => {
    const username = psql(
      `select p.username from profiles p join auth.users u on u.id = p.id where u.email = '${SHORT}'`,
    ).trim();
    // `ab` is under the three-character floor, so the trigger falls back to `learner_` + id prefix.
    assert.match(username, /^learner_[0-9a-f]{6}$/);
  });

  it('makes the username case-insensitive', () => {
    const type = psql(
      "select data_type || ':' || udt_name from information_schema.columns where table_name = 'profiles' and column_name = 'username'",
    );
    assert.equal(type, 'USER-DEFINED:citext', 'citext is what makes Alice and alice the same handle');
  });

  it('is readable by its owner with the fresh JWT', async () => {
    const { status, body } = await rest(`profiles?id=eq.${session.id}&select=username,display_name`, { as: session });
    assert.equal(status, 200);
    assert.deepEqual(body, [{ username: 'probe-local', display_name: 'Probe Local' }]);
  });

  it('cannot be forged by the owner (no insert grant)', async () => {
    const { status } = await rest('profiles', {
      as: session,
      method: 'POST',
      body: { id: session.id, username: 'sneaky' },
      prefer: 'return=minimal',
    });
    assert.equal(status, 403, 'a learner may edit their row but never create one');
  });

  it('is the identity the token reports', async () => {
    const { status, body } = await gotrue('user', { method: 'GET', token: session.token });
    assert.equal(status, 200);
    assert.equal(body.email, LOCAL);
  });
});

describe('sessions', () => {
  it('signs in with the password', async () => {
    const fresh = await signIn(LOCAL);
    assert.equal(fresh.id, session.id);
    assert.ok(fresh.token);
  });

  it('refuses a wrong password', async () => {
    const { status } = await gotrue('token?grant_type=password', {
      body: { email: LOCAL, password: 'not-the-password' },
    });
    assert.equal(status, 400);
  });

  it('refuses an unknown address', async () => {
    const { status } = await gotrue('token?grant_type=password', {
      body: { email: UNKNOWN, password: 'password123' },
    });
    assert.equal(status, 400);
  });

  it('refreshes an access token from a refresh token', async () => {
    const { status, body } = await gotrue('token?grant_type=refresh_token', {
      body: { refresh_token: session.refresh },
    });
    assert.equal(status, 200, JSON.stringify(body));
    assert.ok(body.access_token);
    session.refresh = body.refresh_token;
  });

  it('stops honouring the refresh token after sign-out', async () => {
    await gotrue('logout', { token: session.token });
    const { status } = await gotrue('token?grant_type=refresh_token', {
      body: { refresh_token: session.refresh },
    });
    assert.equal(status, 400, 'a signed-out session must not be refreshable');
  });
});

describe('emailed links', () => {
  it('sends a recovery link to a known address', async () => {
    const { status } = await gotrue('recover', { body: { email: KNOWN } });
    assert.equal(status, 200);
    const [mail] = await mailbox(KNOWN);
    assert.ok(mail, `mailpit has no message for ${KNOWN}`);
    session.recoveryMail = mail.id;
  });

  it('answers the same way for an address with no account', async () => {
    const { status } = await gotrue('recover', { body: { email: UNKNOWN } });
    assert.equal(status, 200, 'a different answer here would let anyone enumerate accounts');
  });

  it('puts a verify link in the recovery email', async () => {
    const mail = await message(session.recoveryMail);
    const text = `${mail.HTML ?? ''}${mail.Text ?? ''}`;
    assert.match(text, /\/auth\/v1\/verify\?/, 'the link the reset flow depends on is in the email');
    assert.match(text, /type=recovery/);
  });

  it('sends a magic sign-in link', async () => {
    const { status } = await gotrue('magiclink', { body: { email: MAGIC, create_user: true } });
    assert.equal(status, 200);
    const mails = await mailbox(MAGIC);
    const latest = await message(mails[0].id);
    assert.match(`${latest.HTML ?? ''}${latest.Text ?? ''}`, /type=magiclink/);
  });
});
