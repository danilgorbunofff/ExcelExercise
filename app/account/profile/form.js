"use client";

import { useActionState } from "react";

import { updateProfile } from "../../auth/actions.js";
import { FocusedError } from "../../auth/error-text.js";
import { Field, Notice, OkText, Submit } from "../../auth/ui.js";

export function ProfileForm({ values, notice }) {
  const [state, action, pending] = useActionState(updateProfile, {});
  return (
    <form action={action} noValidate>
      {notice ? <Notice>{notice}</Notice> : null}
      <FocusedError>{state?.error}</FocusedError>
      <OkText>{state?.ok}</OkText>
      <Field
        label="Display name"
        name="display_name"
        autoComplete="nickname"
        maxLength={80}
        defaultValue={values.display_name}
      />
      <Field
        label="Username"
        name="username"
        autoComplete="username"
        minLength={3}
        maxLength={32}
        required
        defaultValue={values.username}
      />
      <Field
        label="LinkedIn (optional)"
        name="linkedin_url"
        type="url"
        autoComplete="url"
        placeholder="linkedin.com/in/you"
        defaultValue={values.linkedin_url}
      />
      <Submit pending={pending}>Save profile</Submit>
    </form>
  );
}
