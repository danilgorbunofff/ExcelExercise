// Where the app finds its Supabase project, and what it does when it cannot.
//
// The two values are the project URL and the publishable (anon) key — both are public by design and
// ship in the browser bundle; row level security is what protects the data. Nothing here reads the
// service-role key: that one is only used by webhooks and batch jobs, server-side.
//
// Unconfigured is a normal state, not an error: CI and a fresh clone have no stack, so the auth
// pages render an explanation instead of throwing, and `proxy.js` returns early.

export const URL_VARIABLE = "NEXT_PUBLIC_SUPABASE_URL";
export const KEY_VARIABLE = "NEXT_PUBLIC_SUPABASE_ANON_KEY";

// The shape the UI needs when accounts are not set up, so every caller says the same thing.
export const NOT_CONFIGURED = `Accounts are not configured on this deployment (${URL_VARIABLE} and ${KEY_VARIABLE} are unset).`;

/**
 * @returns {{ enabled: boolean, url: string | null, anonKey: string | null, reason: string | null }}
 */
export function authConfig(env = process.env) {
  const rawUrl = (env[URL_VARIABLE] ?? "").trim();
  const anonKey = (env[KEY_VARIABLE] ?? "").trim();
  if (!rawUrl || !anonKey) {
    return { enabled: false, url: null, anonKey: null, reason: NOT_CONFIGURED };
  }
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return {
      enabled: false,
      url: null,
      anonKey: null,
      reason: `${URL_VARIABLE} is not a URL: ${rawUrl}`,
    };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return {
      enabled: false,
      url: null,
      anonKey: null,
      reason: `${URL_VARIABLE} must be http or https, not ${parsed.protocol}`,
    };
  }
  // `https://project.supabase.co/` and `https://project.supabase.co` are the same project; the
  // clients append `/auth/v1` themselves, and a doubled slash in the middle is a proxy-level 404.
  return {
    enabled: true,
    url: parsed.origin + parsed.pathname.replace(/\/+$/, ""),
    anonKey,
    reason: null,
  };
}

/** True when accounts are switched on, for callers that only need the boolean. */
export function accountsEnabled(env = process.env) {
  return authConfig(env).enabled;
}
