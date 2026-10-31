// The accounts switch, read at request time.
//
// `authConfig()` is a plain environment read, which means the build can evaluate it — and a build
// machine has no Supabase project, so every page that asked it early was prerendered into "accounts are
// not configured" and kept saying that after deployment. A deployment is one image with accounts
// switched on or off (see `docs/plans/parity/reviews/`), so this answer belongs to the request, not to
// the artifact: `connection()` stops the prerender pass here and the value is read per request.
//
// Anything outside a React render (proxy, route handlers, server actions) is already request-time and
// should keep calling `authConfig()` directly.

import { connection } from "next/server";

import { authConfig } from "./config.js";

/**
 * @returns {Promise<ReturnType<typeof authConfig>>} the same shape `authConfig()` returns, evaluated
 * for this request rather than for the build.
 */
export async function requestAuthConfig() {
  await connection();
  return authConfig();
}
