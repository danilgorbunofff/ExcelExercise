import { Suspense } from "react";

import { t } from "../../legacy/src/site/messages.mjs";

import { AuthShell } from "../auth/shell.js";
import { Loading } from "../auth/ui.js";

import { LoginScreen } from "./screen.js";

export const metadata = {
  title: t("auth.login.title"),
  description: t("auth.login.meta"),
  robots: { index: false, follow: true },
};

// Sibling pages are prefetched; this one reads `?next=`, so it cannot answer before the request.
export const instant = false;

export default function LoginPage({ searchParams }) {
  return (
    <AuthShell counter={t("auth.login.title")}>
      <Suspense fallback={<Loading />}>
        <LoginScreen searchParams={searchParams} />
      </Suspense>
    </AuthShell>
  );
}
