import { t } from "../../legacy/src/site/messages.mjs";
import { authConfig } from "../../lib/auth/config.js";
import { safeNext } from "../../lib/auth/redirect.js";
import { friendly } from "../../lib/auth/errors.js";
import { AuthCard, ErrorText, Links, Notice } from "../auth/ui.js";

import { LoginForm, MagicLinkForm } from "./form.js";

// Server half of /login: it is the only place that reads `?next=` and the callback's `?error=`, and it
// lives behind the page's Suspense boundary because reading search params is a dynamic read.
export async function LoginScreen({ searchParams }) {
  const config = authConfig();
  const params = await searchParams;
  const next = safeNext(params?.next);
  const failure = typeof params?.error === "string" ? friendly(params.error) : null;

  return (
    <AuthCard
      title={t("auth.login.title")}
      lede={t("auth.login.lede")}
    >
      {config.enabled ? null : <Notice>{config.reason}</Notice>}
      <ErrorText>{failure}</ErrorText>
      <LoginForm next={next} disabled={!config.enabled} />
      {config.enabled ? <MagicLinkForm next={next} disabled={!config.enabled} /> : null}
      <Links
        items={[
          { href: `/signup?next=${encodeURIComponent(next)}`, label: t("auth.login.signup") },
          { href: "/reset", label: t("auth.login.forgot") },
        ]}
      />
    </AuthCard>
  );
}
