/**
 * `POST /api/stripe/checkout` — start a Checkout session for the signed-in learner.
 *
 * The session is created **server-side** and the browser is only ever given a URL: a client-created
 * session would let a browser choose its own price, its own `client_reference_id`, and its own mode.
 * The plan name arrives from the pricing page, the price id is looked up in configuration, and the
 * account id comes from the session cookie — never from the request body.
 *
 * Two ways in, because the page is plain HTML and stays usable without JavaScript: a form post
 * (`?plan=monthly`) answers 303 to Stripe, and a JSON post answers `{ url }`.
 */
import { currentUser } from "../../../../lib/auth/server.js";
import { checkoutForm, priceFor, stripeConfig, stripePost } from "../../../../lib/stripe.js";

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

/** The page the button lives on, which is where Stripe sends the learner back to. */
function originFor(request) {
  const configured = (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim();
  if (configured) return configured;
  return new URL(request.url).origin;
}

function planFrom(request, body) {
  const fromQuery = new URL(request.url).searchParams.get("plan");
  if (fromQuery) return fromQuery;
  if (body && typeof body === "object" && typeof body.plan === "string") return body.plan;
  return "annual";
}

export async function POST(request) {
  const config = stripeConfig();
  if (!config.enabled) return json({ ok: false, error: "stripe_unconfigured", reason: config.reason }, 503);

  const contentType = request.headers.get("content-type") ?? "";
  const wantsForm = contentType.includes("application/x-www-form-urlencoded");

  const { user } = await currentUser();
  if (!user) {
    // The pricing page's button is a plain form post, so a signed-out buyer gets the sign-up page and
    // comes back here — not a JSON error in a browser window.
    if (wantsForm) {
      return new Response(null, {
        status: 303,
        headers: { location: "/signup?next=/pricing", "cache-control": "no-store" },
      });
    }
    return json({ ok: false, error: "sign_in_required" }, 401);
  }

  let body = null;
  if (contentType.includes("application/json")) {
    try {
      body = await request.json();
    } catch {
      return json({ ok: false, error: "body is not JSON" }, 400);
    }
  } else if (wantsForm) {
    body = Object.fromEntries(await request.formData());
  }

  const plan = planFrom(request, body);
  if (!priceFor(config, plan)) return json({ ok: false, error: "unknown_plan", plan }, 400);

  let form;
  try {
    form = checkoutForm({ config, plan, userId: user.id, email: user.email, origin: originFor(request) });
  } catch (err) {
    console.error(`api/stripe/checkout: ${err.message}`);
    return json({ ok: false, error: "checkout_unavailable" }, 500);
  }

  const result = await stripePost("/checkout/sessions", form, { config });
  if (!result.ok) {
    console.error(`api/stripe/checkout: ${result.error}`);
    return json({ ok: false, error: result.error }, result.status);
  }
  const url = result.body?.url;
  if (!url) return json({ ok: false, error: "stripe_returned_no_url" }, 502);

  if (wantsForm) {
    // 303, not 307: a form post must not be replayed at the Stripe URL by a refresh.
    return new Response(null, { status: 303, headers: { location: url, "cache-control": "no-store" } });
  }
  return json({ ok: true, url }, 200);
}
