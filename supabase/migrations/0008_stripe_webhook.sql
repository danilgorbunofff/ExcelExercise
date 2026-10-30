-- Phase 4 work item 6: the webhook, which is the only thing that believes a purchase happened.
--
-- The browser never tells this site that someone paid. Stripe does, over HTTPS, signed — and the
-- handler that receives it has exactly one job: turn one verified event into the rows that make
-- `is_entitled()` true, exactly once.
--
-- "Exactly once" is the whole design. Stripe retries, delivers out of order, and can deliver the same
-- event twice; `checkout.session.completed` arriving twice must not produce two entitlements, and a
-- retried delivery of an *old* `customer.subscription.updated` must not re-open access that a later
-- `deleted` closed. So the event id is claimed first, in `stripe_events`, and a duplicate primary-key
-- insert short-circuits the work before any row moves. Everything below happens in one transaction
-- with that claim, which is why it lives in one function rather than in the route.
--
-- Deliberately absent: any network call. Signature verification happens in the route
-- (`lib/stripe.js`), because HMAC comparison belongs next to the raw body it was computed over; by the
-- time this function is called the event is already trusted, and its only question is "does the
-- database already know this id".
--
-- Deliberately absent: `stripe_events` cleanup. A row is 40 bytes and it is the record that a delivery
-- was applied; deleting the ledger to save nothing would be the one mistake that costs access.

-- Which price the learner pays, and what the row says afterwards. The mapping lives here so the
-- webhook cannot invent a plan name that `entitlements.plan` would reject.
create or replace function stripe_plan_for(p_object jsonb, p_fallback text default 'monthly')
returns text
language sql immutable set search_path = public as $$
  select case
    when coalesce(p_object #>> '{metadata,plan}', p_fallback) in ('monthly', 'annual', 'lifetime')
      then coalesce(p_object #>> '{metadata,plan}', p_fallback)
    else 'monthly'
  end;
$$;

comment on function stripe_plan_for(jsonb, text) is
  'The plan a Stripe object names in metadata.plan, clamped to the values entitlements.plan accepts.';

-- Stripe object ids are strings; a missing key arrives as SQL null, and `''::uuid` would raise instead
-- of answering null. One helper, because every branch below needs the same patience.
create or replace function stripe_id(p_value text)
returns uuid
language plpgsql immutable set search_path = public as $$
begin
  if p_value is null or p_value = '' then
    return null;
  end if;
  return p_value::uuid;
exception
  when invalid_text_representation then
    return null;
end;
$$;

/**
 * Apply one verified Stripe event.
 *
 * @returns jsonb `{ applied, reason, ... }`. `applied: false` is not an error: `duplicate` means the
 *   ledger already had this id, and `no_user` means the event named an account this database has never
 *   seen (a test-mode event, or a subscription created for a learner who has since been erased). Both
 *   are recorded, because a delivery that is remembered is a delivery that will not be retried forever.
 */
create or replace function apply_stripe_event(p_id text, p_type text, p_object jsonb)
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_claimed   text;
  v_user      uuid;
  v_plan      text;
  v_status    text;
  v_period    timestamptz;
  v_customer  text;
  v_sub       text;
  v_intent    text;
  v_kind      text;
  v_amount    int;
  v_currency  text;
  v_payment   payments;
begin
  if coalesce(p_id, '') = '' or coalesce(p_type, '') = '' or p_object is null then
    return jsonb_build_object('applied', false, 'reason', 'malformed');
  end if;

  -- The claim. A replayed delivery loses this insert and returns before touching a single row.
  insert into stripe_events (id, type) values (p_id, p_type)
  on conflict (id) do nothing
  returning id into v_claimed;

  if v_claimed is null then
    return jsonb_build_object('applied', false, 'reason', 'duplicate', 'event', p_id);
  end if;

  v_customer := nullif(p_object ->> 'customer', '');
  v_sub      := nullif(p_object ->> 'id', '');
  v_user     := stripe_id(coalesce(p_object #>> '{metadata,user_id}', p_object ->> 'client_reference_id'));

  -- A subscription event names its learner in `metadata.user_id`, which is set when the session is
  -- created; the fallback is the customer id recorded by an earlier event, so a subscription created
  -- before this handler existed still resolves.
  if v_user is null and v_customer is not null then
    select e.user_id into v_user
    from entitlements e
    where e.stripe_customer_id = v_customer and e.user_id is not null
    order by e.updated_at desc
    limit 1;
  end if;

  if v_user is null and v_sub is not null then
    select e.user_id into v_user
    from entitlements e
    where e.stripe_subscription_id = v_sub and e.user_id is not null
    order by e.updated_at desc
    limit 1;
  end if;

  if v_user is not null and not exists (select 1 from profiles p where p.id = v_user) then
    v_user := null;
  end if;

  if p_type = 'checkout.session.completed' then
    v_plan := stripe_plan_for(p_object);
    v_intent := nullif(p_object ->> 'payment_intent', '');
    v_amount := coalesce((nullif(p_object ->> 'amount_total', ''))::int, 0);
    v_currency := coalesce(nullif(p_object ->> 'currency', ''), 'usd');
    v_kind := case when v_plan = 'lifetime' then 'lifetime' else 'subscription' end;

    if v_user is null then
      return jsonb_build_object('applied', false, 'reason', 'no_user', 'event', p_id);
    end if;

    insert into payments (user_id, stripe_payment_intent, stripe_event_id, amount, currency, kind)
    values (v_user, v_intent, p_id, v_amount, v_currency, v_kind)
    on conflict (stripe_payment_intent) do nothing;

    -- A lifetime purchase is settled here, because no subscription event will ever follow it. A
    -- subscription is settled by `customer.subscription.created`, which carries the period end.
    if v_plan = 'lifetime' then
      insert into entitlements (user_id, plan, status, source, current_period_end, stripe_customer_id, updated_at)
      values (v_user, 'lifetime', 'active', 'stripe', null, v_customer, now())
      on conflict (user_id, plan) do update
        set status = 'active',
            source = 'stripe',
            current_period_end = null,
            stripe_customer_id = coalesce(excluded.stripe_customer_id, entitlements.stripe_customer_id),
            updated_at = now();
    end if;
  elsif p_type in (
    'customer.subscription.created',
    'customer.subscription.updated',
    'customer.subscription.deleted'
  ) then
    v_plan := stripe_plan_for(p_object);
    -- Trialing is access. past_due is a grace window Stripe is still retrying, and it is NOT access:
    -- the plan's risk table says default to "not entitled" for every state that is not clearly paid.
    v_status := case p_object ->> 'status'
      when 'active' then 'active'
      when 'trialing' then 'active'
      when 'past_due' then 'past_due'
      else 'canceled'
    end;
    v_period := case
      when (p_object ->> 'current_period_end') ~ '^[0-9]+$'
        then to_timestamp((p_object ->> 'current_period_end')::bigint)
      else null
    end;

    if v_user is null then
      return jsonb_build_object('applied', false, 'reason', 'no_user', 'event', p_id);
    end if;

    insert into entitlements (
      user_id, plan, status, source, current_period_end, stripe_customer_id, stripe_subscription_id, updated_at
    )
    values (v_user, v_plan, v_status, 'stripe', v_period, v_customer, v_sub, now())
    on conflict (user_id, plan) do update
      set status = excluded.status,
          source = 'stripe',
          -- A deletion event has no period to speak of; keeping the last known one is more honest than
          -- erasing when the subscription actually ran out.
          current_period_end = coalesce(excluded.current_period_end, entitlements.current_period_end),
          stripe_customer_id = coalesce(excluded.stripe_customer_id, entitlements.stripe_customer_id),
          stripe_subscription_id = coalesce(excluded.stripe_subscription_id, entitlements.stripe_subscription_id),
          updated_at = now();
  elsif p_type = 'invoice.paid' then
    v_intent := nullif(p_object ->> 'payment_intent', '');
    -- An invoice's own `id` is not a subscription id, and the update below must match on the
    -- subscription: overwrite, never coalesce, or a renewal would fall through to the
    -- `stripe_subscription_id is null` arm and extend whichever plan happened to have no id.
    v_sub := nullif(p_object ->> 'subscription', '');
    v_plan := stripe_plan_for(p_object);
    v_amount := coalesce((nullif(p_object ->> 'amount_paid', ''))::int, 0);
    v_currency := coalesce(nullif(p_object ->> 'currency', ''), 'usd');

    if v_user is null then
      return jsonb_build_object('applied', false, 'reason', 'no_user', 'event', p_id);
    end if;

    insert into payments (user_id, stripe_payment_intent, stripe_event_id, amount, currency, kind)
    values (v_user, v_intent, p_id, v_amount, v_currency, 'subscription')
    on conflict (stripe_payment_intent) do nothing;

    -- A renewal extends the window instead of re-granting: `is_entitled()` reads the period, so a paid
    -- invoice is the difference between "entitled until last month" and "entitled until next month".
    v_period := case
      when (p_object #>> '{lines,data,0,period,end}') ~ '^[0-9]+$'
        then to_timestamp((p_object #>> '{lines,data,0,period,end}')::bigint)
      else null
    end;

    if v_period is not null then
      -- A paid invoice re-opens a window that closed (`canceled` included): money was taken for that
      -- period, so the period is access. `revoked` is excluded — that is a refund, and a stray
      -- invoice must not buy back what was returned. `lifetime` has no window to extend.
      update entitlements e
      set current_period_end = v_period, status = 'active', updated_at = now()
      where e.user_id = v_user
        and e.source = 'stripe'
        and e.plan <> 'lifetime'
        and e.status in ('active', 'past_due', 'canceled')
        and (v_sub is null or e.stripe_subscription_id = v_sub or e.stripe_subscription_id is null);
    end if;
  elsif p_type = 'charge.refunded' then
    v_intent := nullif(p_object ->> 'payment_intent', '');

    select * into v_payment
    from payments
    where stripe_payment_intent = v_intent
    limit 1;

    if v_payment.id is null then
      -- A refund for money this database never recorded (a charge from another product, or an event
      -- whose checkout delivery was lost). Recorded as applied-with-a-reason rather than guessed at.
      return jsonb_build_object('applied', false, 'reason', 'unknown_charge', 'event', p_id);
    end if;

    update payments set refunded = true where id = v_payment.id;
    v_user := coalesce(v_payment.user_id, v_user);

    if v_user is not null then
      -- The money came back, so the access it bought goes away — every Stripe-sourced plan this learner
      -- holds, in the same statement, because `is_entitled()` is one query and a half-revoked account is
      -- the failure mode the acceptance row is about. `source = 'institution'` is untouched: an employer
      -- did not refund anything.
      update entitlements
      set status = 'revoked', updated_at = now()
      where user_id = v_user and source = 'stripe';
    end if;
  else
    -- An event nobody here acts on (`payment_intent.created`, `customer.created`, ...). Claimed and
    -- recorded so Stripe stops retrying it, and so the ledger is a complete account of what arrived.
    update stripe_events set processed_at = now() where id = p_id;
    return jsonb_build_object('applied', false, 'reason', 'ignored', 'type', p_type);
  end if;

  update stripe_events set processed_at = now() where id = p_id;
  return jsonb_build_object('applied', true, 'event', p_id, 'type', p_type, 'user', v_user, 'plan', v_plan);
end;
$$;

comment on function apply_stripe_event(text, text, jsonb) is
  'Applies one verified Stripe event exactly once: the id is claimed in stripe_events first, and a duplicate short-circuits before any row moves.';

-- Only the webhook may say that someone paid. A learner calling this would grant themselves access,
-- which is exactly what the money tables' missing grants exist to prevent.
revoke execute on function apply_stripe_event(text, text, jsonb) from public, anon, authenticated;
grant execute on function apply_stripe_event(text, text, jsonb) to service_role;

revoke execute on function stripe_plan_for(jsonb, text) from public, anon, authenticated;
revoke execute on function stripe_id(text) from public, anon, authenticated;
grant execute on function stripe_plan_for(jsonb, text) to service_role;
grant execute on function stripe_id(text) to service_role;
