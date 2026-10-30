import Link from "next/link";
import { Suspense } from "react";

import { authConfig } from "../../lib/auth/config.js";
import { needsOnboarding } from "../../lib/auth/profile.js";
import { currentUser } from "../../lib/auth/server.js";
import { AuthCard, Links, Notice } from "../auth/ui.js";
import { AuthShell } from "../auth/shell.js";
import { signOut } from "../auth/actions.js";

export const metadata = {
  title: "Your account",
  description: "Your profile, your plan, and the way out.",
  robots: { index: false, follow: false },
};

// The proxy already refuses this route without a session; the page checks again because a deployment
// without accounts configured skips the proxy entirely and must not render a half-empty profile.
export const instant = false;

function Row({ label, children }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

async function AccountScreen() {
  const config = authConfig();
  if (!config.enabled) {
    return (
      <AuthCard title="Your account">
        <Notice>{config.reason}</Notice>
        <Links items={[{ href: "/learn", label: "Your drills" }]} />
      </AuthCard>
    );
  }

  const { supabase, user } = await currentUser();
  if (!user) {
    return (
      <AuthCard title="Your account">
        <Notice>You are signed out.</Notice>
        <Links items={[{ href: "/login?next=%2Faccount", label: "Sign in" }]} />
      </AuthCard>
    );
  }

  // Both reads go through row level security as this user: the profile because the policy is
  // `id = auth.uid()`, the entitlement because `is_entitled` ignores any id but your own.
  const [{ data: profile }, { data: entitled }] = await Promise.all([
    supabase
      .from("profiles")
      .select("username, display_name, linkedin_url, role, created_at")
      .eq("id", user.id)
      .maybeSingle(),
    supabase.rpc("is_entitled", { uid: user.id }),
  ]);

  const name = profile?.display_name?.trim() || profile?.username || user.email;
  return (
    <AuthCard title="Your account" lede={`Signed in as ${name}.`}>
      {needsOnboarding(profile) ? (
        <Notice>
          Your profile has no display name yet.{" "}
          <Link href="/account/profile?welcome=1">Finish your profile</Link>.
        </Notice>
      ) : null}
      <dl className="auth-profile">
        <Row label="Email">{user.email}</Row>
        <Row label="Username">{profile?.username ?? "—"}</Row>
        <Row label="LinkedIn">
          {profile?.linkedin_url ? (
            <a href={profile.linkedin_url} rel="me noopener noreferrer" target="_blank">
              {profile.linkedin_url.replace(/^https:\/\/www\.linkedin\.com/, "")}
            </a>
          ) : (
            "—"
          )}
        </Row>
        <Row label="Plan">{entitled ? "Paid" : "Free"}</Row>
        <Row label="Member since">
          {profile?.created_at ? new Date(profile.created_at).toISOString().slice(0, 10) : "—"}
        </Row>
      </dl>
      <form action={signOut}>
        <button className="auth-submit" type="submit">
          Sign out
        </button>
      </form>
      <section className="auth-data" aria-labelledby="data-rights">
        <h2 id="data-rights">Your data</h2>
        <p>
          You can take a copy of everything this site holds about you, or end the account. Ending it
          erases your profile, your progress and your saved answers straight away, and it cannot be
          undone. Payment records are kept without your name.{" "}
          <a href="/privacy">What is kept, and for how long</a>.
        </p>
        <a href="/api/account/export" download>
          Download your data
        </a>
        <form action="/api/account/delete" method="post" className="auth-danger">
          <label htmlFor="confirm">
            Type <strong>delete my account</strong> to confirm
          </label>
          <input
            autoComplete="off"
            id="confirm"
            name="confirm"
            pattern="\s*[Dd]elete [Mm]y [Aa]ccount\s*"
            required
            type="text"
          />
          <button className="auth-submit" type="submit">
            Delete my account
          </button>
        </form>
      </section>
      <Links
        items={[
          { href: "/account/profile", label: "Edit your profile" },
          { href: "/learn", label: "Your drills" },
          { href: "/reset", label: "Change your password" },
        ]}
      />
    </AuthCard>
  );
}

export default function AccountPage() {
  return (
    <AuthShell counter="Your account">
      <Suspense fallback={<p className="auth-notice">Loading your account…</p>}>
        <AccountScreen />
      </Suspense>
    </AuthShell>
  );
}
