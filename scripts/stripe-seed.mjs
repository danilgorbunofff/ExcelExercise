#!/usr/bin/env node
/**
 * `npm run stripe:seed` — create the three prices, and print the environment lines they produce.
 *
 * Prices are data in Stripe, not in this repo, so the only thing that can be written down here is the
 * recipe: one product, three prices, and the ids that end up in `STRIPE_PRICE_*`. The script is
 * idempotent by lookup rather than by id: it reuses a price whose `lookup_key` already matches, so a
 * second run does not litter the dashboard with a fourth and fifth price.
 *
 * It prints; it does not write `.env.local`. Secrets are pasted by a human, because a script that can
 * write a secret file can also leak one into a shell history or a log.
 *
 * ```sh
 * STRIPE_SECRET_KEY=sk_test_... npm run stripe:seed
 * ```
 */

import { STRIPE_API, PLANS, VARIABLES, stripeConfig, stripePost } from "../lib/stripe.js";

const PRODUCT = "Excel drills — the full track";
const AMOUNTS = {
  monthly: { amount: 999, currency: "usd", interval: "month", lookup: "excel-monthly" },
  annual: { amount: 5999, currency: "usd", interval: "year", lookup: "excel-annual" },
  lifetime: { amount: 19900, currency: "usd", interval: null, lookup: "excel-lifetime" },
};

const config = stripeConfig();
if (!config.enabled) {
  console.error(`stripe:seed: ${VARIABLES.secret} is unset. Nothing was created.`);
  process.exit(1);
}

/** One GET, for the lookup half: prices are searched by `lookup_key`, which is unique per account. */
async function get(path, params = {}) {
  const query = new URLSearchParams(params).toString();
  const response = await fetch(`${STRIPE_API}/${path.replace(/^\/+/, "")}${query ? `?${query}` : ""}`, {
    headers: { authorization: `Bearer ${config.secretKey}`, "stripe-version": "2024-06-20" },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error?.message ?? `stripe answered ${response.status}`);
  return body;
}

async function ensureProduct() {
  const found = await get("products/search", { query: `name:"${PRODUCT}"`, limit: "1" });
  const existing = found?.data?.[0];
  if (existing) return existing.id;
  const created = await stripePost(
    "/products",
    { name: PRODUCT, description: "Sixty drills. One payment. Progress carries across devices." },
    { config },
  );
  if (!created.ok) throw new Error(created.error);
  return created.body.id;
}

async function ensurePrice(productId, plan) {
  const wanted = AMOUNTS[plan];
  const found = await get("prices/search", { query: `lookup_key:"${wanted.lookup}"`, limit: "1" });
  const existing = found?.data?.[0];
  if (existing) return existing.id;

  const form = {
    product: productId,
    currency: wanted.currency,
    unit_amount: String(wanted.amount),
    lookup_key: wanted.lookup,
    // The webhook reads `metadata.plan` off the session, which is set from the plan name in the form —
    // the price's own metadata is for a human looking at the dashboard.
    "metadata[plan]": plan,
  };
  if (PLANS[plan].recurring) form["recurring[interval]"] = wanted.interval;
  const created = await stripePost("/prices", form, { config });
  if (!created.ok) throw new Error(created.error);
  return created.body.id;
}

const productId = await ensureProduct();
const ids = {};
for (const plan of Object.keys(AMOUNTS)) ids[plan] = await ensurePrice(productId, plan);

console.log(`product    ${productId}`);
console.log("");
console.log("Add these to .env.local (test mode) or the deployment's environment:");
console.log(`${VARIABLES.secret}=sk_test_...            # the one you just used`);
console.log(`${VARIABLES.webhook}=whsec_...             # stripe listen --forward-to localhost:4174/api/stripe/webhook`);
console.log(`${VARIABLES.monthly}=${ids.monthly}`);
console.log(`${VARIABLES.annual}=${ids.annual}`);
console.log(`${VARIABLES.lifetime}=${ids.lifetime}`);
