"use client";

import { useActionState } from "react";

import { sendMagicLink, signIn } from "../auth/actions.js";
import { ErrorText, Field, OkText, Submit } from "../auth/ui.js";

export function LoginForm({ next, disabled }) {
  const [state, action, pending] = useActionState(signIn, {});
  return (
    <form action={action} noValidate>
      <input type="hidden" name="next" value={next} />
      <ErrorText>{state?.error}</ErrorText>
      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        disabled={disabled}
      />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        minLength={8}
        required
        disabled={disabled}
      />
      <Submit pending={pending} disabled={disabled}>
        Sign in
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
      <ErrorText>{state?.error}</ErrorText>
      <OkText>{state?.ok}</OkText>
      <Field
        label="Email me a sign-in link instead"
        name="email"
        type="email"
        autoComplete="email"
        required
        disabled={disabled}
      />
      <Submit pending={pending} disabled={disabled}>
        Send link
      </Submit>
    </form>
  );
}
