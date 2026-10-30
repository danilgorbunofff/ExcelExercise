import { authConfig } from "../../lib/auth/config.js";
import { safeNext } from "../../lib/auth/redirect.js";
import { AuthCard, Links, Notice } from "../auth/ui.js";

import { SignupForm } from "./form.js";

export async function SignupScreen({ searchParams }) {
  const config = authConfig();
  const params = await searchParams;
  const next = safeNext(params?.next);

  return (
    <AuthCard
      title="Create an account"
      lede="One account, every device. Your unsolved drills stay free either way."
    >
      {config.enabled ? null : <Notice>{config.reason}</Notice>}
      <SignupForm next={next} disabled={!config.enabled} />
      <Links items={[{ href: `/login?next=${encodeURIComponent(next)}`, label: "I already have an account" }]} />
    </AuthCard>
  );
}
