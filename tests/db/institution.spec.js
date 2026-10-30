// Phase 4, item 9 — the institutional allowlist, proved against real Postgres.
//
// Nothing about this feature can be proved in JavaScript: the grant is a trigger on `auth.users`, the
// authority is a table no client can read, and the seat count is a query over rows the browser never
// sees. So the suite signs real accounts up through GoTrue and then asks the questions a learner would
// ask, over HTTP, with that learner's own JWT.
//
//   npm run db:check

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { psql, purgeUsers, rest, signIn, signUp } from './harness.mjs';

const GROUP = '6f6f6f6f-0000-4000-8000-000000000010'; // "Northgate Academy", seeded

const DOMAINS = [
  { domain: 'northgate.example', label: 'Northgate Academy', group: GROUP, seats: 2 },
  { domain: 'solo.example', label: 'Solo College', group: null, seats: 1 },
  { domain: 'case.example', label: 'Case Institute', group: null, seats: 1 },
  { domain: 'late.example', label: 'Late Adopter College', group: null, seats: 1 },
];

const EMAILS = {
  // Two seats, three applicants: the third is the one that has to be refused.
  northgateA: 'inst-a@northgate.example',
  northgateB: 'inst-b@northgate.example',
  northgateC: 'inst-c@northgate.example',
  // One seat, and a deletion that has to give it back.
  soloA: 'solo-a@solo.example',
  soloB: 'solo-b@solo.example',
  soloC: 'solo-c@solo.example',
  // Not on the allowlist at all.
  outsider: 'learner@nowhere.example',
  // The suffix attack: an address whose domain merely ends with an allowlisted one.
  lookalike: 'learner@northgate.example.evil.example',
  // Case is not an identity: the allowlist row is lowercase, the address is not.
  mixed: 'Person@CASE.example',
};

let sessions = {};

const write = (path, as, body) => rest(path, { as, method: 'POST', body });
const num = (sql) => Number(psql(sql));

async function entitlements(session) {
  const { status, body } = await write('rpc/my_entitlements', session, {});
  assert.equal(status, 200, JSON.stringify(body));
  return body;
}

async function entitled(session) {
  const { status, body } = await write('rpc/is_entitled', session, { uid: session.id });
  assert.equal(status, 200, JSON.stringify(body));
  return body === true;
}

function cleanup() {
  // `auth.users.email` is case-preserving, so the purge has to lowercase: one probe address is
  // deliberately mixed-case to prove the match is not.
  purgeUsers(Object.values(EMAILS).map((e) => e.toLowerCase()));
  // Purging an identity cascades the profile and nulls the money rows (0006), so the allowlist rows go
  // last and take their orphaned grants with them; nothing else in the suite writes this column.
  psql(`delete from institution_domains where domain in (${DOMAINS.map((d) => `'${d.domain}'`).join(', ')});`);
  psql('delete from entitlements where institution_domain is not null and user_id is null;');
}

before(() => {
  cleanup();
  for (const row of DOMAINS) {
    psql(
      `insert into institution_domains (domain, label, group_id, seats) values ('${row.domain}', '${row.label}', ${row.group ? `'${row.group}'` : 'null'}, ${row.seats});`,
    );
  }
});

after(cleanup);

describe('a new account at an allowlisted domain', () => {
  it('is granted an institution entitlement, with no period to expire', async () => {
    const signup = await signUp(EMAILS.northgateA, 'password123');
    assert.equal(signup.status, 200, JSON.stringify(signup.body));
    sessions.a = await signIn(EMAILS.northgateA);

    const rows = await entitlements(sessions.a);
    assert.equal(rows.length, 1, `expected exactly one entitlement: ${JSON.stringify(rows)}`);
    assert.equal(rows[0].plan, 'institution');
    assert.equal(rows[0].status, 'active');
    assert.equal(rows[0].source, 'institution');
    assert.equal(rows[0].current_period_end, null, 'an institution grant must not expire');
    assert.equal(rows[0].institution_domain, 'northgate.example');
    assert.equal(await entitled(sessions.a), true);
  });

  it('joins the allowlist row’s group, because that is where the cohort lives', async () => {
    assert.equal(
      psql(`select coalesce(group_id::text, '-') from profiles where id = '${sessions.a.id}'`),
      GROUP,
    );
  });

  it('matches case-insensitively, because the domain is an identity and citext knows it', async () => {
    const signup = await signUp(EMAILS.mixed, 'password123');
    assert.equal(signup.status, 200, JSON.stringify(signup.body));
    sessions.mixed = await signIn(EMAILS.mixed);
    const rows = await entitlements(sessions.mixed);
    assert.equal(rows.length, 1, JSON.stringify(rows));
    assert.equal(rows[0].institution_domain, 'case.example');
  });
});

describe('an address the allowlist does not cover', () => {
  it('is refused when the domain is absent, and signed up all the same', async () => {
    const signup = await signUp(EMAILS.outsider, 'password123');
    assert.equal(signup.status, 200, 'a missing allowlist row must not break sign-up');
    sessions.outsider = await signIn(EMAILS.outsider);
    assert.deepEqual(await entitlements(sessions.outsider), []);
    assert.equal(await entitled(sessions.outsider), false);
  });

  it('is refused when the domain merely ends with an allowlisted one', async () => {
    const signup = await signUp(EMAILS.lookalike, 'password123');
    assert.equal(signup.status, 200, JSON.stringify(signup.body));
    sessions.lookalike = await signIn(EMAILS.lookalike);
    assert.deepEqual(await entitlements(sessions.lookalike), [], 'a suffix match granted access');
    assert.equal(await entitled(sessions.lookalike), false);
  });
});

describe('the seat limit', () => {
  it('grants the second account and refuses the third at a two-seat institution', async () => {
    const second = await signUp(EMAILS.northgateB, 'password123');
    assert.equal(second.status, 200, JSON.stringify(second.body));
    sessions.b = await signIn(EMAILS.northgateB);
    assert.equal((await entitlements(sessions.b)).length, 1, 'the second seat was not granted');

    const third = await signUp(EMAILS.northgateC, 'password123');
    assert.equal(third.status, 200, 'a full institution must not break sign-up');
    sessions.c = await signIn(EMAILS.northgateC);
    assert.deepEqual(await entitlements(sessions.c), [], 'a full institution granted a seat anyway');
    assert.equal(await entitled(sessions.c), false, 'the refused account is entitled');
  });

  it('does not revoke anyone when it refuses, because the refusal is only a refusal', async () => {
    assert.equal(await entitled(sessions.a), true, 'the first seat lost its grant');
    assert.equal(await entitled(sessions.b), true, 'the second seat lost its grant');
  });

  it('frees the seat a deleted account was holding', async () => {
    const first = await signUp(EMAILS.soloA, 'password123');
    assert.equal(first.status, 200, JSON.stringify(first.body));
    sessions.soloA = await signIn(EMAILS.soloA);
    assert.equal(await entitled(sessions.soloA), true, 'the only seat was not granted');

    const refused = await signUp(EMAILS.soloB, 'password123');
    assert.equal(refused.status, 200, JSON.stringify(refused.body));
    sessions.soloB = await signIn(EMAILS.soloB);
    assert.equal(await entitled(sessions.soloB), false, 'a one-seat institution granted two');

    // The soft deletion (0006) is what marks the seat free; the identity purge is a later step.
    const erased = await write('rpc/request_account_deletion', sessions.soloA, {});
    assert.equal(erased.status, 200, JSON.stringify(erased.body));

    const late = await signUp(EMAILS.soloC, 'password123');
    assert.equal(late.status, 200, JSON.stringify(late.body));
    sessions.soloC = await signIn(EMAILS.soloC);
    assert.equal(await entitled(sessions.soloC), true, 'a deleted account kept its seat');
  });
});

describe('the allowlist is not readable by a client', () => {
  it('answers a signed-in learner with a permission error, not with an empty list', async () => {
    // An empty list would be indistinguishable from "your domain is not covered", which is exactly the
    // thing a learner could otherwise enumerate.
    const { status } = await rest('institution_domains?select=domain', { as: sessions.a });
    assert.ok(status >= 400, `a learner read the allowlist: ${status}`);

    const anon = await rest('institution_domains?select=domain', { as: 'anon' });
    assert.ok(anon.status >= 400, `an anonymous caller read the allowlist: ${anon.status}`);
  });

  it('refuses a learner who tries to add their own domain', async () => {
    const { status } = await write(
      'institution_domains',
      sessions.outsider,
      { domain: 'nowhere.example', label: 'Self-serve' },
    );
    assert.ok(status >= 400, `a learner wrote the allowlist: ${status}`);
    assert.equal(num("select count(*) from institution_domains where domain = 'nowhere.example'"), 0);
  });

  it('refuses a learner who tries to grant themselves the entitlement directly', async () => {
    const { status } = await write('entitlements', sessions.outsider, {
      user_id: sessions.outsider.id,
      plan: 'institution',
      status: 'active',
      source: 'institution',
    });
    assert.ok(status >= 400, `a learner wrote a money row: ${status}`);
  });

  it('refuses a learner who tries to call the grant function', async () => {
    const { status } = await write('rpc/grant_institution_access', sessions.lookalike, {
      p_user: sessions.lookalike.id,
      p_email: 'learner@northgate.example',
    });
    assert.ok(status >= 400, `a learner called the grant function: ${status}`);
    assert.deepEqual(await entitlements(sessions.lookalike), []);
  });

  it('lets the service role do all of it, which is how an operator backfills', async () => {
    const rows = await rest('institution_domains?select=domain&order=domain', { as: 'service' });
    assert.equal(rows.status, 200, JSON.stringify(rows.body));
    assert.deepEqual(
      rows.body.map((row) => row.domain),
      ['case.example', 'late.example', 'northgate.example', 'solo.example'],
    );

    // The same function the trigger calls, in the same shape: an operator granting an existing account
    // whose domain was added after they signed up.
    const noop = await write('rpc/grant_institution_access', 'service', {
      p_user: sessions.outsider.id,
      p_email: EMAILS.outsider,
    });
    assert.equal(noop.status, 200, JSON.stringify(noop.body));
    // `nowhere.example` is not on the allowlist, so the honest answer is "nothing granted" — and the
    // account is untouched, which is what makes a bulk backfill safe to re-run.
    assert.equal(noop.body, null, JSON.stringify(noop.body));
    assert.deepEqual(await entitlements(sessions.outsider), []);

    const backfill = await write('rpc/grant_institution_access', 'service', {
      p_user: sessions.outsider.id,
      p_email: 'learner@late.example',
    });
    assert.equal(backfill.status, 200, JSON.stringify(backfill.body));
    assert.equal(backfill.body, 'late.example', JSON.stringify(backfill.body));
    const granted = await entitlements(sessions.outsider);
    assert.equal(granted.length, 1, JSON.stringify(granted));
    assert.equal(granted[0].institution_domain, 'late.example');
  });
});
