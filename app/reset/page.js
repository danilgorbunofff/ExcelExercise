import { Suspense } from "react";

import { AuthShell } from "../auth/shell.js";
import { authConfig } from "../../lib/auth/config.js";
import { AuthCard, Links, Loading, Notice } from "../auth/ui.js";

import { ResetForm } from "./form.js";

export const metadata = {
  title: "Reset your password",
  description: "Request a password reset link for your Excel drill account.",
  robots: { index: false, follow: true },
};

// No search params here, but the form posts a server action that reads the request host, so the page
// is rendered per request rather than frozen at build time.
export const instant = false;

export default function ResetPage() {
  const config = authConfig();
  return (
    <AuthShell counter="Reset your password">
      <AuthCard
        title="Reset your password"
        lede="We email you a link that signs you in once, so you can set a new password."
      >
        {config.enabled ? null : <Notice>{config.reason}</Notice>}
        <Suspense fallback={<Loading />}>
          <ResetForm disabled={!config.enabled} />
        </Suspense>
        <Links items={[{ href: "/login", label: "Back to sign in" }]} />
      </AuthCard>
    </AuthShell>
  );
}
