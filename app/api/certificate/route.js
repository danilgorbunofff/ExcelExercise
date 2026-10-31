/**
 * `POST /api/certificate` — issues the completion certificate, or hands back the one already held.
 *
 * There is no GET counterpart. Reading your own certificate is a page (`/certificate`), and reading
 * anyone's is `/verify/[id]`; both render server-side from the same helpers this route uses, so there is
 * nothing here for a client to poll.
 *
 * The order of the guards is the order of the sentences a learner can hit:
 *
 *   1. accounts off → 503, "this deployment cannot issue certificates"
 *   2. signed out → 401, sign in (progress only exists per account)
 *   3. names do not match → 400, the confirmation message, because the name is permanent
 *   4. not finished → 409, with the counts
 *
 * Step 4 is decided twice on purpose: here, so the learner gets a sentence about their own progress, and
 * again inside `issue_certificate`, so a direct call to the database cannot mint an unearned certificate.
 */
import { authConfig } from "../../../lib/auth/config.js";
import { currentUser } from "../../../lib/auth/server.js";
import { checkNameConfirmation } from "../../../lib/certificate/eligibility.js";
import { issue, loadProgress, readCertificate } from "../../../lib/certificate/issue.js";
import { progressClient } from "../../../lib/progress/write.js";
import { loadSite } from "../../../lib/site.js";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export async function POST(request) {
  if (!authConfig().enabled) {
    return json({ ok: false, error: "certificate_unconfigured" }, 503);
  }

  const { supabase, user } = await currentUser();
  if (!user) return json({ ok: false, error: "sign_in_required" }, 401);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "body is not JSON" }, 400);
  }

  const named = checkNameConfirmation(body?.name, body?.nameAgain ?? body?.name);
  if (named.error) return json({ ok: false, error: named.error }, 400);

  // The service-role client writes; the learner's own client is what reads progress, so the row set the
  // eligibility sentence is built from is the same one RLS would let them see.
  const client = progressClient();
  if (!client) {
    console.error("api/certificate: SUPABASE_SERVICE_ROLE_KEY is unset, cannot issue");
    return json({ ok: false, error: "certificate_unconfigured" }, 503);
  }

  const held = await readCertificate(client, user.id);
  if (held.error) return json({ ok: false, error: held.error }, 502);
  if (held.row) {
    return json({
      ok: true,
      existing: true,
      credentialId: held.row.credential_id,
      issuedAt: held.row.issued_at,
      revoked: Boolean(held.row.revoked_at),
    });
  }

  const { track } = loadSite();
  const progress = await loadProgress(supabase);
  if (progress.error) return json({ ok: false, error: progress.error }, 502);

  const issued = await issue(client, { userId: user.id, name: named.value, track, progress: progress.rows });
  if (!issued.ok) return json({ ok: false, error: issued.error }, issued.status);

  return json({
    ok: true,
    existing: false,
    credentialId: issued.row.credential_id,
    issuedAt: issued.row.issued_at,
  });
}
