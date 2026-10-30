"use client";

import { useActionState } from "react";

import { requestReset } from "../auth/actions.js";
import { ErrorText, Field, OkText, Submit } from "../auth/ui.js";

export function ResetForm({ disabled }) {
  const [state, action, pending] = useActionState(requestReset, {});
  return (
    <form action={action} noValidate>
      <ErrorText>{state?.error}</ErrorText>
      <OkText>{state?.ok}</OkText>
      <Field label="Email" name="email" type="email" autoComplete="email" required disabled={disabled} />
      <Submit pending={pending} disabled={disabled}>
        Send reset link
      </Submit>
    </form>
  );
}
