/**
 * The rules behind `/api/account/export` and `/api/account/delete`, kept out of the routes so they
 * can be read — and asserted on — without a database or a request.
 *
 * Two decisions worth naming:
 *
 * * The export is a *document*, not a dump. It carries a format and version, the account it belongs
 *   to, every collection the schema holds for a learner, and the retention list — because "here is
 *   your data" is only honest if it also says what will survive you.
 * * The export deliberately omits Stripe identifiers, password hashes, session tokens and the auth
 *   provider's internal rows. Those are the processor's keys and the auth server's business; none of
 *   them is a record of what the learner did.
 */

/** Bumped only when a consumer would need to tell one document shape from another. */
export const EXPORT_FORMAT = "excel-supreme/export";
export const EXPORT_VERSION = 1;

/**
 * What survives a deletion, and why. Defined by the page that prints it (`legacy/src/site/legal-page.mjs`)
 * and re-exported here, so the sentence a learner reads and the list inside their export cannot drift.
 */
export { RETENTION } from "../legacy/src/site/legal-page.mjs";
import { RETENTION as retained } from "../legacy/src/site/legal-page.mjs";

/** The word a learner types to confirm. A checkbox is too easy to hit; a word has to be meant. */
export const CONFIRMATION = "delete my account";

/** Whether a submitted form carried the confirmation word, ignoring case and padding. */
export function confirmed(value) {
  return typeof value === "string" && value.trim().toLowerCase() === CONFIRMATION;
}

/** `excel-supreme-export-2026-11-02.json` — sortable, and safe on every filesystem we might hit. */
export function exportFilename(at = new Date()) {
  const stamp = at.toISOString().slice(0, 10);
  return `excel-supreme-export-${stamp}.json`;
}

const count = (rows) => (Array.isArray(rows) ? rows.length : 0);

/**
 * The document. Every collection defaults to an empty array rather than `undefined`, so a reader never
 * has to guess whether "no attempts" means none or a failed query — a failed query throws upstream.
 *
 * @param {{user: {id: string, email?: string}, profile?: object|null, progress?: object[],
 *   attempts?: object[], points?: object[], streaks?: object[], entitlements?: object[],
 *   payments?: object[], generatedAt?: Date}} input
 */
export function buildExport({
  user,
  profile = null,
  progress = [],
  attempts = [],
  points = [],
  streaks = [],
  entitlements = [],
  payments = [],
  generatedAt = new Date(),
}) {
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exported_at: generatedAt.toISOString(),
    account: { id: user.id, email: user.email ?? null },
    profile,
    progress,
    attempts,
    points,
    streaks,
    entitlements,
    payments,
    counts: {
      progress: count(progress),
      attempts: count(attempts),
      points: count(points),
      streaks: count(streaks),
      entitlements: count(entitlements),
      payments: count(payments),
    },
    retained_after_deletion: retained,
  };
}
