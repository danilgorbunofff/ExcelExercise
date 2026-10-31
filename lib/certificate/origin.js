// The origin this request arrived on, for the two places a certificate has to write down a full URL:
// the LinkedIn deep link and the line a printed record carries. `headers()` is request-scoped, so this
// is only callable from a server component or route handler — every caller is one.
import { headers } from "next/headers";

/**
 * @returns {Promise<string>} `https://host`, or `http://localhost:3000` when the deployment passes no
 *   `Host` header at all (a bare `next build` prerender, or a health check that asks for markup).
 */
export async function requestOrigin() {
  const head = await headers();
  const proto = head.get("x-forwarded-proto") ?? "http";
  const host = head.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}
