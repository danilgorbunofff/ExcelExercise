import { Suspense } from "react";

import { t } from "../../legacy/src/site/messages.mjs";

import { AuthShell } from "../auth/shell.js";
import { authConfig } from "../../lib/auth/config.js";
import { AuthCard, Links, Loading, Notice } from "../auth/ui.js";

import { ResetForm } from "./form.js";

export const metadata = {
  title: t("auth.reset.title"),
  description: t("auth.reset.meta"),
  robots: { index: false, follow: true },
};

// No search params here, but the form posts a server action that reads the request host, so the page
// is rendered per request rather than frozen at build time.
export const instant = false;

export default function ResetPage() {
  const config = authConfig();
  return (
    <AuthShell counter={t("auth.reset.title")}>
      <AuthCard
        title={t("auth.reset.title")}
        lede={t("auth.reset.lede")}
      >
        {config.enabled ? null : <Notice>{config.reason}</Notice>}
        <Suspense fallback={<Loading />}>
          <ResetForm disabled={!config.enabled} />
        </Suspense>
        <Links items={[{ href: "/login", label: t("auth.reset.back") }]} />
      </AuthCard>
    </AuthShell>
  );
}
