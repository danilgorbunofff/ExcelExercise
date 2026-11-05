/**
 * The server's last chance to say something went wrong.
 *
 * `onRequestError` is Next's own hook: it fires for a failed render, a failed route handler, a failed
 * action and a failed Proxy, in the Node runtime, once per error, with the route it happened on. That
 * is the whole server-side net the site was missing — the error boundary in `app/error.js` only ever
 * sees what the browser rendered, which is nothing at all when the failure is upstream of the HTML.
 *
 * `register` is intentionally absent. There is no tracing vendor at launch (a recorded decision), and
 * an empty `register` would suggest otherwise.
 */
import { reportError } from "./lib/report-error.js";

export async function onRequestError(err, request, context) {
  await reportError(err, { request, context });
}
