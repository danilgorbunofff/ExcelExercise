// The server-side Supabase client: one per request, session read from the cookies.
//
// `cookies()` is a request API, so this only works inside a request scope: a server action, a route
// handler, or a component under a <Suspense> boundary (reading it outside one is a build error with
// Cache Components enabled). `setAll` writes through to the response, which is what makes a token
// refresh survive the request that triggered it.

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";

import { authConfig } from "./config.js";

/**
 * @returns {Promise<import("@supabase/supabase-js").SupabaseClient | null>} null when accounts are
 * not configured on this deployment, which callers render as a notice rather than an error.
 */
export async function serverClient() {
  const config = authConfig();
  if (!config.enabled) return null;
  // A session belongs to one request and never to the static shell. `cookies()` alone does not say so
  // loudly enough: during the prerender pass it hands back an empty store rather than stopping, and
  // `createServerClient` then reads the clock to work out token expiry — which is what a prerender is
  // not allowed to do. Waiting for a real request here keeps the whole session path off the shell.
  await connection();
  const store = await cookies();
  return createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        for (const { name, value, options } of list) {
          try {
            store.set(name, value, options);
          } catch {
            // A render is not allowed to set cookies. The proxy refreshes the session on the next
            // navigation, so swallowing here costs one refresh, not the session.
          }
        }
      },
    },
  });
}

/**
 * The authenticated user for this request, or null. Uses `getUser()` rather than `getSession()`:
 * only `getUser()` validates the token with the auth server, so a forged cookie cannot impersonate.
 */
export async function currentUser() {
  const supabase = await serverClient();
  if (!supabase) return { supabase: null, user: null };
  const { data, error } = await supabase.auth.getUser();
  return { supabase, user: error ? null : data.user ?? null };
}
