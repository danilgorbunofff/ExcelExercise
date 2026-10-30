/**
 * The payment path, minus the network: what to send to Stripe, and how to trust what it sends back.
 *
 * There is no Stripe SDK here, and that is a decision, not a shortcut. The two things this site needs
 * from Stripe are a form-encoded POST and a HMAC-SHA256 comparison over the raw body — `fetch` and
 * `node:crypto` do both, so a dependency that ships a second HTTP stack and a large type surface would
 * buy nothing but upgrade risk in the one code path that moves money.
 *
 * Everything in this file is pure and importable, which is the point: signature verification is the
 * security boundary of the whole feature, so it is tested directly (`tests/stripe.test.js`) rather than
 * only through whichever route happens to call it.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const STRIPE_API = "https://api.stripe.com/v1";

export const VARIABLES = {
  secret: "STRIPE_SECRET_KEY",
  webhook: "STRIPE_WEBHOOK_SECRET",
  monthly: "STRIPE_PRICE_MONTHLY",
  annual: "STRIPE_PRICE_ANNUAL",
  lifetime: "STRIPE_PRICE_LIFETIME",
};

/** Unconfigured is a normal state: no checkout is offered, and nothing else in the site changes. */
export const NOT_CONFIGURED = `Checkout is not configured on this deployment (${VARIABLES.secret} is unset).`;

/** Five minutes, which is Stripe's own default and Slack's: long enough for a retry, short enough to matter. */
export const SIGNATURE_TOLERANCE_SECONDS = 300;

/**
 * The plans, and what each one is: a recurring price Stripe bills monthly or yearly, or a one-off.
 * `entitlements.plan` accepts exactly these names, `stripe_plan_for()` in 0008 clamps to them, and the
 * price ids arrive from the environment so a test-mode run and a live run are the same code.
 */
export const PLANS = {
  monthly: { mode: "subscription", recurring: true, interval: "month" },
  annual: { mode: "subscription", recurring: true, interval: "year" },
  lifetime: { mode: "payment", recurring: false, interval: null },
};

/**
 * @returns {{ enabled: boolean, secretKey: string|null, webhookSecret: string|null,
 *   prices: { monthly: string|null, annual: string|null, lifetime: string|null }, reason: string|null }}
 */
export function stripeConfig(env = process.env) {
  const secretKey = (env[VARIABLES.secret] ?? "").trim();
  const webhookSecret = (env[VARIABLES.webhook] ?? "").trim();
  const prices = {
    monthly: (env[VARIABLES.monthly] ?? "").trim() || null,
    annual: (env[VARIABLES.annual] ?? "").trim() || null,
    lifetime: (env[VARIABLES.lifetime] ?? "").trim() || null,
  };
  if (!secretKey) {
    return { enabled: false, secretKey: null, webhookSecret: null, prices, reason: NOT_CONFIGURED };
  }
  return { enabled: true, secretKey, webhookSecret: webhookSecret || null, prices, reason: null };
}

/** The price id a plan is sold at, or `null` when that plan has not been priced on this deployment. */
export function priceFor(config, plan) {
  return Object.hasOwn(PLANS, plan) ? config.prices[plan] : null;
}

/** The inverse, for naming a price a learner is looking at; `null` when a price is unknown. */
export function planForPrice(config, priceId) {
  if (!priceId) return null;
  return Object.keys(PLANS).find((plan) => config.prices[plan] === priceId) ?? null;
}

/**
 * The Checkout session request, as a flat form object.
 *
 * `metadata.user_id` is the whole reason a webhook can do anything: Stripe has no idea who our learner
 * is, so every session (and, for subscriptions, the subscription it creates) carries the account id.
 * The route signs no JWT and keeps no server-side session, so this is the only thread back.
 *
 * @returns {Record<string, string>}
 */
export function checkoutForm({ config, plan, userId, email, origin }) {
  const priceId = priceFor(config, plan);
  if (!priceId) throw new Error(`no price configured for plan: ${plan}`);
  if (!userId) throw new Error("a checkout session needs the account it pays for");

  const base = origin.replace(/\/+$/, "");
  const form = {
    mode: PLANS[plan].mode,
    "line_items[0][price]": priceId,
    "line_items[0][quantity]": "1",
    success_url: `${base}/pricing?checkout=complete`,
    cancel_url: `${base}/pricing?checkout=cancelled`,
    client_reference_id: userId,
    "metadata[user_id]": userId,
    "metadata[plan]": plan,
    // Tax is on for the same reason the terms page says the price is the price: a $59.99 sale with a
    // surprise VAT line is a refund request.
    "automatic_tax[enabled]": "true",
  };
  if (email) form.customer_email = email;
  if (PLANS[plan].mode === "subscription") {
    // The subscription inherits the account, so `customer.subscription.*` and `invoice.paid` resolve
    // without guessing: the session object is not part of a subscription event.
    form["subscription_data[metadata][user_id]"] = userId;
    form["subscription_data[metadata][plan]"] = plan;
  }
  return form;
}

/** The Billing Portal request: one customer, one return URL, no parameters that could change money. */
export function portalForm({ customerId, origin }) {
  if (!customerId) throw new Error("the billing portal needs the Stripe customer");
  return {
    customer: customerId,
    return_url: `${origin.replace(/\/+$/, "")}/account`,
  };
}

/**
 * Verify a `Stripe-Signature` header against the exact bytes of the body.
 *
 * Stripe sends `t=<unix>,v1=<hex>` and may send several `v1` values while a secret is rotating. The
 * signed payload is `<t>.<raw body>` — so the body must be the bytes Stripe hashed, which is why the
 * route reads `request.text()` and never `request.json()`: JSON.parse followed by JSON.stringify is
 * not byte-identical, and the signature would fail for a reason nobody could see.
 *
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function verifySignature(rawBody, header, secret, options = {}) {
  const tolerance = options.tolerance ?? SIGNATURE_TOLERANCE_SECONDS;
  const nowSeconds = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (!secret) return { ok: false, reason: "no_webhook_secret" };
  if (typeof rawBody !== "string" || rawBody.length === 0) return { ok: false, reason: "empty_body" };
  if (typeof header !== "string" || header.length === 0) return { ok: false, reason: "missing_signature" };

  let timestamp = null;
  const candidates = [];
  for (const part of header.split(",")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key === "t") timestamp = value;
    else if (key === "v1") candidates.push(value);
  }
  if (!timestamp || candidates.length === 0) return { ok: false, reason: "malformed_signature" };
  if (!/^\d+$/.test(timestamp)) return { ok: false, reason: "malformed_signature" };

  // The timestamp is inside the signed payload, so an attacker cannot re-date a captured body — but a
  // captured body replayed within the window is still valid, which is why `stripe_events` exists.
  if (Math.abs(nowSeconds - Number(timestamp)) > tolerance) return { ok: false, reason: "timestamp_out_of_tolerance" };

  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`, "utf8").digest();
  for (const candidate of candidates) {
    if (!/^[0-9a-f]{64}$/i.test(candidate)) continue;
    const given = Buffer.from(candidate, "hex");
    if (given.length === expected.length && timingSafeEqual(given, expected)) return { ok: true };
  }
  return { ok: false, reason: "signature_mismatch" };
}

/**
 * One form-encoded request to the Stripe API.
 *
 * `fetchImpl` is a parameter so a test can prove the request without a network, and because a payment
 * path that can only be exercised by spending money is a payment path nobody tests.
 *
 * @returns {Promise<{ ok: true, body: any } | { ok: false, status: number, error: string }>}
 */
export async function stripePost(path, form, options = {}) {
  const config = options.config ?? stripeConfig(options.env);
  const doFetch = options.fetchImpl ?? fetch;
  if (!config.enabled) return { ok: false, status: 503, error: "stripe_unconfigured" };

  let response;
  try {
    response = await doFetch(`${STRIPE_API}/${path.replace(/^\/+/, "")}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.secretKey}`,
        "content-type": "application/x-www-form-urlencoded",
        // Stripe pins behaviour to an API version; without one, a dashboard upgrade can change the
        // shape of the objects this webhook parses.
        "stripe-version": options.apiVersion ?? "2024-06-20",
      },
      body: new URLSearchParams(form).toString(),
    });
  } catch (err) {
    return { ok: false, status: 502, error: `stripe_unreachable: ${err.message}` };
  }

  let body;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok) {
    const message = body?.error?.message ?? `stripe answered ${response.status}`;
    return { ok: false, status: 502, error: message };
  }
  return { ok: true, body };
}
