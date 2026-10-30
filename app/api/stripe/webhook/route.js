/**
 * `POST /api/stripe/webhook` — Stripe telling this site that money moved.
 *
 * The order here is the security model:
 *
 *   1. Read the **raw** body (`request.text()`), because the signature is over those bytes and a
 *      round trip through `JSON.parse`/`JSON.stringify` is not byte-identical.
 *   2. Verify `Stripe-Signature` with the webhook secret. No secret, no signature, wrong signature,
 *      stale timestamp — all refused with 400 and nothing touched.
 *   3. Hand the event id, type and object to `apply_stripe_event()` with the service role. That
 *      function claims the id in `stripe_events` first, so a retried delivery is a no-op instead of a
 *      second entitlement.
 *
 * A `POST` handler is never cached (`next.config.mjs` runs with `cacheComponents`, where a route
 * segment config is an error), and the response carries `no-store` for anything in front of it.
 *
 * `applied: false` still answers 200: a duplicate is Stripe doing what Stripe is supposed to do, and a
 * non-2xx would make it retry a delivery that will keep being a duplicate. Only the database being
 * unreachable is a 502, because then the event really was not handled.
 */
import { progressClient } from "../../../../lib/progress/write.js";
import { stripeConfig, verifySignature } from "../../../../lib/stripe.js";

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export async function POST(request) {
  const config = stripeConfig();
  if (!config.webhookSecret) {
    console.error("api/stripe/webhook: STRIPE_WEBHOOK_SECRET is unset, refusing every delivery");
    return json({ ok: false, error: "webhook_unconfigured" }, 503);
  }

  const raw = await request.text();
  const verdict = verifySignature(raw, request.headers.get("stripe-signature"), config.webhookSecret);
  if (!verdict.ok) {
    // No detail about the expected signature: this endpoint is reachable by anyone.
    return json({ ok: false, error: "invalid_signature", reason: verdict.reason }, 400);
  }

  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    return json({ ok: false, error: "body is not JSON" }, 400);
  }
  if (!event?.id || !event?.type || typeof event.data?.object !== "object") {
    return json({ ok: false, error: "not_a_stripe_event" }, 400);
  }

  const client = progressClient();
  if (!client) {
    console.error("api/stripe/webhook: SUPABASE_SERVICE_ROLE_KEY is unset, cannot record the event");
    return json({ ok: false, error: "webhook_store_unconfigured" }, 503);
  }

  const { data, error } = await client.rpc("apply_stripe_event", {
    p_id: event.id,
    p_type: event.type,
    p_object: event.data.object,
  });
  if (error) {
    console.error(`api/stripe/webhook: apply_stripe_event failed for ${event.id}: ${error.message}`);
    return json({ ok: false, error: "apply_failed" }, 502);
  }

  return json({ ok: true, ...(data ?? {}) }, 200);
}
