/**
 * GoTrue's error messages are written for people, so most pass straight through. These few are
 * rewritten because the raw sentence either names an internal code or states something a visitor
 * cannot act on. Anything unmapped is passed through rather than flattened into "something went
 * wrong": a misconfigured SMTP or a closed sign-up is then diagnosable from the page itself.
 */
const REWRITES = [
  [/invalid login credentials/i, "That email and password do not match an account."],
  [/email not confirmed/i, "Confirm your email first — the link is in your inbox."],
  [/user already registered/i, "That email already has an account. Sign in instead."],
  [/password should be at least/i, "Use at least 8 characters."],
  [/over_email_send_rate_limit|rate limit/i, "Too many attempts. Wait a minute, then try again."],
  [/signups not allowed|signup is disabled/i, "Sign-ups are closed on this deployment."],
];

const FALLBACK = "That did not work. Try again.";

/** @returns {string} a sentence safe to show in the form. */
export function friendly(message) {
  const text = String(message ?? "").trim();
  if (!text) return FALLBACK;
  for (const [pattern, rewrite] of REWRITES) if (pattern.test(text)) return rewrite;
  return text;
}
