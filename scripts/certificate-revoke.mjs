#!/usr/bin/env node
/**
 * `npm run certificate:revoke -- <credential-id> --actor <admin-user-uuid> [--reason "..."]` — withdraw a
 * certificate, and print what changed.
 *
 * Revocation is the one action in the certificate vertical that has no UI. It is deliberately not a
 * button: it is rare, it is irreversible, and the person clicking it should be able to point at a
 * written reason. What this adds over typing the SQL is the two checks an operator would otherwise
 * forget — that the actor is really an admin, and that the credential has not already been revoked —
 * so the common mistakes fail with a sentence instead of a SQLSTATE.
 *
 * It prints; it never writes `.env.local`. The service-role key is read from the environment, because a
 * script that can write a secret file can also leak one into a shell history.
 *
 * ```sh
 * SUPABASE_SERVICE_ROLE_KEY=... npm run certificate:revoke -- ABCD...WXYZ --actor 3f2a... --reason "test order"
 * ```
 */
import { isCredentialId, normaliseCredentialId } from "../lib/certificate/credential.js";
import { progressClient } from "../lib/progress/write.js";

const USAGE =
  'usage: npm run certificate:revoke -- <credential-id> --actor <admin-user-uuid> [--reason "why it was withdrawn"]';

function fail(message) {
  console.error(`certificate:revoke: ${message}`);
  process.exit(1);
}

/** `--flag value` and `--flag=value`, with the first bare word as the credential. */
function parse(argv) {
  const out = { credential: null, actor: null, reason: null };
  for (let index = 0; index < argv.length; index += 1) {
    const word = argv[index];
    if (word === "--actor" || word === "--reason") {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) fail(`${word} needs a value\n${USAGE}`);
      out[word.slice(2)] = value;
      index += 1;
    } else if (word.startsWith("--actor=") || word.startsWith("--reason=")) {
      const [flag, ...rest] = word.split("=");
      out[flag.slice(2)] = rest.join("=");
    } else if (word.startsWith("--")) {
      fail(`unknown option ${word}\n${USAGE}`);
    } else if (out.credential === null) {
      out.credential = word;
    } else {
      fail(`only one credential id at a time\n${USAGE}`);
    }
  }
  return out;
}

const argv = parse(process.argv.slice(2));
const credential = normaliseCredentialId(argv.credential ?? "");
if (!isCredentialId(credential)) fail(`that is not a credential id (sixteen symbols, no I, L, O or U)\n${USAGE}`);
if (!argv.actor) fail(`--actor is required: revocation is logged against the admin who did it\n${USAGE}`);

const client = progressClient();
if (!client) fail("SUPABASE_SERVICE_ROLE_KEY (with NEXT_PUBLIC_SUPABASE_URL and …_ANON_KEY) is unset. Nothing changed.");

const { data: profile, error: profileError } = await client
  .from("profiles")
  .select("id, role")
  .eq("id", argv.actor)
  .maybeSingle();
if (profileError) fail(`could not read the actor's profile: ${profileError.message}`);
if (!profile) fail(`no profile with id ${argv.actor} — the actor must be a real account`);
if (profile.role !== "admin" && profile.role !== "owner") {
  fail(`that account is "${profile.role}", not an admin or owner. Nothing changed.`);
}

// Checked before the call so a second run says "already revoked" rather than surfacing `P0002`
// as an unexplained failure. The database still owns the real guard; this is the readable one.
const { data: held, error: readError } = await client
  .from("certificates")
  .select("credential_id, display_name, issued_at, revoked_at")
  .eq("credential_id", credential)
  .maybeSingle();
if (readError) fail(`could not read the certificate: ${readError.message}`);
if (!held) fail(`no certificate with credential ${credential}. Nothing changed.`);
if (held.revoked_at) fail(`${credential} was already revoked on ${held.revoked_at}. Revocation is one-way.`);

const { data: revoked, error } = await client.rpc("revoke_certificate", {
  p_credential: credential,
  p_reason: argv.reason ?? null,
  p_actor: argv.actor,
});
if (error) fail(`the database refused: ${error.message}`);
if (!revoked) fail(`the database reported success but returned no row. Verify by hand before retrying.`);

console.log(`revoked ${revoked.credential_id}`);
console.log(`  holder     ${revoked.display_name}`);
console.log(`  issued     ${revoked.issued_at}`);
console.log(`  revoked    ${revoked.revoked_at}`);
console.log(`  reason     ${revoked.revoked_reason ?? "(none given)"}`);
console.log(`  actor      ${revoked.revoked_by}`);
console.log(`  record     /verify/${revoked.credential_id} — still resolves, and now says revoked`);
