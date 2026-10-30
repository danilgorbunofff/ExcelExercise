// Phase 4, item 6 — the payment path, proved against real Postgres.
//
// The route and the signature are JavaScript (`tests/stripe.test.js`); everything here is the part
// that cannot be proved anywhere else: what a verified event does to money rows, exactly once. The
// suite calls `apply_stripe_event()` as `service_role`, because that is the only role with the grant —
// which is itself the first assertion, made last.
//
//   npm run db:check

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { psql, purgeUsers, rest, resetFixtures, signIn, signUp } from './harness.mjs';

const DOMAIN = 'refund.example';

const EMAILS = {
  // Lifetime, then refunded.
  lifetime: 'lifetime@stripe.example',
  // subscription created → past_due → deleted, and a retried delivery after the deletion.
  subscription: 'subscription@stripe.example',
  // A renewal that lands after the window has already closed.
  renewal: 'renewal@stripe.example',
  // Two sessions from one purchase.
  devices: 'devices@stripe.example',
  // The events nobody acts on, and the role that may not act at all.
  edge: 'edge@stripe.example',
  // An institution grant that a Stripe refund must not touch.
  institution: 'staff@refund.example',
};

const sessions = {};
const EVENT = (name) => `evt_stripe_test_${name}`;

const now = () => Math.floor(Date.now() / 1000);
const SOON = now() + 30 * 24 * 3600;

const apply = (id, type, object) =>
  rest('rpc/apply_stripe_event', {
    as: 'service',
    method: 'POST',
    body: { p_id: id, p_type: type, p_object: object },
  });

const write = (path, as, body) => rest(path, { as, method: 'POST', body });
const count = (sql) => Number(psql(sql));

async function entitlements(session) {
  const { status, body } = await write('rpc/my_entitlements', session, {});
  assert.equal(status, 200, JSON.stringify(body));
  return body;
}

async function payments(session) {
  const { status, body } = await write('rpc/my_payments', session, {});
  assert.equal(status, 200, JSON.stringify(body));
  return body;
}

async function entitled(session) {
  const { status, body } = await write('rpc/is_entitled', session, { uid: session.id });
  assert.equal(status, 200, JSON.stringify(body));
  return body === true;
}

async function learner(email, key) {
  const signup = await signUp(email, 'password123');
  assert.equal(signup.status, 200, `${email}: ${JSON.stringify(signup.body)}`);
  sessions[key] = await signIn(email);
  return sessions[key];
}

const entitlementsFor = (id) =>
  count(`select count(*) from entitlements where user_id = '${id}'`);
const paymentsFor = (id) => count(`select count(*) from payments where user_id = '${id}'`);
const eventRow = (id) =>
  psql(
    `select coalesce(processed_at::text, '-') || '|' || type from stripe_events where id = '${id}'`,
  );

function cleanup() {
  purgeUsers(Object.values(EMAILS).map((e) => e.toLowerCase()));
  psql(`delete from institution_domains where domain = '${DOMAIN}';`);
  for (const table of ['entitlements', 'payments']) {
    psql(`delete from ${table} where user_id is null;`);
  }
}

before(async () => {
  resetFixtures();
  cleanup();
  psql(
    `insert into institution_domains (domain, label, group_id, seats) values ('${DOMAIN}', 'Stripe Test College', null, 5);`,
  );
  for (const [key, email] of Object.entries(EMAILS)) await learner(email, key);
});

after(cleanup);

describe('a lifetime purchase', () => {
  it('is granted by the checkout it completed, with no period to expire', async () => {
    const s = sessions.lifetime;
    const { status, body } = await apply(EVENT('checkout'), 'checkout.session.completed', {
      id: 'cs_test_lifetime',
      customer: 'cus_test_lifetime',
      payment_intent: 'pi_test_lifetime',
      amount_total: 19900,
      currency: 'usd',
      client_reference_id: s.id,
      metadata: { user_id: s.id, plan: 'lifetime' },
    });
    assert.equal(status, 200, JSON.stringify(body));
    assert.equal(body.applied, true, JSON.stringify(body));

    const rows = await entitlements(s);
    assert.equal(rows.length, 1, JSON.stringify(rows));
    assert.equal(rows[0].plan, 'lifetime');
    assert.equal(rows[0].status, 'active');
    assert.equal(rows[0].source, 'stripe');
    assert.equal(rows[0].current_period_end, null, 'a lifetime plan must not expire');
    assert.equal(await entitled(s), true);

    const money = await payments(s);
    assert.equal(money.length, 1, JSON.stringify(money));
    assert.equal(money[0].kind, 'lifetime');
    assert.equal(money[0].amount, 19900);
    assert.equal(money[0].refunded, false);
  });

  it('unlocks a second device that signed in before the purchase, without a re-login', async () => {
    // The same learner, signed in twice before anything was bought: two tokens, both stale by
    // definition, because a token is issued from what the database knew at that moment.
    const first = await signIn(EMAILS.devices);
    const second = await signIn(EMAILS.devices);
    assert.equal(await entitled(first), false, 'no purchase yet');
    assert.equal(await entitled(second), false, 'no purchase yet');

    await apply(EVENT('checkout.devices'), 'checkout.session.completed', {
      id: 'cs_test_devices',
      customer: 'cus_test_devices',
      payment_intent: 'pi_test_devices',
      amount_total: 19900,
      currency: 'usd',
      client_reference_id: first.id,
      metadata: { user_id: first.id, plan: 'lifetime' },
    });

    assert.equal(await entitled(first), true, 'the first device unlocks on its next request');
    assert.equal(await entitled(second), true, 'so does the second, with no refresh');
  });

  it('replays without a second entitlement or a second payment', async () => {
    const s = sessions.lifetime;
    const before = {
      entitlements: entitlementsFor(s.id),
      payments: paymentsFor(s.id),
    };

    // The same event id, exactly as Stripe retries it.
    const { status, body } = await apply(EVENT('checkout'), 'checkout.session.completed', {
      id: 'cs_test_lifetime',
      customer: 'cus_test_lifetime',
      payment_intent: 'pi_test_lifetime',
      amount_total: 19900,
      currency: 'usd',
      client_reference_id: s.id,
      metadata: { user_id: s.id, plan: 'lifetime' },
    });
    assert.equal(status, 200, JSON.stringify(body));
    assert.equal(body.applied, false);
    assert.equal(body.reason, 'duplicate');
    assert.equal(entitlementsFor(s.id), before.entitlements);
    assert.equal(paymentsFor(s.id), before.payments);
    assert.equal(await entitled(s), true, 'a duplicate must not take access away either');
  });

  it('is revoked by the refund of its charge, on the next request with the same token', async () => {
    const s = sessions.lifetime;
    const { status, body } = await apply(EVENT('refund'), 'charge.refunded', {
      id: 'ch_test_lifetime',
      payment_intent: 'pi_test_lifetime',
      amount_refunded: 19900,
    });
    assert.equal(status, 200, JSON.stringify(body));
    assert.equal(body.applied, true, JSON.stringify(body));

    const [payment] = await payments(s);
    assert.equal(payment.refunded, true, 'the money row must say it was refunded');

    const rows = await entitlements(s);
    assert.equal(rows[0].status, 'revoked');
    assert.equal(
      await entitled(s),
      false,
      'revocation must hold with a token issued before the refund',
    );
  });

  it('leaves an institution grant alone, because an employer refunded nothing', async () => {
    const s = sessions.institution;
    assert.equal(await entitled(s), true, 'the allowlist grants on sign-up');

    // The same learner also buys a lifetime plan, then that purchase is refunded.
    await apply(EVENT('checkout.institution'), 'checkout.session.completed', {
      id: 'cs_test_institution',
      customer: 'cus_test_institution',
      payment_intent: 'pi_test_institution',
      amount_total: 19900,
      currency: 'usd',
      client_reference_id: s.id,
      metadata: { user_id: s.id, plan: 'lifetime' },
    });
    const { body } = await apply(EVENT('refund.institution'), 'charge.refunded', {
      id: 'ch_test_institution',
      payment_intent: 'pi_test_institution',
    });
    assert.equal(body.applied, true, JSON.stringify(body));

    const rows = await entitlements(s);
    const byPlan = Object.fromEntries(rows.map((r) => [r.plan, r]));
    assert.equal(byPlan.lifetime.status, 'revoked');
    assert.equal(byPlan.institution.status, 'active', 'the institution grant survives');
    assert.equal(await entitled(s), true);
  });

  it('records a refund for money it never saw, without touching anyone', async () => {
    const { status, body } = await apply(EVENT('refund.unknown'), 'charge.refunded', {
      id: 'ch_test_unknown',
      payment_intent: 'pi_test_never_seen',
    });
    assert.equal(status, 200, JSON.stringify(body));
    assert.equal(body.applied, false);
    assert.equal(body.reason, 'unknown_charge');
    // Claimed all the same: a delivery that is remembered is a delivery Stripe stops retrying.
    assert.match(eventRow(EVENT('refund.unknown')), /^[0-9-]/);
  });
});

describe('a subscription', () => {
  it('grants while active, and is not access while past_due', async () => {
    const s = sessions.subscription;
    const { body } = await apply(EVENT('sub.created'), 'customer.subscription.created', {
      id: 'sub_test_1',
      customer: 'cus_test_sub',
      status: 'active',
      current_period_end: SOON,
      metadata: { user_id: s.id, plan: 'monthly' },
    });
    assert.equal(body.applied, true, JSON.stringify(body));

    let rows = await entitlements(s);
    assert.equal(rows[0].plan, 'monthly');
    assert.equal(rows[0].status, 'active');
    assert.ok(rows[0].current_period_end, 'the period end is what makes it expire');
    assert.equal(await entitled(s), true);

    // Stripe is still retrying the card: a grace window is not a paid month.
    const pastDue = await apply(EVENT('sub.past_due'), 'customer.subscription.updated', {
      id: 'sub_test_1',
      customer: 'cus_test_sub',
      status: 'past_due',
      current_period_end: SOON,
      metadata: { user_id: s.id, plan: 'monthly' },
    });
    assert.equal(pastDue.body.applied, true, JSON.stringify(pastDue.body));
    rows = await entitlements(s);
    assert.equal(rows[0].status, 'past_due');
    assert.equal(await entitled(s), false, 'past_due is not access');
  });

  it('is closed by its deletion, and a retried delivery of the earlier event cannot reopen it', async () => {
    const s = sessions.subscription;
    const deleted = await apply(EVENT('sub.deleted'), 'customer.subscription.deleted', {
      id: 'sub_test_1',
      customer: 'cus_test_sub',
      status: 'canceled',
      metadata: { user_id: s.id, plan: 'monthly' },
    });
    assert.equal(deleted.body.applied, true, JSON.stringify(deleted.body));

    const rows = await entitlements(s);
    assert.equal(rows[0].status, 'canceled');
    assert.equal(await entitled(s), false);

    // Stripe retries: the id is claimed, so the work does not happen a second time and access stays
    // closed. This is the whole reason the ledger is written before any row moves.
    const retried = await apply(EVENT('sub.past_due'), 'customer.subscription.updated', {
      id: 'sub_test_1',
      customer: 'cus_test_sub',
      status: 'active',
      current_period_end: SOON,
      metadata: { user_id: s.id, plan: 'monthly' },
    });
    assert.equal(retried.body.applied, false);
    assert.equal(retried.body.reason, 'duplicate');
    assert.equal(await entitled(s), false, 'a retried delivery must not reopen access');
  });

  it('is extended by a paid invoice, which is the difference between last month and next month', async () => {
    const s = sessions.renewal;
    const closed = now() - 24 * 3600;

    await apply(EVENT('renewal.created'), 'customer.subscription.created', {
      id: 'sub_test_2',
      customer: 'cus_test_renewal',
      status: 'canceled',
      current_period_end: closed,
      metadata: { user_id: s.id, plan: 'monthly' },
    });
    assert.equal(await entitled(s), false, 'the window closed yesterday');

    const renewalEnd = now() + 30 * 24 * 3600;
    const { body } = await apply(EVENT('renewal.paid'), 'invoice.paid', {
      id: 'in_test_2',
      customer: 'cus_test_renewal',
      subscription: 'sub_test_2',
      payment_intent: 'pi_test_renewal',
      amount_paid: 999,
      currency: 'usd',
      lines: { data: [{ period: { end: renewalEnd } }] },
    });
    assert.equal(body.applied, true, JSON.stringify(body));
    assert.equal(await entitled(s), true, 'a renewal re-opens the window it paid for');

    const rows = await entitlements(s);
    assert.equal(rows[0].status, 'active');
    assert.equal(new Date(rows[0].current_period_end).getTime(), renewalEnd * 1000);
    const money = await payments(s);
    assert.equal(money.length, 1, JSON.stringify(money));
    assert.equal(money[0].kind, 'subscription');
    assert.equal(money[0].amount, 999);
  });

  it('falls back to the customer id when an event names no learner', async () => {
    // A subscription created without `metadata.user_id` still resolves, because an earlier event
    // recorded which account that customer belongs to.
    const s = sessions.renewal;
    const { body, status } = await apply(EVENT('renewal.updated'), 'customer.subscription.updated', {
      id: 'sub_test_2',
      customer: 'cus_test_renewal',
      status: 'active',
      current_period_end: SOON,
    });
    assert.equal(status, 200, JSON.stringify(body));
    assert.equal(body.applied, true, JSON.stringify(body));
    assert.equal(body.user, s.id, 'resolved by customer, not by metadata');
  });
});

describe('events nobody acts on, and accounts nobody has', () => {
  it('is claimed and recorded as ignored, so Stripe stops retrying it', async () => {
    const { status, body } = await apply(EVENT('ignored'), 'customer.created', { id: 'cus_x' });
    assert.equal(status, 200, JSON.stringify(body));
    assert.equal(body.applied, false);
    assert.equal(body.reason, 'ignored');
    assert.equal(body.type, 'customer.created');
    assert.match(eventRow(EVENT('ignored')), /^[0-9-]/, 'an ignored event is still processed');
  });

  it('applies to nobody when the learner it names does not exist', async () => {
    const ghost = '00000000-0000-4000-8000-0000000000ff';
    const { status, body } = await apply(EVENT('ghost'), 'checkout.session.completed', {
      id: 'cs_test_ghost',
      customer: 'cus_test_ghost',
      payment_intent: 'pi_test_ghost',
      amount_total: 19900,
      currency: 'usd',
      metadata: { user_id: ghost, plan: 'lifetime' },
    });
    assert.equal(status, 200, JSON.stringify(body));
    assert.equal(body.applied, false);
    assert.equal(body.reason, 'no_user');
    assert.equal(count(`select count(*) from payments where stripe_payment_intent = 'pi_test_ghost'`), 0);
    assert.equal(count(`select count(*) from entitlements where user_id = '${ghost}'`), 0);
  });

  it('is refused as malformed before it is claimed', async () => {
    const { body } = await apply('', 'charge.refunded', {});
    assert.equal(body.applied, false);
    assert.equal(body.reason, 'malformed');
    const empty = await apply(EVENT('malformed'), 'checkout.session.completed', null);
    assert.equal(empty.body.reason, 'malformed');
    assert.equal(count(`select count(*) from stripe_events where id = '${EVENT('malformed')}'`), 0);
  });

  it('clamps an unknown plan name instead of writing a row the schema would reject', async () => {
    const s = sessions.edge;
    const { body } = await apply(EVENT('clamp'), 'checkout.session.completed', {
      id: 'cs_test_clamp',
      customer: 'cus_test_clamp',
      payment_intent: 'pi_test_clamp',
      amount_total: 999,
      currency: 'usd',
      metadata: { user_id: s.id, plan: 'free-forever' },
    });
    assert.equal(body.applied, true, JSON.stringify(body));
    assert.equal(body.plan, 'monthly');
    assert.equal(
      count(
        `select count(*) from entitlements where user_id = '${s.id}' and plan = 'monthly'`,
      ),
      0,
      'a subscription checkout grants nothing by itself; the subscription event does',
    );
  });
});

describe('who may say that someone paid', () => {
  it('is the service role only — a learner calling it is denied, not silently ignored', async () => {
    const { status } = await apply(EVENT('self-grant'), 'checkout.session.completed', {
      id: 'cs_test_self',
      payment_intent: 'pi_test_self',
      amount_total: 0,
      currency: 'usd',
      metadata: { user_id: sessions.edge.id, plan: 'lifetime' },
    });
    assert.equal(status, 200, 'the service role is the caller here');

    const self = await rest('rpc/apply_stripe_event', {
      as: sessions.edge,
      method: 'POST',
      body: {
        p_id: EVENT('self-grant.learner'),
        p_type: 'checkout.session.completed',
        p_object: { id: 'cs_test_learner', payment_intent: 'pi_test_learner', amount_total: 19900 },
      },
    });
    assert.equal(self.status, 403, `a learner must not reach the grant: ${JSON.stringify(self.body)}`);
    assert.equal(
      count(`select count(*) from stripe_events where id = '${EVENT('self-grant.learner')}'`),
      0,
    );
  });

  it('is not the anon role either', async () => {
    const anon = await rest('rpc/apply_stripe_event', {
      as: 'anon',
      method: 'POST',
      body: { p_id: EVENT('anon'), p_type: 'customer.created', p_object: { id: 'cus_x' } },
    });
    // Without a JWT PostgREST answers 401 rather than 403; either way the message is the same
    // `permission denied for function`, and the event was never claimed.
    assert.ok(anon.status === 401 || anon.status === 403, JSON.stringify(anon.body));
    assert.match(JSON.stringify(anon.body), /permission denied/);
    assert.equal(count(`select count(*) from stripe_events where id = '${EVENT('anon')}'`), 0);
  });

  it('keeps the money tables unreadable to the browser, even for its own learner', async () => {
    const rows = await rest('payments?select=amount', { as: sessions.lifetime });
    assert.equal(rows.status, 403, `payments must not be readable: ${JSON.stringify(rows.body)}`);
    const events = await rest('stripe_events?select=id', { as: sessions.lifetime });
    assert.equal(events.status, 403, JSON.stringify(events.body));
  });
});
