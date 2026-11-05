/**
 * `POST /api/report-error` — the browser's half of the error record.
 *
 * `app/error.js` is a client component by requirement, so it cannot import the server reporter and it
 * has no business holding a sink URL. It posts the digest and the message here; this route turns them
 * into the same sanitized record and sends it wherever `ERROR_SINK_URL` points. Without this, a render
 * error that only happens in a browser is a line in somebody's console and nothing else.
 *
 * Three refusals, so a public endpoint cannot be turned into a firehose aimed at the sink: a body over
 * 2 KB, a body that is not JSON, and more than thirty reports from one address in ten minutes. Every
 * other outcome is 204 with no body — the caller is an error boundary, and an error boundary that has
 * to handle a failed report is a second bug.
 */
import { reportError } from "../../../lib/report-error.js";

export const MAX_BODY = 2048;

export const RATE = Object.freeze({ window: 10 * 60 * 1000, limit: 30 });
const MAX_ADDRESSES = 5000;

const filed = new Map();

function addressOf(request) {
  const forwarded = request.headers.get("x-forwarded-for") ?? "";
  return forwarded.split(",")[0].trim() || request.headers.get("x-real-ip") || "unknown";
}

function overLimit(address, now) {
  const times = (filed.get(address) ?? []).filter((at) => now - at < RATE.window);
  if (times.length >= RATE.limit) {
    filed.set(address, times);
    return true;
  }
  times.push(now);
  filed.set(address, times);
  if (filed.size > MAX_ADDRESSES) filed.delete(filed.keys().next().value);
  return false;
}

/** Only for tests: the rate map is process state. */
export function resetRate() {
  filed.clear();
}

const NO_STORE = { "cache-control": "no-store" };

export async function POST(request) {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY) return new Response(null, { status: 413 });

  let raw;
  try {
    raw = await request.text();
  } catch {
    return new Response(null, { status: 400 });
  }
  if (raw.length > MAX_BODY) return new Response(null, { status: 413 });

  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response(null, { status: 400 });
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return new Response(null, { status: 400 });
  }

  // A plain object, not an Error: this came over the wire. `errorRecord` reads the same fields either
  // way, so a browser error and a server error produce records of the same shape.
  const asError = {
    name: "ClientRenderError",
    message: typeof body.message === "string" ? body.message : "",
    digest: typeof body.digest === "string" ? body.digest : undefined,
  };

  // The page the reader was on, never this route: that is the fact worth keeping.
  const sources = {
    request: { method: "GET", path: typeof body.path === "string" ? body.path : "/" },
    context: { routeType: "render" },
  };

  // Past the limit the record is still logged, it just does not travel: a flood is worth seeing in
  // the host log, and is exactly the thing not to forward sixty times.
  await reportError(asError, sources, overLimit(addressOf(request), Date.now()) ? { env: {} } : {});

  return new Response(null, { status: 204, headers: NO_STORE });
}
