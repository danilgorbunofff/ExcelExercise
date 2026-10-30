import { Suspense } from "react";

import { AuthShell } from "../auth/shell.js";
import { Loading } from "../auth/ui.js";

import { SignupScreen } from "./screen.js";

export const metadata = {
  title: "Create an account",
  description: "Create an account to keep your Excel drill progress across devices.",
  robots: { index: false, follow: true },
};

export const instant = false;

export default function SignupPage({ searchParams }) {
  return (
    <AuthShell counter="Create an account">
      <Suspense fallback={<Loading />}>
        <SignupScreen searchParams={searchParams} />
      </Suspense>
    </AuthShell>
  );
}
