import { AuthCard, Links } from "../../auth/ui.js";
import { AuthShell } from "../../auth/shell.js";

export const metadata = {
  title: "Account deleted",
  description: "What was erased, and what was kept without your name.",
  robots: { index: false, follow: false },
};

/**
 * The receipt for a deletion. Static on purpose: there is no session left to read, and this is the one
 * `/account` path the proxy lets through without one (see `PUBLIC` there). It states what happened
 * rather than asking the learner to believe it.
 */
export default function DeletedPage() {
  return (
    <AuthShell counter="Your account" skipLabel="your account">
      <AuthCard title="Your account is gone" lede="Signed out, erased, and not coming back.">
        <p>
          Your profile, your progress, every saved answer and your points are gone from the database.
          Nothing will be graded against it again, and there is no copy to restore.
        </p>
        <p>
          Two things were kept: your payment and entitlement records, now with no name or email
          attached to them, and the notes you sent us. They are what a refund or a tax record needs.
          You can read the whole list on the <a href="/privacy">privacy page</a>.
        </p>
        <p>
          If you want to start again, the first <a href="/learn">drills</a> are free and need no
          account.
        </p>
        <Links items={[{ href: "/learn", label: "Back to the drills" }, { href: "/privacy", label: "Privacy" }]} />
      </AuthCard>
    </AuthShell>
  );
}
