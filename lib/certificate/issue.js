/**
 * The server half of certification: read a learner's progress, ask the database to issue, read a
 * credential back for a stranger.
 *
 * `issue_certificate` in `0013_certificates.sql` is the only writer. This file's job is to be honest
 * about what happened to it:
 *
 *   * **An existing certificate is a success, not a conflict.** A learner who reloads the page and
 *     submits again gets the credential they already hold — that is the acceptance criterion, and the
 *     database returns the same row rather than raising.
 *   * **A credential-id collision is retried, not surfaced.** 80 random bits colliding is not a thing
 *     that happens, but two learners drawing the same id in the same second is the only failure that
 *     would be *our* fault and invisible to the learner, so it is retried with a fresh id.
 *   * **Not eligible is explained with numbers.** The RPC counts completions itself and puts the two
 *     numbers in the error message; the route passes that through instead of re-deriving a friendlier,
 *     different version of the truth.
 */
import { credentialId } from "./credential.js";
import { daysTaken, eligibility, requiredLessonIds } from "./eligibility.js";

/** How many fresh credential ids to try before giving up on a collision. */
const ATTEMPTS = 3;

/** The learner's own finished lessons, under RLS. Also what `daysTaken` is computed from. */
export async function loadProgress(supabase) {
  const { data, error } = await supabase
    .from("lesson_progress")
    .select("lesson_id, status, completed_at")
    .limit(2000);
  if (error) return { rows: [], error: error.message };
  return { rows: data ?? [], error: null };
}

/** The certificate this learner already holds, or `null`. */
export async function readCertificate(client, userId) {
  const { data, error } = await client
    .from("certificates")
    .select("credential_id, display_name, issued_at, lesson_count, days_taken, revoked_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return { row: null, error: error.message };
  return { row: data ?? null, error: null };
}

/**
 * Issue, or return what was already issued.
 *
 * @param {object} client service-role client — the only thing allowed to write the table
 * @param {{ userId: string, name: string, track: object, progress: Array }} input
 * @returns {Promise<{ok: true, row: object, existing: boolean} | {ok: false, status: number, error: string}>}
 */
export async function issue(client, { userId, name, track, progress }) {
  const required = requiredLessonIds(track);
  const state = eligibility(progress, required);
  if (!state.eligible) {
    return {
      ok: false,
      status: 409,
      error: `Finish every lesson first — ${state.finished} of ${state.total} done, ${state.missing.length} to go.`,
    };
  }

  const days = daysTaken(progress, required);
  let lastMessage = "the certificate could not be issued just now";

  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    const { data, error } = await client.rpc("issue_certificate", {
      p_user: userId,
      p_name: name,
      p_credential: credentialId(),
      p_required: required,
      p_days: days,
    });
    if (!error) {
      const row = Array.isArray(data) ? data[0] : data;
      if (row && typeof row.credential_id === "string") {
        return { ok: true, row, existing: false };
      }
      lastMessage = "the database returned no certificate row";
      continue;
    }

    // `RESTRICT_VIOLATION`/`CHECK_VIOLATION` are the database refusing on purpose — a name that fails
    // the check, or a learner who stopped being eligible between the read and the write. Retrying
    // cannot help either, so they are reported as they are.
    const code = error.code ?? "";
    if (code === "check_violation" || code === "restrict_violation" || code === "insufficient_privilege") {
      return { ok: false, status: 409, error: error.message };
    }
    // Anything else is most likely the credential-id unique index; try again with a new id.
    lastMessage = error.message;
  }

  return { ok: false, status: 502, error: lastMessage };
}

/**
 * What a stranger's browser is told about a credential id.
 *
 * The RPC is anonymous on purpose and returns the six fields the page shows. A database that is not
 * configured is a third state — "cannot check right now" — and is deliberately not folded into "not
 * found": telling someone their certificate does not exist when the deployment has no database would be
 * a false claim about their record.
 */
export async function verify(client, credential) {
  const { data, error } = await client.rpc("verify_certificate", { p_credential: credential });
  if (error) return { row: null, error: error.message };
  const row = Array.isArray(data) ? data[0] : data;
  return { row: row ?? null, error: null };
}
