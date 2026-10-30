/**
 * `POST /api/account/delete` — the learner ends the account, and it happens now.
 *
 * Three steps, in this order, and the order is the design:
 *
 * 1. `request_account_deletion()` runs on the *learner's* session, not the service role, because it is
 *    `security definer` over `auth.uid()`: it erases the progress, attempts, points, streaks and
 *    feedback rows and anonymises the profile in one transaction. If the next step fails, the account
 *    has already stopped collecting anything.
 * 2. The auth identity is deleted with the service-role key. This is the only step that revokes
 *    sign-in, and it is what cascades the profile — and with it the email address — out of the
 *    database.
 * 3. The session cookies are cleared.
 *
 * `payments` and `entitlements` survive step 2 with a null `user_id` (0006): a refund needs the payment
 * it refunds, and tax records outlive the person. That is the documented retention form, printed on
 * `/privacy` and inside the export.
 *
 * CSRF: the confirmation word is in the body and the session is a `SameSite=Lax` cookie, so another
 * origin's form POST arrives without a session and gets a 401. That is the whole defence, and it is
 * enough for a request that needs a live session to do anything at all.
 */
import { authConfig } from "../../../../lib/auth/config.js";
import { currentUser } from "../../../../lib/auth/server.js";
import { CONFIRMATION, confirmed } from "../../../../lib/legal.js";
import { progressClient } from "../../../../lib/progress/write.js";

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

/** `delete my account` typed into a form, or `{ "confirm": "delete my account" }` from a fetch. */
async function confirmationFrom(request) {
  const type = request.headers.get("content-type") ?? "";
  try {
    if (type.includes("application/json")) return (await request.json())?.confirm;
    if (type.includes("form")) return (await request.formData()).get("confirm");
  } catch {
    return undefined;
  }
  return undefined;
}

export async function POST(request) {
  if (!authConfig().enabled) {
    return json({ ok: false, error: "account_delete_unconfigured" }, 503);
  }

  const { supabase, user } = await currentUser();
  if (!supabase || !user) return json({ ok: false, error: "sign_in_required" }, 401);

  const submitted = await confirmationFrom(request);
  if (!confirmed(submitted)) {
    return json({ ok: false, error: "confirmation_required", confirmation: CONFIRMATION }, 400);
  }

  const admin = progressClient();
  if (!admin) {
    // Configured for browsers but no service key: without it the identity cannot be revoked, so the
    // route refuses before it erases anything.
    console.error("api/account/delete: SUPABASE_SERVICE_ROLE_KEY is unset, cannot revoke the identity");
    return json({ ok: false, error: "account_delete_unconfigured" }, 503);
  }

  const erased = await supabase.rpc("request_account_deletion");
  if (erased.error) {
    console.error(`api/account/delete: ${erased.error.code ?? "error"} ${erased.error.message}`);
    return json({ ok: false, error: "deletion_failed" }, 502);
  }

  const purge = await admin.auth.admin.deleteUser(user.id);
  if (purge.error) {
    // The data is already gone; only the sign-in outlived it. Say exactly that rather than report a
    // success the next request would contradict.
    console.error(`api/account/delete: identity purge failed — ${purge.error.message}`);
    return json({ ok: false, error: "identity_purge_failed", erased: erased.data }, 502);
  }

  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // The identity is gone, so the token in the cookie is worthless either way; a failure to clear it
    // costs one redirect through `currentUser()`, not a session.
  }

  // A plain form posts here and follows the redirect; a fetch gets the counts it can display.
  if ((request.headers.get("content-type") ?? "").includes("form")) {
    return new Response(null, { status: 303, headers: { location: "/account/deleted", "cache-control": "no-store" } });
  }

  return json({ ok: true, erased: erased.data }, 200);
}
