import { Suspense } from "react";

import { AuthShell } from "../../auth/shell.js";
import { authConfig } from "../../../lib/auth/config.js";
import { currentUser } from "../../../lib/auth/server.js";
import { AuthCard, Links, Notice } from "../../auth/ui.js";

import { NewPasswordForm } from "./form.js";

export const metadata = {
  title: "Set a new password",
  robots: { index: false, follow: false },
};

export const instant = false;

// The recovery link lands on /auth/callback, which exchanges the code for a session and forwards here.
// The session is what this screen checks: without it there is nothing to change the password of.
async function NewPasswordScreen() {
  const config = authConfig();
  if (!config.enabled) {
    return (
      <AuthCard title="Set a new password">
        <Notice>{config.reason}</Notice>
        <Links items={[{ href: "/login", label: "Back to sign in" }]} />
      </AuthCard>
    );
  }

  const { user } = await currentUser();
  if (!user) {
    return (
      <AuthCard title="Set a new password">
        <Notice>Open the link from your email first — it is what proves the address is yours.</Notice>
        <Links items={[{ href: "/reset", label: "Send me a new link" }]} />
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Set a new password" lede={`Signed in as ${user.email}.`}>
      <NewPasswordForm />
    </AuthCard>
  );
}

export default function NewPasswordPage() {
  return (
    <AuthShell counter="Set a new password">
      <Suspense fallback={<p className="auth-notice">Checking your link…</p>}>
        <NewPasswordScreen />
      </Suspense>
    </AuthShell>
  );
}
