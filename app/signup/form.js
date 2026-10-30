"use client";

import { useActionState } from "react";

import { signUp } from "../auth/actions.js";
import { FocusedError } from "../auth/error-text.js";
import { Field, OkText, Submit } from "../auth/ui.js";

export function SignupForm({ next, disabled }) {
  const [state, action, pending] = useActionState(signUp, {});
  return (
    <form action={action} noValidate>
      <input type="hidden" name="next" value={next} />
      <FocusedError>{state?.error}</FocusedError>
      <OkText>{state?.ok}</OkText>
      <Field label="Email" name="email" type="email" autoComplete="email" required disabled={disabled} />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={8}
        required
        disabled={disabled}
      />
      <Field
        label="Display name (optional)"
        name="display_name"
        autoComplete="nickname"
        maxLength={80}
        disabled={disabled}
      />
      <Submit pending={pending} disabled={disabled}>
        Create account
      </Submit>
    </form>
  );
}
