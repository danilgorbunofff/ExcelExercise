"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { NAME_MAX, checkNameConfirmation } from "../../lib/certificate/eligibility.js";
import { ErrorText, Field, Submit } from "../auth/ui.js";

/**
 * The two name fields and the button that issues.
 *
 * The confirmation is checked here *and* on the server. Here so the learner sees the mismatch without a
 * round trip; there so the rule is not a property of this component. What this component must never do is
 * decide — it posts a name and follows the answer.
 *
 * The button says what it does rather than "Submit": the name is permanent, and a generic label on an
 * irreversible action is the one place to spend the extra words.
 */
export function IssueForm({ suggested = "" }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(suggested);
  const [again, setAgain] = useState(suggested);
  const [error, setError] = useState(null);

  async function submit(event) {
    event.preventDefault();
    const checked = checkNameConfirmation(name, again);
    if (checked.error) {
      setError(checked.error);
      return;
    }
    setError(null);
    const response = await fetch("/api/certificate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: checked.value, nameAgain: checked.value }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body?.ok) {
      setError(body?.error ?? "The certificate could not be issued just now. Try again in a moment.");
      return;
    }
    startTransition(() => router.push(`/verify/${body.credentialId}`));
  }

  return (
    <form className="auth-form" onSubmit={submit} noValidate>
      <Field
        label="Name as it should appear"
        name="name"
        value={name}
        maxLength={NAME_MAX}
        autoComplete="name"
        required
        onChange={(event) => setName(event.target.value)}
      />
      <Field
        label="Same name again"
        name="nameAgain"
        value={again}
        maxLength={NAME_MAX}
        autoComplete="off"
        required
        aria-describedby="certificate-name-help"
        onChange={(event) => setAgain(event.target.value)}
      />
      <p className="auth-help" id="certificate-name-help">
        Twice, because the name is printed as typed and cannot be changed afterwards.
      </p>
      <ErrorText>{error}</ErrorText>
      <Submit pending={pending}>Issue my certificate</Submit>
    </form>
  );
}
