"use client";

import { useActionState } from "react";

import { t } from "../../legacy/src/site/messages.mjs";

import { requestReset } from "../auth/actions.js";
import { FocusedError } from "../auth/error-text.js";
import { Field, OkText, Submit } from "../auth/ui.js";

export function ResetForm({ disabled }) {
  const [state, action, pending] = useActionState(requestReset, {});
  return (
    <form action={action} noValidate>
      <FocusedError>{state?.error}</FocusedError>
      <OkText>{state?.ok}</OkText>
      <Field label={t("auth.reset.email")} name="email" type="email" autoComplete="email" required disabled={disabled} />
      <Submit pending={pending} disabled={disabled}>
        {t("auth.reset.submit")}
      </Submit>
    </form>
  );
}
