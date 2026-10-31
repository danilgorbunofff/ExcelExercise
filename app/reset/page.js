import { Suspense } from "react";

import { t } from "../../legacy/src/site/messages.mjs";

import { AuthShell } from "../auth/shell.js";
import { requestAuthConfig } from "../../lib/auth/request.js";
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

/**
 * The notice and the form are the only parts that depend on the accounts switch, and both are read at
 * request time — so they sit behind the boundary while the card's own words prerender.
 */
async function ResetPanel() {
  const config = await requestAuthConfig();
  return (
    <>
      {config.enabled ? null : <Notice>{config.reason}</Notice>}
      <ResetForm disabled={!config.enabled} />
    </>
  );
}

export default function ResetPage() {
  return (
    <AuthShell counter={t("auth.reset.title")}>
      <AuthCard
        title={t("auth.reset.title")}
        lede={t("auth.reset.lede")}
      >
        <Suspense fallback={<Loading />}>
          <ResetPanel />
        </Suspense>
        <Links items={[{ href: "/login", label: t("auth.reset.back") }]} />
      </AuthCard>
    </AuthShell>
  );
}
