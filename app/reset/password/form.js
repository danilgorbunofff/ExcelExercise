"use client";

import { useActionState } from "react";

import { setNewPassword } from "../../auth/actions.js";
import { ErrorText, Field, Submit } from "../../auth/ui.js";

export function NewPasswordForm() {
  const [state, action, pending] = useActionState(setNewPassword, {});
  return (
    <form action={action} noValidate>
      <ErrorText>{state?.error}</ErrorText>
      <Field
        label="New password"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={8}
        required
      />
      <Submit pending={pending}>Save password</Submit>
    </form>
  );
}
