// The profile a learner owns: username, display name, LinkedIn. Two of the three are public-ish
// facts that appear in their account page; the rules here are the earlier, friendlier gate, and the
// same rule runs in the server action, so a form that says "3–32 characters" cannot be bypassed by
// posting it directly.
//
// Uniqueness is *not* checked here. `profiles.username` is `citext unique`, so the database decides,
// and a collision comes back as `23505` — one source of truth rather than a lookup that can race.
//
// Pure and DOM-free, so `tests/profile-rules.test.js` imports these instead of restating them.

import { DEFAULT_NEXT } from "./redirect.js";

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 32;
export const NAME_MAX = 80;

/** Letters, digits, dot, underscore and hyphen, starting and ending with a letter or digit. */
const USERNAME = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/i;

// Handles that would read as staff, as another part of the product, or as a route on this site. A
// learner who signs up as `support` or `admin` is impersonating the deployment, not choosing a name.
const RESERVED = new Set([
  "account",
  "admin",
  "administrator",
  "api",
  "billing",
  "excel",
  "feedback",
  "help",
  "learn",
  "login",
  "moderator",
  "owner",
  "pricing",
  "privacy",
  "reset",
  "root",
  "signup",
  "staff",
  "support",
  "system",
  "terms",
  "welcome",
]);

const LINKEDIN_HOSTS = new Set(["linkedin.com", "www.linkedin.com"]);

/** `null` when the value is blank, otherwise the canonical handle. */
export function parseUsername(value) {
  const handle = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!handle) return { ok: false, error: "Choose a username." };
  if (handle.length < USERNAME_MIN) {
    return { ok: false, error: `Use at least ${USERNAME_MIN} characters.` };
  }
  if (handle.length > USERNAME_MAX) {
    return { ok: false, error: `Use at most ${USERNAME_MAX} characters.` };
  }
  if (!USERNAME.test(handle)) {
    return {
      ok: false,
      error: "Use letters, digits, dots, underscores and hyphens, and start and end with a letter or digit.",
    };
  }
  if (RESERVED.has(handle)) return { ok: false, error: "That username is reserved. Pick another." };
  return { ok: true, value: handle };
}

/** Optional: an empty display name is a blank, not an error. */
export function parseDisplayName(value) {
  const name = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (name.length > NAME_MAX) return { ok: false, error: `Use at most ${NAME_MAX} characters.` };
  return { ok: true, value: name === "" ? null : name };
}

/**
 * Optional LinkedIn address, normalised to `https://www.linkedin.com/...`.
 *
 * Accepting the bare host is deliberate — people paste `linkedin.com/in/…` from a CV — but nothing
 * else is: another host here would be a way to get an arbitrary link onto the account page.
 */
export function parseLinkedin(value) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (raw === "") return { ok: true, value: null };

  let url;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return { ok: false, error: "That does not look like a LinkedIn address." };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, error: "Use an https:// address." };
  }
  if (!LINKEDIN_HOSTS.has(url.hostname.toLowerCase())) {
    return { ok: false, error: "Use a linkedin.com address." };
  }
  const path = url.pathname.replace(/\/+$/, "");
  if (path === "" || path === "/") return { ok: false, error: "Point at your profile, not the front page." };
  // Query strings on a LinkedIn share link carry tracking ids, not meaning.
  return { ok: true, value: `https://www.linkedin.com${path}` };
}

/**
 * The form the profile page posts, checked field by field. One error per field, because the form
 * shows the first sentence and highlights nothing it cannot explain.
 *
 * @returns {{ok: true, value: {username: string, display_name: string|null, linkedin_url: string|null}}
 *   | {ok: false, errors: {username?: string, display_name?: string, linkedin_url?: string}}}
 */
export function parseProfile({ username, display_name, linkedin_url } = {}) {
  const errors = {};
  const handle = parseUsername(username);
  if (!handle.ok) errors.username = handle.error;
  const name = parseDisplayName(display_name);
  if (!name.ok) errors.display_name = name.error;
  const linkedin = parseLinkedin(linkedin_url);
  if (!linkedin.ok) errors.linkedin_url = linkedin.error;

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: { username: handle.value, display_name: name.value, linkedin_url: linkedin.value },
  };
}

/** Where a first-time account is sent: the empty display name is the signal, and it is one the
 *  learner can actually fill in. A profile that could not be read is *not* "incomplete" — forcing a
 *  page because of a failed read would be a redirect the learner cannot satisfy. */
export function needsOnboarding(profile) {
  if (!profile || typeof profile !== "object") return false;
  const name = typeof profile.display_name === "string" ? profile.display_name.trim() : "";
  return name === "";
}

export const ONBOARDING_PATH = "/account/profile?welcome=1";

/** After a sign-in: the page they asked for, unless they asked for nothing and have no name yet. */
export function afterSignIn(next, profile) {
  const target = typeof next === "string" && next !== "" ? next : DEFAULT_NEXT;
  return needsOnboarding(profile) && target === DEFAULT_NEXT ? ONBOARDING_PATH : target;
}
