/**
 * `POST /api/stripe/portal` — the Billing Portal, which is where cancelling and refunds actually happen.
 *
 * The customer id is read with the **service role** and then filtered by the signed-in account id, not
 * taken from the request: `entitlements` has no grant for learners (0002), and a portal session opened
 * for a customer id a browser supplied would be a portal into someone else's billing.
 *
 * An account that has never paid has no customer, and the honest answer is 409 with the reason — not a
 * portal URL Stripe will reject.
 */
import { currentUser } from "../../../../lib/auth/server.js";
import { progressClient } from "../../../../lib/progress/write.js";
import { portalForm, stripeConfig, stripePost } from "../../../../lib/stripe.js";

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export async function POST(request) {
  // A form post is a browser with a person in front of it: it must land somewhere readable, never
  // on a JSON body. The API answer for the same condition stays 409.
  const isForm = (request.headers.get("content-type") ?? "").includes(
    "application/x-www-form-urlencoded",
  );
  const config = stripeConfig();
  if (!config.enabled) return json({ ok: false, error: "stripe_unconfigured", reason: config.reason }, 503);

  const { user } = await currentUser();
  if (!user) return json({ ok: false, error: "sign_in_required" }, 401);

  const client = progressClient();
  if (!client) {
    console.error("api/stripe/portal: SUPABASE_SERVICE_ROLE_KEY is unset, cannot read the customer");
    return json({ ok: false, error: "portal_store_unconfigured" }, 503);
  }

  const { data, error } = await client
    .from("entitlements")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .not("stripe_customer_id", "is", null)
    .order("updated_at", { ascending: false })
    .limit(1);
  if (error) {
    console.error(`api/stripe/portal: ${error.message}`);
    return json({ ok: false, error: "portal_lookup_failed" }, 502);
  }
  const customerId = data?.[0]?.stripe_customer_id;
  if (!customerId) {
    // Nothing to manage: a lifetime plan, an institutional seat, or a free account that reached
    // this by hand. Back to the page that offers the button, not a wall of JSON.
    if (isForm) {
      return new Response(null, { status: 303, headers: { location: "/account", "cache-control": "no-store" } });
    }
    return json({ ok: false, error: "no_billing_account" }, 409);
  }

  const origin = (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim() || new URL(request.url).origin;
  const result = await stripePost(
    "/billing_portal/sessions",
    portalForm({ customerId, origin }),
    { config },
  );
  if (!result.ok) {
    console.error(`api/stripe/portal: ${result.error}`);
    return json({ ok: false, error: result.error }, result.status);
  }
  const url = result.body?.url;
  if (!url) return json({ ok: false, error: "stripe_returned_no_url" }, 502);

  if (isForm) {
    return new Response(null, { status: 303, headers: { location: url, "cache-control": "no-store" } });
  }
  return json({ ok: true, url }, 200);
}
