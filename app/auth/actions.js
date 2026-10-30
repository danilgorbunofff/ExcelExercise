"use server";

// The account mutations. Each one: refuse when accounts are unconfigured, validate with the pure rules
// in `lib/auth/credentials.js`, call GoTrue, then either redirect on success or hand a sentence back to
// the form (`lib/auth/errors.js` decides which sentences are rewritten).

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { NOT_CONFIGURED, authConfig } from "../../lib/auth/config.js";
import { friendly } from "../../lib/auth/errors.js";
import { validateCredentials } from "../../lib/auth/credentials.js";
import { DEFAULT_NEXT, safeNext } from "../../lib/auth/redirect.js";
import { serverClient } from "../../lib/auth/server.js";

/** The first credential problem, or null. The forms show one sentence at a time on purpose. */
function firstProblem({ errors }) {
  return errors.email ?? errors.password ?? null;
}

/** The origin the request arrived on, so emailed links work on localhost and in production alike. */
async function absolute(path, next) {
  const head = await headers();
  const host = head.get("x-forwarded-host") ?? head.get("host") ?? "localhost:3000";
  const proto = head.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const url = new URL(path, `${proto}://${host}`);
  if (next) url.searchParams.set("next", next);
  return url.toString();
}

export async function signIn(_prev, formData) {
  const config = authConfig();
  if (!config.enabled) return { error: NOT_CONFIGURED };

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(formData.get("next"));

  const problem = firstProblem(validateCredentials({ email, password }));
  if (problem) return { error: problem };

  const supabase = await serverClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: friendly(error.message) };

  redirect(next);
}

export async function signUp(_prev, formData) {
  const config = authConfig();
  if (!config.enabled) return { error: NOT_CONFIGURED };

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const displayName = String(formData.get("display_name") ?? "").trim();
  const next = safeNext(formData.get("next"));

  const problem = firstProblem(validateCredentials({ email, password }));
  if (problem) return { error: problem };
  if (displayName.length > 80) return { error: "Keep the display name under 80 characters." };

  const supabase = await serverClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: await absolute("/auth/callback", next),
      data: displayName ? { display_name: displayName } : {},
    },
  });
  if (error) return { error: friendly(error.message) };

  // With email confirmation on, `session` is null and the trigger-created profile is already there;
  // the user just has not proved the address yet.
  if (!data.session) {
    return { ok: `Check ${email} for the confirmation link, then sign in.` };
  }
  redirect(next);
}

export async function sendMagicLink(_prev, formData) {
  const config = authConfig();
  if (!config.enabled) return { error: NOT_CONFIGURED };

  const email = String(formData.get("email") ?? "").trim();
  const next = safeNext(formData.get("next"));
  const problem = firstProblem(validateCredentials({ email, password: "" }, { requirePassword: false }));
  if (problem) return { error: problem };

  const supabase = await serverClient();
  // `shouldCreateUser` is on: a link is also how someone signs up without choosing a password, and
  // the trigger gives them a profile exactly as a password sign-up would.
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: await absolute("/auth/callback", next), shouldCreateUser: true },
  });
  if (error) return { error: friendly(error.message) };

  return { ok: `If ${email} can receive mail, a sign-in link is on its way.` };
}

export async function requestReset(_prev, formData) {
  const config = authConfig();
  if (!config.enabled) return { error: NOT_CONFIGURED };

  const email = String(formData.get("email") ?? "").trim();
  const problem = firstProblem(validateCredentials({ email, password: "" }, { requirePassword: false }));
  if (problem) return { error: problem };

  const supabase = await serverClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: await absolute("/auth/callback", "/reset/password"),
  });
  if (error) return { error: friendly(error.message) };

  // Same sentence whether or not the address exists, so this page cannot be used to enumerate
  // accounts one address at a time.
  return { ok: `If ${email} has an account, a reset link is on its way.` };
}

export async function setNewPassword(_prev, formData) {
  const config = authConfig();
  if (!config.enabled) return { error: NOT_CONFIGURED };

  const password = String(formData.get("password") ?? "");
  // Only the password rule matters here: the address came from the recovery link, not from the form.
  const problem = firstProblem(validateCredentials({ email: "recovery@example.com", password }));
  if (problem) return { error: problem };

  const supabase = await serverClient();
  // The recovery link already established a session via /auth/callback, so `updateUser` is all the
  // remaining work. `nonce: null` is not needed: no other factors exist in this phase.
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: friendly(error.message) };

  redirect(DEFAULT_NEXT);
}

export async function signOut() {
  const supabase = await serverClient();
  if (supabase) await supabase.auth.signOut();
  redirect("/");
}
