// The certificate, proved against real Postgres.
//
// `tests/certificate.test.js` proves the credential alphabet and the eligibility arithmetic; this file
// proves the four things only a database can:
//
//   * eligibility is re-counted inside `issue_certificate`, so nobody can mint a certificate by calling
//     the RPC directly;
//   * issuing twice returns the same credential, and the table holds one row;
//   * a certificate's holder, id, name, date and count are write-once — including against the
//     service-role client that issued it — and revocation cannot be undone;
//   * a stranger with no session can verify an id and gets six fields, while another learner reading the
//     table gets nothing.
//
//   npm run db:check

import { after, before, describe, it } from 'node:test';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { psql, purgeUsers, rest, signIn, signUp, stack } from './harness.mjs';

const REQUIRED = ['01-sum-basics', '02-references', '03-nested-if'];
/** The four probe learners, filled in `before`. */
let users = {};
const CREDENTIAL = '7K3M9QXZ2HV0RDNC';

const rpc = (name, args, as = 'service') => rest(`rpc/${name}`, { as, method: 'POST', body: args });

async function issue(args = {}, as = 'service') {
  return rpc(
    'issue_certificate',
    {
      p_user: args.user,
      p_name: args.name ?? 'Ada Lovelace',
      p_credential: args.credential ?? CREDENTIAL,
      p_required: args.required ?? REQUIRED,
      p_days: args.days === undefined ? 6 : args.days,
    },
    as,
  );
}

async function verifyAs(credential, as = 'anon') {
  return rpc('verify_certificate', { p_credential: credential }, as);
}

const of = (body) => (Array.isArray(body) ? body[0] : body);

before(async () => {
  await wipe();
  // Four learners through GoTrue rather than through psql: the RLS cases need a real session, and a
  // password sign-in needs the identity row that only the auth server writes. The profile row each
  // one produces is the sign-up trigger's (0003), which is the account these tests certify.
  for (let n = 1; n <= 4; n += 1) {
    const email = `cert${n}@example.com`;
    const { status, body } = await signUp(email);
    assert.ok(status === 200 || status === 201, `sign-up ${email}: ${status} ${JSON.stringify(body)}`);
    users[n] = { id: body.user.id, email };
  }

  // `cert4` is the admin the revocation tests act as. The role lives on the profile, which is what
  // `revoke_certificate` reads.
  psql(`update profiles set role = 'admin' where id = '${users[4].id}';`);
});

after(async () => {
  await wipe();
});

async function wipe() {
  purgeUsers(Array.from({ length: 5 }, (_unused, at) => `cert${at + 1}@example.com`));
}

/** Finish `lessons` for a learner, with one completion a day apart, without going through RLS. */
function finish(userId, lessons = REQUIRED, track = 'excel') {
  const values = lessons
    .map((lesson, at) => `('${userId}', '${lesson}', '${track}', 'complete', now() - interval '${lessons.length - at} days')`)
    .join(',\n      ');
  psql(`insert into lesson_progress (user_id, lesson_id, track, status, completed_at)
        values ${values}
        on conflict (user_id, lesson_id) do update set track = excluded.track, status = 'complete',
          completed_at = excluded.completed_at;`);
}

describe('eligibility is decided by the database', () => {
  it('refuses a learner who has finished nothing', async () => {
    const { status, body } = await issue({ user: users[1].id });
    assert.equal(status, 400, JSON.stringify(body));
    assert.equal(body.code, '23514');
    assert.match(body.message, /not eligible: 0 of 3/);
  });

  it('refuses a learner one lesson short, and says how many', async () => {
    const userId = users[1].id;
    finish(userId, REQUIRED.slice(0, 2));
    const { status, body } = await issue({ user: userId });
    assert.equal(status, 400, JSON.stringify(body));
    assert.match(body.message, /not eligible: 2 of 3/);
  });

  it('does not count a lesson that is only in progress', async () => {
    const userId = users[1].id;
    psql(`insert into lesson_progress (user_id, lesson_id, track, status)
          values ('${userId}', '${REQUIRED[2]}', 'excel', 'in_progress')
          on conflict (user_id, lesson_id) do update set status = 'in_progress';`);
    const { status, body } = await issue({ user: userId });
    assert.equal(status, 400, JSON.stringify(body));
    assert.match(body.message, /not eligible: 2 of 3/);
  });

  it('does not count a lesson finished on another track', async () => {
    const userId = users[1].id;
    // The row exists and says complete — but it says complete for the SQL track, and a certificate covers
    // the Excel catalog. This is the difference between counting rows and counting the requirement.
    psql(`update lesson_progress set status = 'complete', track = 'sql'
           where user_id = '${userId}' and lesson_id = '${REQUIRED[2]}';`);
    const { status, body } = await issue({ user: userId });
    assert.equal(status, 400, JSON.stringify(body));
    assert.match(body.message, /not eligible: 2 of 3/);

    psql(`update lesson_progress set track = 'excel' where user_id = '${userId}' and lesson_id = '${REQUIRED[2]}';`);
  });

  it('refuses when the caller names no lessons at all, rather than passing vacuously', async () => {
    const { status, body } = await issue({ user: users[1].id, required: [] });
    assert.equal(status, 400, JSON.stringify(body));
    assert.match(body.message, /no required lessons/);
  });

  it('issues once the track is finished', async () => {
    const userId = users[1].id;
    const { status, body } = await issue({ user: userId });
    assert.equal(status, 200, JSON.stringify(body));
    const row = of(body);
    assert.equal(row.credential_id, CREDENTIAL);
    assert.equal(row.display_name, 'Ada Lovelace');
    assert.equal(row.lesson_count, 3);
    assert.equal(row.days_taken, 6);
    assert.equal(row.revoked_at, null);
  });
});

describe('one certificate per learner', () => {
  it('returns the existing certificate instead of issuing a second', async () => {
    const userId = users[1].id;
    const { status, body } = await issue({ user: userId, credential: 'ZZZZZZZZZZZZZZZZ', name: 'Someone Else' });
    assert.equal(status, 200, JSON.stringify(body));
    const row = of(body);
    assert.equal(row.credential_id, CREDENTIAL, 'the second call must not mint a new id');
    assert.equal(row.display_name, 'Ada Lovelace', 'and must not rename the holder');

    const count = psql(`select count(*) from certificates where user_id = '${userId}';`);
    assert.equal(count, '1');
  });

  it('refuses a credential id that is not sixteen Crockford symbols', async () => {
    const userId = users[2].id;
    finish(userId);
    const { status, body } = await issue({ user: userId, credential: 'SHORT' });
    assert.equal(status, 400, JSON.stringify(body));
    assert.equal(body.code, '23514');
  });

  it('refuses a one-character name', async () => {
    const userId = users[2].id;
    const { status, body } = await issue({ user: userId, credential: 'AAAAAAAAAAAAAAAA', name: 'A' });
    assert.equal(status, 400, JSON.stringify(body));
    assert.equal(body.code, '23514');
  });

  it('accepts a name at the limit and trims what it stores', async () => {
    const userId = users[2].id;
    const { status, body } = await issue({ user: userId, credential: 'AAAAAAAAAAAAAAAA', name: `  ${'a'.repeat(60)}  ` });
    assert.equal(status, 200, JSON.stringify(body));
    const row = of(body);
    assert.equal(row.display_name.length, 60);
    assert.equal(row.display_name, 'a'.repeat(60));
  });

  it('is case-insensitive on the credential it is handed', async () => {
    const userId = users[3].id;
    finish(userId);
    const { status, body } = await issue({ user: userId, credential: 'bbbbbbbbbbbbbbbb' });
    assert.equal(status, 200, JSON.stringify(body));
    assert.equal(of(body).credential_id, 'BBBBBBBBBBBBBBBB');
  });
});

describe('the certificate is write-once', () => {
  // Run as the service role through PostgREST, which is the strongest writer the app has: if the trigger
  // did not hold, this is the caller that would rewrite a name.
  const patch = (userId, values) =>
    rest(`certificates?user_id=eq.${userId}`, { as: 'service', method: 'PATCH', body: values, prefer: 'return=representation' });

  it('refuses to change the name', async () => {
    const { status, body } = await patch(users[1].id, { display_name: 'Mallory' });
    assert.equal(status, 400, JSON.stringify(body));
    assert.equal(body.code, '23001');
  });

  it('refuses to change the credential id', async () => {
    const { status, body } = await patch(users[1].id, { credential_id: 'CCCCCCCCCCCCCCCC' });
    assert.equal(status, 400, JSON.stringify(body));
    assert.equal(body.code, '23001');
  });

  it('refuses to change the date, the count, or the holder', async () => {
    const userId = users[1].id;
    for (const values of [{ issued_at: '2020-01-01T00:00:00.000Z' }, { lesson_count: 1 }, { days_taken: null }, { user_id: users[2].id }]) {
      const { status, body } = await patch(userId, values);
      assert.equal(status, 400, `${JSON.stringify(values)} was accepted`);
      assert.equal(body.code, '23001');
    }
  });

  it('allows the columns revocation and the PDF render need', async () => {
    const { status, body } = await patch(users[1].id, { pdf_path: 'certificates/ada.pdf' });
    assert.equal(status, 200, JSON.stringify(body));
    assert.equal(of(body).pdf_path, 'certificates/ada.pdf');
    // Put it back so a later reader is not confused by a PDF that does not exist.
    await patch(users[1].id, { pdf_path: null });
  });
});

describe('who can read a certificate', () => {
  it('shows a learner their own row and nobody else\'s', async () => {
    const alice = await signIn(users[1].email);
    const own = await rest('certificates?select=credential_id,display_name', { as: alice });
    assert.equal(own.status, 200, JSON.stringify(own.body));
    assert.deepEqual(own.body.map((row) => row.credential_id), [CREDENTIAL]);

    const bob = await signIn(users[2].email);
    const others = await rest(`certificates?user_id=eq.${alice.id}`, { as: bob });
    assert.equal(others.status, 200);
    assert.deepEqual(others.body, [], 'RLS must hide another learner\'s certificate');
  });

  it('shows an anonymous reader nothing through the table', async () => {
    const { status, body } = await rest('certificates?select=credential_id', { as: 'anon' });
    assert.equal(status, 200);
    assert.deepEqual(body, []);
  });

  it('refuses every write from a browser token', async () => {
    const alice = await signIn(users[1].email);
    for (const method of ['POST', 'PATCH', 'DELETE']) {
      const { status } = await rest(method === 'POST' ? 'certificates' : `certificates?user_id=eq.${alice.id}`, {
        as: alice,
        method,
        body: method === 'POST'
          ? { user_id: alice.id, credential_id: 'DDDDDDDDDDDDDDDD', display_name: 'Ada', lesson_count: 3 }
          : { display_name: 'Mallory' },
        prefer: 'return=minimal',
      });
      assert.ok(status >= 400, `${method} was allowed (${status})`);
    }
  });
});

describe('verifying without an account', () => {
  it('returns exactly the six fields the page shows', async () => {
    const { status, body } = await verifyAs(CREDENTIAL);
    assert.equal(status, 200, JSON.stringify(body));
    const row = of(body);
    assert.deepEqual(Object.keys(row).sort(), ['credential_id', 'display_name', 'issued_at', 'lesson_count', 'revoked_at', 'status']);
    assert.equal(row.status, 'valid');
    assert.equal(row.lesson_count, 3);
  });

  it('accepts the id as typed: lower case, padded, both', async () => {
    for (const attempt of [CREDENTIAL.toLowerCase(), `  ${CREDENTIAL}  `, `${CREDENTIAL.toLowerCase()} `]) {
      const { status, body } = await verifyAs(attempt);
      assert.equal(status, 200, JSON.stringify(body));
      assert.equal(of(body).credential_id, CREDENTIAL);
    }
  });

  it('returns nothing for an unknown id, an empty one, or null', async () => {
    for (const attempt of ['ZZZZZZZZZZZZZZZZ', '', '   ', null]) {
      const { status, body } = await verifyAs(attempt);
      assert.equal(status, 200, `${attempt}: ${JSON.stringify(body)}`);
      assert.deepEqual(body, []);
    }
  });

  it('cannot be used to enumerate: the function only answers about one id', async () => {
    const { status, body } = await rest('certificates?select=user_id', { as: 'anon' });
    assert.equal(status, 200);
    assert.deepEqual(body, []);
  });
});

describe('revocation', () => {
  const revoke = (credential, actor, reason = 'issued in error') =>
    rpc('revoke_certificate', { p_credential: credential, p_reason: reason, p_actor: actor });

  it('refuses a caller whose profile is not an admin or owner', async () => {
    const { status, body } = await revoke(CREDENTIAL, users[1].id);
    assert.equal(status, 403, JSON.stringify(body));
    assert.equal(body.code, '42501');
  });

  it('refuses an actor who does not exist', async () => {
    const { status, body } = await revoke(CREDENTIAL, '00000000-0000-0000-0000-000000000000');
    assert.equal(status, 403, JSON.stringify(body));
  });

  it('revokes once, as an admin, and the record still resolves', async () => {
    const { status, body } = await revoke(CREDENTIAL, users[4].id);
    assert.equal(status, 200, JSON.stringify(body));
    assert.notEqual(of(body).revoked_at, null);
    assert.equal(of(body).revoked_reason, 'issued in error');
    assert.equal(of(body).revoked_by, users[4].id);

    const verified = await verifyAs(CREDENTIAL);
    assert.equal(verified.status, 200);
    const row = of(verified.body);
    assert.equal(row.status, 'revoked');
    assert.notEqual(row.revoked_at, null);
    assert.equal(row.display_name, 'Ada Lovelace', 'a revoked certificate still names its holder');
  });

  it('refuses a second revocation, because there is nothing live to revoke', async () => {
    const { status, body } = await revoke(CREDENTIAL, users[4].id);
    assert.ok(status >= 400, JSON.stringify(body));
    assert.equal(body.code, 'P0002');
  });

  it('cannot be undone, not even by the service role', async () => {
    const { status, body } = await rest(`certificates?user_id=eq.${users[1].id}`, {
      as: 'service',
      method: 'PATCH',
      body: { revoked_at: null },
      prefer: 'return=representation',
    });
    assert.equal(status, 400, JSON.stringify(body));
    assert.equal(body.code, '23001');
  });

  it('is the only thing a revocation changes — the holder can still read their row', async () => {
    const alice = await signIn(users[1].email);
    const own = await rest('certificates?select=credential_id,revoked_at', { as: alice });
    assert.equal(own.status, 200);
    assert.equal(own.body.length, 1);
    assert.notEqual(own.body[0].revoked_at, null);
  });
});

// The operator script is the only way to revoke a certificate short of typing SQL, so it is run here
// for real — as a child process against this stack — rather than mocked. What this proves that the
// RPC tests above cannot: the script's own refusals (bad id, non-admin actor, already revoked) happen
// before the database is asked, and the happy path prints the row it changed.
describe('the revoke operator script', () => {
  const SECOND = 'AB2CD3EF4GH5JK6M';
  // A fifth learner, because the four above are already certified by the time this suite runs and a
  // certificate is one-per-account: `cert2` holds AAAAAAAAAAAAAAAA, `cert3` BBBBBBBBBBBBBBBB.
  let holder = null;
  const run = (...args) =>
    spawnSync(process.execPath, ['scripts/certificate-revoke.mjs', ...args], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        NEXT_PUBLIC_SUPABASE_URL: stack().api,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: stack().anon,
        SUPABASE_SERVICE_ROLE_KEY: stack().service,
      },
    });

  before(async () => {
    const { status, body } = await signUp('cert5@example.com');
    assert.ok(status === 200 || status === 201, `sign-up cert5: ${status} ${JSON.stringify(body)}`);
    holder = body.user.id;
    await psql(`insert into lesson_progress (user_id, lesson_id, track, status, completed_at)
                values ${REQUIRED.map((lesson) => `('${holder}', '${lesson}', 'excel', 'complete', now())`).join(', ')}
                on conflict (user_id, lesson_id) do nothing;`);
    const issued = await issue({ user: holder, name: 'Grace Hopper', credential: SECOND });
    assert.equal(issued.status, 200, JSON.stringify(issued.body));
    assert.equal(of(issued.body).credential_id, SECOND, 'the fixture must hold the credential this suite revokes');
  });

  it('refuses a credential that is not shaped like one, without touching the database', () => {
    const result = run('NOPE', '--actor', users[4].id);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /not a credential id/);
  });

  it('refuses an actor whose account is not an admin', () => {
    const result = run(SECOND, '--actor', users[1].id);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /not an admin or owner/);
  });

  it('revokes, prints what changed, and leaves the record resolvable', async () => {
    const result = run(SECOND, '--actor', users[4].id, '--reason', 'duplicate order');
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, new RegExp(`revoked ${SECOND}`));
    assert.match(result.stdout, /Grace Hopper/);
    assert.match(result.stdout, /duplicate order/);

    const verified = await verifyAs(SECOND);
    assert.equal(verified.status, 200);
    assert.equal(of(verified.body).status, 'revoked');
  });

  it('says it is already revoked rather than surfacing a SQLSTATE', () => {
    const result = run(SECOND, '--actor', users[4].id);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /already revoked/);
    assert.doesNotMatch(result.stderr, /P0002|no_data_found/);
  });
});
