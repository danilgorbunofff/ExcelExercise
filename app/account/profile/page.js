import { Suspense } from "react";

import { AuthShell } from "../../auth/shell.js";
import { Loading } from "../../auth/ui.js";

import { ProfileScreen } from "./screen.js";

export const metadata = {
  title: "Your profile",
  description: "Your username, display name and LinkedIn address.",
  robots: { index: false, follow: false },
};

// Reads the session and the learner's own row, so it can never be prerendered.
export const instant = false;

export default function ProfilePage({ searchParams }) {
  return (
    <AuthShell counter="Your profile" skipLabel="your profile">
      <Suspense fallback={<Loading />}>
        <ProfileScreen searchParams={searchParams} />
      </Suspense>
    </AuthShell>
  );
}
