-- 0014 — the six-month term.
--
-- The pricing page sells three terms (a month, six months, a year). Six months is a new plan name, so
-- the check constraint that owns the vocabulary in `entitlements.plan` has to admit it, and the webhook's
-- mapping has to stop clamping it to `monthly` — which would have quietly granted access as if the buyer
-- had paid for one month, and left `stripe_plan_for` unable to name the row the payment created.
--
-- Nothing else changes: entitlement is still a row per (user, plan), and the term end still arrives from
-- the subscription's `current_period_end`, which Stripe already sets six months out for this price.

alter table entitlements
  drop constraint if exists entitlements_plan_check;

alter table entitlements
  add constraint entitlements_plan_check
  check (plan in ('monthly', 'semiannual', 'annual', 'lifetime', 'institution'));

create or replace function stripe_plan_for(p_object jsonb, p_fallback text default 'monthly')
returns text
language sql immutable set search_path = public as $$
  select case
    when coalesce(p_object #>> '{metadata,plan}', p_fallback)
      in ('monthly', 'semiannual', 'annual', 'lifetime')
      then coalesce(p_object #>> '{metadata,plan}', p_fallback)
    else 'monthly'
  end;
$$;

comment on function stripe_plan_for(jsonb, text) is
  'The plan a Stripe object names in metadata.plan, clamped to the values entitlements.plan accepts.';
