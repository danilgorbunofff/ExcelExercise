/**
 * `/certificate` — the completion certificate: what it takes, and the button that issues it.
 *
 * The page has four honest states and no fifth:
 *
 *   * accounts off → the certificate cannot exist here, said plainly
 *   * signed out → sign in, because progress is per account
 *   * signed in, unfinished → how many lessons are left, and a link to them
 *   * signed in, finished, or already holding one → the credential, its date, and the two things you do
 *     with it: verify it, and put it on LinkedIn
 *
 * The eligibility count shown here is the same function the route and the database use, so the page
 * cannot promise a certificate the API will refuse.
 */
import Link from "next/link";
import { Suspense } from "react";

import { authConfig } from "../../lib/auth/config.js";
import { currentUser } from "../../lib/auth/server.js";
import {
  certificateUrl,
  eligibility,
  formatIssued,
  linkedInUrl,
  requiredLessonIds,
} from "../../lib/certificate/eligibility.js";
import { loadProgress, readCertificate } from "../../lib/certificate/issue.js";
import { requestOrigin } from "../../lib/certificate/origin.js";
import { progressClient } from "../../lib/progress/write.js";
import { loadSite } from "../../lib/site.js";
import { AuthShell } from "../auth/shell.js";
import { AuthCard, Links, Loading, Notice } from "../auth/ui.js";
import { IssueForm } from "./form.js";
import { PrintButton } from "./print.js";
import "./certificate.css";

export const metadata = {
  title: "Certificate",
  description: "The certificate of completion for the Excel track: what it records, and how to check one.",
  robots: { index: false, follow: false },
};

// Per-learner, so there is nothing prerenderable here.
export const instant = false;

function Held({ row, site }) {
  return (
    <>
      <p className="auth-lede">
        Issued {formatIssued(row.issued_at) ?? "—"} for {row.lesson_count} lessons
        {row.days_taken === null || row.days_taken === undefined ? "" : `, finished over ${row.days_taken} day${row.days_taken === 1 ? "" : "s"}`}.
      </p>
      <dl className="certificate-facts">
        <div>
          <dt>Name on the certificate</dt>
          <dd>{row.display_name}</dd>
        </div>
        <div>
          <dt>Credential</dt>
          <dd>
            <code>{row.credential_id}</code>
          </dd>
        </div>
      </dl>
      {row.revoked_at ? (
        <Notice>
          This certificate was revoked on {formatIssued(row.revoked_at)}. The credential still resolves, and says
          so.
        </Notice>
      ) : (
        <Notice>Anyone can check this credential without an account — that is what makes it worth showing.</Notice>
      )}
      <Links
        items={[
          { href: `/verify/${row.credential_id}`, label: "Check the public record" },
          { href: "/learn", label: "Your drills" },
        ]}
      />
      <p className="certificate-print-url">Check this credential at {certificateUrl(site, row.credential_id)}</p>
      <PrintButton label="Print the certificate" />
      <p className="certificate-help">
        <a href={linkedInUrl({ credential: row.credential_id, issuedAt: row.issued_at, origin: site })} rel="noreferrer noopener" target="_blank">
          Add it to your LinkedIn profile
        </a>{" "}
        — LinkedIn asks for the name, the issuer and the credential URL, and this link fills all three in.
      </p>
    </>
  );
}

async function CertificateScreen() {
  if (!authConfig().enabled) {
    return (
      <AuthCard title="Certificate">
        <Notice>{authConfig().reason}</Notice>
        <Links items={[{ href: "/learn", label: "Your drills" }]} />
      </AuthCard>
    );
  }

  const { supabase, user } = await currentUser();
  if (!user) {
    return (
      <AuthCard
        title="Certificate"
        lede="A certificate names an account. Sign in and your finished lessons are already waiting."
      >
        <Links
          items={[
            { href: "/login?next=/certificate", label: "Sign in" },
            { href: "/signup?next=/certificate", label: "Create an account" },
          ]}
        />
      </AuthCard>
    );
  }

  const client = progressClient();
  if (!client) {
    return (
      <AuthCard title="Certificate">
        <Notice>Certificates cannot be issued on this deployment just now. Your progress is safe and unaffected.</Notice>
        <Links items={[{ href: "/learn", label: "Your drills" }]} />
      </AuthCard>
    );
  }

  const held = await readCertificate(client, user.id);
  if (held.error) {
    return (
      <AuthCard title="Certificate">
        <Notice>Your certificate could not be read just now. Refresh in a moment.</Notice>
      </AuthCard>
    );
  }
  const site = await requestOrigin();
  if (held.row) {
    return (
      <AuthCard title="Certificate">
        <Held row={held.row} site={site} />
      </AuthCard>
    );
  }

  const { track } = loadSite();
  const required = requiredLessonIds(track);
  const progress = await loadProgress(supabase);
  const state = eligibility(progress.rows, required);

  if (!state.eligible) {
    return (
      <AuthCard
        title="Certificate"
        lede={`One certificate, for the whole ${track.title ?? "Excel"} track. ${state.finished} of ${state.total} lessons are recorded as finished.`}
      >
        <Notice>
          {state.missing.length === 1
            ? "One lesson is left."
            : `${state.missing.length} lessons are left.`}{" "}
          A lesson counts the moment it is finished and you are signed in — the certificate is issued from that
          record, not from this browser.
        </Notice>
        <Links items={[{ href: "/learn", label: "Your drills" }]} />
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Certificate"
      lede={`Every one of the ${state.total} lessons is recorded as finished. Type your name twice — it is printed as written and cannot be changed afterwards.`}
    >
      <IssueForm suggested={user.user_metadata?.display_name ?? user.user_metadata?.full_name ?? ""} />
      <p className="certificate-help">
        Before you issue it: the name goes on a document you will share. Your account profile name is{" "}
        <Link href="/account">here</Link> if you would rather fix that first.
      </p>
    </AuthCard>
  );
}

export default function CertificatePage() {
  return (
    <AuthShell counter="Certificate" skipLabel="certificate">
      <Suspense fallback={<Loading />}>
        <CertificateScreen />
      </Suspense>
    </AuthShell>
  );
}
