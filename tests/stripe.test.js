/**
 * The payment path in JavaScript: the signature this site must trust, the forms it sends, and the
 * routes that glue them together.
 *
 * `lib/stripe.js` is importable on purpose. Signature verification is the security boundary of the
 * whole feature — a webhook that trusts an unsigned body is a public "grant anyone a subscription"
 * endpoint — so it is tested directly here, against real HMACs, rather than only through a route that
 * would need a running server to reach.
 *
 * The routes themselves import `next/server` (through `currentUser`), so they are pinned with source
 * probes, which is the established pattern in this repo for wiring whose only failure mode is being
 * quietly rewired.
 */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { loadContent } from "../legacy/src/site/content.mjs";
import { preparePricingPage } from "../legacy/src/site/pricing-page.mjs";
import { siteConfig } from "../legacy/src/site/config.mjs";
import {
  NOT_CONFIGURED,
  PLANS,
  SIGNATURE_TOLERANCE_SECONDS,
  VARIABLES,
  checkoutForm,
  planForPrice,
  portalForm,
  priceFor,
  stripeConfig,
  stripePost,
  verifySignature,
} from "../lib/stripe.js";

const ROOT = join(import.meta.dirname, "..");
const NOW = 1_700_000_000;
const SECRET = "whsec_test_0123456789";
const BODY = JSON.stringify({ id: "evt_1", type: "checkout.session.completed" });

// Stripe signs `<timestamp>.<raw body>`, so the digest helper does too.
const digest = (body, timestamp = NOW, secret = SECRET) =>
  createHmac("sha256", secret).update(`${timestamp}.${body}`, "utf8").digest("hex");

const header = (body, overrides = {}) => {
  const timestamp = overrides.timestamp ?? NOW;
  const signature = overrides.signature ?? digest(body, timestamp);
  return `t=${timestamp},v1=${signature}${overrides.extra ?? ""}`;
};

const ENV = {
  [VARIABLES.secret]: "sk_test_123",
  [VARIABLES.webhook]: SECRET,
  [VARIABLES.monthly]: "price_monthly",
  [VARIABLES.annual]: "price_annual",
  [VARIABLES.lifetime]: "price_lifetime",
};

const config = stripeConfig(ENV);

describe("verifySignature", () => {
  it("accepts a signature over the exact bytes Stripe signed", () => {
    assert.deepEqual(verifySignature(BODY, header(BODY), SECRET, { nowSeconds: NOW }), { ok: true });
  });

  it("rejects a body that changed by one byte, because that is the whole point", () => {
    const tampered = BODY.replace("evt_1", "evt_2");
    assert.deepEqual(verifySignature(tampered, header(BODY), SECRET, { nowSeconds: NOW }), {
      ok: false,
      reason: "signature_mismatch",
    });
  });

  it("rejects a signature made with a different secret", () => {
    const forged = header(BODY, { signature: digest(BODY, NOW, "whsec_someone_else") });
    assert.equal(verifySignature(BODY, forged, SECRET, { nowSeconds: NOW }).reason, "signature_mismatch");
  });

  it("refuses a delivery older than the tolerance, so a captured body cannot be replayed forever", () => {
    const stale = NOW - SIGNATURE_TOLERANCE_SECONDS - 1;
    assert.equal(
      verifySignature(BODY, header(BODY, { timestamp: stale }), SECRET, { nowSeconds: NOW }).reason,
      "timestamp_out_of_tolerance",
    );
  });

  it("refuses a delivery dated in the future beyond the tolerance", () => {
    const ahead = NOW + SIGNATURE_TOLERANCE_SECONDS + 1;
    assert.equal(
      verifySignature(BODY, header(BODY, { timestamp: ahead }), SECRET, { nowSeconds: NOW }).reason,
      "timestamp_out_of_tolerance",
    );
  });

  it("accepts any one of several v1 candidates, which is what a secret rotation looks like", () => {
    const good = digest(BODY);
    const rotated = header(BODY, { signature: "a".repeat(64), extra: `,v1=${good}` });
    assert.deepEqual(verifySignature(BODY, rotated, SECRET, { nowSeconds: NOW }), { ok: true });
  });

  it("refuses a header with no timestamp, no v1, or no header at all", () => {
    assert.equal(verifySignature(BODY, "v1=abc", SECRET, { nowSeconds: NOW }).reason, "malformed_signature");
    assert.equal(verifySignature(BODY, `t=${NOW}`, SECRET, { nowSeconds: NOW }).reason, "malformed_signature");
    assert.equal(verifySignature(BODY, `t=abc,v1=def`, SECRET, { nowSeconds: NOW }).reason, "malformed_signature");
    assert.equal(verifySignature(BODY, "", SECRET, { nowSeconds: NOW }).reason, "missing_signature");
    assert.equal(verifySignature(BODY, null, SECRET, { nowSeconds: NOW }).reason, "missing_signature");
  });

  it("refuses to verify anything when the deployment has no webhook secret", () => {
    assert.equal(verifySignature(BODY, header(BODY), null, { nowSeconds: NOW }).reason, "no_webhook_secret");
  });

  it("refuses an empty body, because an empty body is never a Stripe event", () => {
    assert.equal(verifySignature("", header(""), SECRET, { nowSeconds: NOW }).reason, "empty_body");
  });

  it("ignores a candidate that is not a hex digest instead of throwing", () => {
    const odd = `t=${NOW},v1=not-hex-at-all`;
    assert.equal(verifySignature(BODY, odd, SECRET, { nowSeconds: NOW }).reason, "signature_mismatch");
  });
});

describe("stripeConfig", () => {
  it("is unconfigured, and says so, when the secret key is absent", () => {
    const empty = stripeConfig({});
    assert.equal(empty.enabled, false);
    assert.equal(empty.reason, NOT_CONFIGURED);
    assert.equal(empty.secretKey, null);
    assert.equal(empty.webhookSecret, null);
  });

  it("collects the three price ids and treats a blank one as missing", () => {
    const partial = stripeConfig({ [VARIABLES.secret]: "sk_test_1", [VARIABLES.monthly]: " price_m " });
    assert.equal(partial.prices.monthly, "price_m", "surrounding whitespace is trimmed");
    assert.equal(partial.prices.annual, null);
    assert.equal(partial.webhookSecret, null, "no webhook secret is a normal half-configuration");
  });

  it("prices each plan, and refuses to price a plan that does not exist", () => {
    assert.equal(priceFor(config, "monthly"), "price_monthly");
    assert.equal(priceFor(config, "lifetime"), "price_lifetime");
    assert.equal(priceFor(config, "free"), null);
    assert.equal(priceFor(config, "toString"), null, "no prototype reach-through");
  });

  it("names the price a learner is looking at, and nothing for an unknown one", () => {
    assert.equal(planForPrice(config, "price_annual"), "annual");
    assert.equal(planForPrice(config, "price_nope"), null);
    assert.equal(planForPrice(config, null), null);
  });
});

describe("checkoutForm", () => {
  it("creates a subscription for a recurring plan and a payment for a one-off", () => {
    const recurring = checkoutForm({ config, plan: "monthly", userId: "u1", origin: "https://x.example" });
    assert.equal(recurring.mode, "subscription");
    assert.equal(recurring["line_items[0][price]"], "price_monthly");
    assert.equal(recurring["line_items[0][quantity]"], "1");
    assert.equal(recurring["subscription_data[metadata][user_id]"], "u1", "the subscription must name its account");

    const once = checkoutForm({ config, plan: "lifetime", userId: "u1", origin: "https://x.example" });
    assert.equal(once.mode, "payment");
    assert.equal(once["line_items[0][price]"], "price_lifetime");
    assert.equal(once["subscription_data[metadata][user_id]"], undefined, "there is no subscription");
  });

  it("carries the account on the session, which is the only thread a webhook can follow back", () => {
    const form = checkoutForm({ config, plan: "annual", userId: "u1", origin: "https://x.example" });
    assert.equal(form.client_reference_id, "u1");
    assert.equal(form["metadata[user_id]"], "u1");
    assert.equal(form["metadata[plan]"], "annual");
  });

  it("returns the learner to the offer page either way, with the outcome in the query", () => {
    const form = checkoutForm({ config, plan: "annual", userId: "u1", origin: "https://x.example/" });
    assert.equal(form.success_url, "https://x.example/pricing?checkout=complete");
    assert.equal(form.cancel_url, "https://x.example/pricing?checkout=cancelled");
  });

  it("never invents an email it was not given", () => {
    const without = checkoutForm({ config, plan: "annual", userId: "u1", origin: "https://x.example" });
    assert.equal(without.customer_email, undefined);
    const withEmail = checkoutForm({
      config,
      plan: "annual",
      userId: "u1",
      email: "a@b.example",
      origin: "https://x.example",
    });
    assert.equal(withEmail.customer_email, "a@b.example");
    assert.equal(withEmail["automatic_tax[enabled]"], "true");
  });

  it("throws rather than sending a session with no price or no account", () => {
    assert.throws(() => checkoutForm({ config, plan: "monthly", origin: "https://x.example" }), /account/);
    assert.throws(
      () => checkoutForm({ config: stripeConfig({}), plan: "monthly", userId: "u1", origin: "https://x.example" }),
      /no price configured/,
    );
  });

  it("agrees with PLANS about which plan recurs", () => {
    for (const [plan, spec] of Object.entries(PLANS)) {
      assert.equal(spec.mode, plan === "lifetime" ? "payment" : "subscription", plan);
    }
  });
});

describe("portalForm", () => {
  it("opens a portal for one customer, returning to the account page", () => {
    assert.deepEqual(portalForm({ customerId: "cus_1", origin: "https://x.example/" }), {
      customer: "cus_1",
      return_url: "https://x.example/account",
    });
  });

  it("refuses to guess the customer", () => {
    assert.throws(() => portalForm({ origin: "https://x.example" }), /Stripe customer/);
  });
});

describe("stripePost", () => {
  const capture = (response) => {
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({ url, init });
      return response;
    };
    return { calls, fetchImpl };
  };

  it("sends a form-encoded body, the secret, and a pinned API version", async () => {
    const { calls, fetchImpl } = capture({
      ok: true,
      status: 200,
      json: async () => ({ id: "cs_1", url: "https://checkout.stripe.example/cs_1" }),
    });
    const result = await stripePost("/checkout/sessions", { mode: "payment", "metadata[plan]": "lifetime" }, {
      config,
      fetchImpl,
    });

    assert.equal(result.ok, true);
    assert.equal(result.body.id, "cs_1");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://api.stripe.com/v1/checkout/sessions");
    assert.equal(calls[0].init.method, "POST");
    assert.equal(calls[0].init.headers["content-type"], "application/x-www-form-urlencoded");
    assert.match(calls[0].init.headers["stripe-version"], /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(new URLSearchParams(calls[0].init.body).get("metadata[plan]"), "lifetime");
    assert.match(calls[0].init.headers.authorization, /^Bearer sk_test_/);
  });

  it("answers 503 without touching the network when the deployment is unconfigured", async () => {
    let called = false;
    const result = await stripePost("/checkout/sessions", {}, {
      config: stripeConfig({}),
      fetchImpl: async () => {
        called = true;
        throw new Error("must not be reached");
      },
    });
    assert.equal(result.ok, false);
    assert.equal(result.status, 503);
    assert.equal(called, false);
  });

  it("passes Stripe's own message through, because it is the only explanation there is", async () => {
    const { fetchImpl } = capture({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: "No such price: 'price_x'" } }),
    });
    const result = await stripePost("/checkout/sessions", {}, { config, fetchImpl });
    assert.equal(result.ok, false);
    assert.equal(result.status, 502);
    assert.equal(result.error, "No such price: 'price_x'");
  });

  it("turns an unreachable network into a 502 instead of an unhandled rejection", async () => {
    const result = await stripePost("/checkout/sessions", {}, {
      config,
      fetchImpl: async () => {
        throw new Error("ECONNREFUSED");
      },
    });
    assert.equal(result.ok, false);
    assert.equal(result.status, 502);
    assert.match(result.error, /ECONNREFUSED/);
  });
});

describe("the pricing page", () => {
  const { track, index } = loadContent(join(ROOT, "legacy/content"));
  const site = siteConfig({ SITE_URL: "https://drills.example", SITE_BUILT_AT: "2026-10-28" });
  const args = { config: site, track, index };

  it("says checkout is closed when this deployment cannot take money", () => {
    const { body } = preparePricingPage(args);
    assert.match(body, /Checkout is not open yet in this build/);
    assert.doesNotMatch(body, /\/api\/stripe\/checkout/, "no button may point at a disabled route");
  });

  it("offers the button, as a plain form, when it can", () => {
    const { body } = preparePricingPage({ ...args, checkout: stripeConfig(ENV) });
    assert.doesNotMatch(body, /Checkout is not open yet/);
    assert.match(body, /<form class="cta-row" method="post" action="\/api\/stripe\/checkout\?plan=annual">/);
    assert.match(body, /type="submit"/, "a form with no submit button is not a form a keyboard can use");
  });
});

describe("the routes, as written", () => {
  const read = (path) => readFileSync(join(ROOT, path), "utf8");
  const webhook = read("app/api/stripe/webhook/route.js");
  const checkout = read("app/api/stripe/checkout/route.js");
  const portal = read("app/api/stripe/portal/route.js");

  it("reads the webhook body as text, and never parses it before verifying it", () => {
    const raw = webhook.indexOf("await request.text()");
    const verify = webhook.indexOf("verifySignature(");
    const parse = webhook.indexOf("JSON.parse(raw)");
    assert.ok(raw !== -1, "the raw body is what the signature covers");
    assert.ok(raw < verify && verify < parse, "verify before parse, always");
    assert.equal(webhook.includes("request.json()"), false, "a parsed body cannot be verified");
  });

  it("claims the event with the service role, never with the caller's credentials", () => {
    assert.match(webhook, /progressClient\(\)/);
    assert.match(webhook, /rpc\("apply_stripe_event"/);
    assert.match(webhook, /"cache-control": "no-store"/, "nothing in front of this may cache a delivery");
  });

  it("keeps the portal's customer id server-side, filtered by the signed-in account", () => {
    assert.match(portal, /progressClient\(\)/);
    assert.match(portal, /\.eq\("user_id", user\.id\)/);
    assert.equal(portal.includes("stripe_customer_id: "), false, "the browser may not supply a customer");
  });

  it("creates Checkout server-side, from the plan name and the session cookie only", () => {
    assert.match(checkout, /stripePost\("\/checkout\/sessions"/);
    assert.match(checkout, /userId: user\.id/);
    assert.match(checkout, /originFor\(request\)/);
    assert.match(checkout, /status: 303/, "a form post must not be replayed by a refresh");
    assert.match(checkout, /location: "\/signup\?next=\/pricing"/, "a signed-out buyer signs up, then returns");
  });
});
