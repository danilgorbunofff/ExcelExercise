"use client";

import { useActionState } from "react";

import { setNewPassword } from "../../auth/actions.js";
import { FocusedError } from "../../auth/error-text.js";
import { Field, Submit } from "../../auth/ui.js";

export function NewPasswordForm() {
  const [state, action, pending] = useActionState(setNewPassword, {});
  return (
    <form action={action} noValidate>
      <FocusedError>{state?.error}</FocusedError>
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
