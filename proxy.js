// The request-side half of the session: refresh the token pair, and send signed-out visitors to
// `/login?next=…` before the page renders.
//
// Next 16 renamed this file convention from `middleware.js` to `proxy.js` (the export is `proxy`),
// and that is the name used here. The matcher covers the pages, not the assets: a request for
// `/assets/...` has no session to refresh.
//
// With accounts unconfigured (CI, a fresh clone) this returns immediately: no network call, no
// cookie work, and the app behaves exactly as it did before phase 4.

import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";

import { authConfig } from "./lib/auth/config.js";
import { loginUrl } from "./lib/auth/redirect.js";

// Everything under `/account` needs a session. Keep the list here rather than duplicating it in each
// page: a page that forgets to check would render a signed-out shell and look like a bug.
const GATED = [/^\/account(?:\/|$)/];

export async function proxy(request) {
  const config = authConfig();
  if (!config.enabled) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });

  // `getUser()` is what refreshes an expired access token, so this call is the session keep-alive,
  // not just the gate.
  const { data, error } = await supabase.auth.getUser();
  const user = error ? null : data.user ?? null;

  if (!user && GATED.some((pattern) => pattern.test(request.nextUrl.pathname))) {
    const next = request.nextUrl.pathname + request.nextUrl.search;
    return NextResponse.redirect(new URL(loginUrl(next), request.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|assets|favicon\.ico|robots\.txt|sitemap\.xml).*)"],
};
