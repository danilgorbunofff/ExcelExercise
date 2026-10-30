/**
 * The server half of the paywall: the boundary a reader cannot skip with `view-source`.
 *
 * The drill asks `gateFor` in the browser and paints a wall; a request for the same URL asks the same
 * function here and gets a redirect. One rule, two callers, so "lesson 4 prompts, lesson 5 walls"
 * cannot become three sentences that drift.
 *
 * Two things this module deliberately cannot see:
 * - The trial and the free pass are `localStorage` facts, i.e. the browser's honour system, and a
 *   request carries no proof of either. With enforcement on, a client-side trial does not open a
 *   server wall — which is why enforcement is a flag that waits for checkout rather than a default:
 *   turning it on without billing would dead-end the reader at `/pricing`.
 * - Entitlement is the database's answer (`is_entitled`), never a cookie and never a claim in a token.
 */
import { gateFor } from "../legacy/src/client/state.js";
import { authConfig } from "./auth/config.js";

export const PAYWALL_PATH = "/pricing";

const FLAG_VARIABLE = "PAYWALL";
const ON = new Set(["on", "1", "true"]);

/**
 * Enforcement is off unless someone asks for it *and* there are accounts to ask: without a signed-in
 * reader there is no entitlement to check and no way back from `/pricing`.
 */
export function paywallEnforced(env = process.env) {
  const flag = String(env[FLAG_VARIABLE] ?? "").trim().toLowerCase();
  return ON.has(flag) && authConfig(env).enabled;
}

/**
 * `null` means serve the lesson; otherwise the path to send the reader to. The prompt drill is
 * served on purpose: its "continue free this once" button is client-side, and a redirect here would
 * make the button unreachable.
 */
export function paywallDecision({ entry, freeLessonCount, entitled = false, enforced = true }) {
  if (!enforced || entitled || !entry) return null;
  return gateFor({ free: entry.free, number: entry.number, freeLessonCount }, null) === "paywall"
    ? PAYWALL_PATH
    : null;
}

/** The database's answer, and only the database's: a failure to ask is a no, not a yes. */
export async function entitledFor(supabase, user) {
  if (!supabase || !user) return false;
  const { data, error } = await supabase.rpc("is_entitled", { uid: user.id });
  return error ? false : data === true;
}
