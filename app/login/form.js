"use client";

import { useActionState } from "react";

import { t } from "../../legacy/src/site/messages.mjs";

import { sendMagicLink, signIn } from "../auth/actions.js";
import { FocusedError } from "../auth/error-text.js";
import { Field, OkText, Submit } from "../auth/ui.js";

export function LoginForm({ next, disabled }) {
  const [state, action, pending] = useActionState(signIn, {});
  return (
    <form action={action} noValidate>
      <input type="hidden" name="next" value={next} />
      <FocusedError>{state?.error}</FocusedError>
      <Field
        label={t("auth.login.email")}
        name="email"
        type="email"
        autoComplete="email"
        required
        disabled={disabled}
      />
      <Field
        label={t("auth.login.password")}
        name="password"
        type="password"
        autoComplete="current-password"
        minLength={8}
        required
        disabled={disabled}
      />
      <Submit pending={pending} disabled={disabled}>
        {t("auth.login.submit")}
      </Submit>
    </form>
  );
}

// The same address, a different proof: no password at all. Kept as a second form rather than a mode
// toggle so both paths stay visible and neither hides the other's failure message.
export function MagicLinkForm({ next, disabled }) {
  const [state, action, pending] = useActionState(sendMagicLink, {});
  return (
    <form action={action} noValidate className="auth-magic">
      <input type="hidden" name="next" value={next} />
      <FocusedError>{state?.error}</FocusedError>
      <OkText>{state?.ok}</OkText>
      <Field
        label={t("auth.login.magic.label")}
        name="email"
        type="email"
        autoComplete="email"
        required
        disabled={disabled}
      />
      <Submit pending={pending} disabled={disabled}>
        {t("auth.login.magic.submit")}
      </Submit>
    </form>
  );
}
