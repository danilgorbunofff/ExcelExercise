import { t } from "../../legacy/src/site/messages.mjs";
import { requestAuthConfig } from "../../lib/auth/request.js";
import { safeNext } from "../../lib/auth/redirect.js";
import { AuthCard, Links, Notice } from "../auth/ui.js";

import { SignupForm } from "./form.js";

export async function SignupScreen({ searchParams }) {
  const config = await requestAuthConfig();
  const params = await searchParams;
  const next = safeNext(params?.next);

  return (
    <AuthCard
      title={t("auth.signup.title")}
      lede={t("auth.signup.lede")}
    >
      {config.enabled ? null : <Notice>{config.reason}</Notice>}
      <SignupForm next={next} disabled={!config.enabled} />
      <Links items={[{ href: `/login?next=${encodeURIComponent(next)}`, label: t("auth.signup.haveAccount") }]} />
    </AuthCard>
  );
}
