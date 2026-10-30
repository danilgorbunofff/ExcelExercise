import { Suspense } from "react";

import { authConfig } from "../../../lib/auth/config.js";
import { currentUser } from "../../../lib/auth/server.js";
import { flagCopy, flagEnabled } from "../../../lib/flags.js";
import { AuthShell } from "../../auth/shell.js";
import { AuthCard, Links, Notice, Skeleton } from "../../auth/ui.js";
import { Runner } from "./runner.js";

export const metadata = {
  title: "Today's run",
  description: "Ten screens, fifteen minutes, one attempt. No hints and no going back.",
  robots: { index: false, follow: false },
};

export const instant = false;

async function RunScreen() {
  if (!flagEnabled("dailyChallenge")) {
    return (
      <AuthCard title="Today's run">
        <Notice>{flagCopy("dailyChallenge")}</Notice>
        <Links items={[{ href: "/learn", label: "Your drills" }]} />
      </AuthCard>
    );
  }

  const config = authConfig();
  if (!config.enabled) {
    return (
      <AuthCard title="Today's run">
        <Notice>{config.reason}</Notice>
        <Links items={[{ href: "/learn", label: "Your drills" }]} />
      </AuthCard>
    );
  }

  const { user } = await currentUser();
  if (!user) {
    return (
      <AuthCard title="Today's run">
        <Notice>You are signed out.</Notice>
        <Links items={[{ href: "/login?next=%2Fdaily%2Frun", label: "Sign in" }]} />
      </AuthCard>
    );
  }

  // The run starts from this page and nowhere else: the card's title is what a learner sees while the
  // first request is in flight, and `instant = false` keeps that request out of the prerender.
  return (
    <AuthCard
      title="Today's run"
      lede="Ten screens, fifteen minutes, one attempt. The clock is the server's and a screen's first answer is the one that counts."
    >
      <Suspense fallback={<p className="auth-loading">Starting today&apos;s run…</p>}>
        <Runner />
      </Suspense>
    </AuthCard>
  );
}

export default function DailyRunPage() {
  return (
    <AuthShell counter="Today's run" skipLabel="run">
      <Suspense fallback={<Skeleton label="Loading today's run…" rows={6} />}>
        <RunScreen />
      </Suspense>
    </AuthShell>
  );
}
