import { Suspense } from "react";

import { t } from "../../legacy/src/site/messages.mjs";

import { AuthShell } from "../auth/shell.js";
import { Loading } from "../auth/ui.js";

import { SignupScreen } from "./screen.js";

export const metadata = {
  title: t("auth.signup.title"),
  description: t("auth.signup.meta"),
  robots: { index: false, follow: true },
};

export const instant = false;

export default function SignupPage({ searchParams }) {
  return (
    <AuthShell counter={t("auth.signup.title")}>
      <Suspense fallback={<Loading />}>
        <SignupScreen searchParams={searchParams} />
      </Suspense>
    </AuthShell>
  );
}
