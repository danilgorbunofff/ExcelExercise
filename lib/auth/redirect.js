// The `?next=` contract: after a sign-in, where does the browser go?
//
// It goes exactly where the visitor was, and nowhere else. `next` arrives in a URL, so it is
// attacker-controlled: `//evil.com` and `/\evil.com` are both read as protocol-relative by browsers,
// and a scheme-prefixed value needs no help at all. Only a same-origin *path* is accepted, and
// anything else falls back to the dashboard rather than producing an open redirect.

export const DEFAULT_NEXT = "/learn";

export function safeNext(value, fallback = DEFAULT_NEXT) {
  if (typeof value !== "string") return fallback;
  const candidate = value.trim();
  if (candidate === "") return fallback;
  if (!candidate.startsWith("/")) return fallback;
  // `//host` and `/\host` are both protocol-relative once the browser normalises backslashes.
  if (candidate.startsWith("//") || candidate.startsWith("/\\")) return fallback;
  if (candidate.includes("\\")) return fallback;
  // Control characters are stripped by some clients and can reassemble a scheme; CR/LF also split
  // headers anywhere the value is reused. Refuse the whole value rather than sanitising it.
  if (/[\u0000-\u001f\u007f]/.test(candidate)) return fallback;
  return candidate;
}

/** Builds `/login?next=<encoded>` for the proxy and the pages, so the encoding has one owner. */
export function loginUrl(next, extra = {}) {
  const params = new URLSearchParams();
  const target = safeNext(next, "");
  if (target) params.set("next", target);
  for (const [key, value] of Object.entries(extra)) {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `/login?${query}` : "/login";
}
