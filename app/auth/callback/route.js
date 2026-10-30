import { NextResponse } from "next/server";

import { authConfig } from "../../../lib/auth/config.js";
import { afterSignIn } from "../../../lib/auth/profile.js";
import { safeNext } from "../../../lib/auth/redirect.js";
import { serverClient } from "../../../lib/auth/server.js";

// The one URL the emailed links point at, for both sign-up confirmation and password recovery.
//
// Supabase's PKCE flow sends `?code=`; this exchanges it for a session (which sets the cookies through
// the server client) and forwards to `?next=`, sanitised by `safeNext` because the value travelled
// through an email. Failures go back to /login with a sentence, never to a 500: a visitor who clicks a
// stale link should land on a page that offers a new one.
export async function GET(request) {
  const url = new URL(request.url);
  const next = safeNext(url.searchParams.get("next"));

  if (!authConfig().enabled) {
    return NextResponse.redirect(new URL("/login", url.origin));
  }

  const denied = url.searchParams.get("error_description") ?? url.searchParams.get("error");
  if (denied) {
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(denied)}`, url.origin));
  }

  const code = url.searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(
      new URL("/login?error=That link is incomplete. Request a new one.", url.origin),
    );
  }

  const supabase = await serverClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error.message)}`, url.origin));
  }

  // A link is how someone arrives without ever passing through the sign-in form, so the first-time
  // profile step has to be decided here too or it would only apply to password sign-ins.
  const { data: profile } = await supabase
    .from("profiles")
    .select("username, display_name")
    .eq("id", data?.user?.id ?? "")
    .maybeSingle();

  return NextResponse.redirect(new URL(afterSignIn(next, profile), url.origin));
}
