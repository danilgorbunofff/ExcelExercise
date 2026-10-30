import { Suspense } from "react";

import { AuthShell } from "../auth/shell.js";
import { Loading } from "../auth/ui.js";

import { LoginScreen } from "./screen.js";

export const metadata = {
  title: "Sign in",
  description: "Sign in to keep your Excel drill progress across devices.",
  robots: { index: false, follow: true },
};

// Sibling pages are prefetched; this one reads `?next=`, so it cannot answer before the request.
export const instant = false;

export default function LoginPage({ searchParams }) {
  return (
    <AuthShell counter="Sign in">
      <Suspense fallback={<Loading />}>
        <LoginScreen searchParams={searchParams} />
      </Suspense>
    </AuthShell>
  );
}
