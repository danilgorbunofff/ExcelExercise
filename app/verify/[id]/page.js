/**
 * `/verify/[id]` — the public record a credential points at.
 *
 * This is the page a stranger opens from a résumé, so it answers without an account and says one of four
 * things, in this order of certainty:
 *
 *   * the id is not shaped like a credential → "that is not a credential id" (a typo, not a claim)
 *   * this deployment has no database → "cannot be checked here" — never "does not exist", because those
 *     are different statements and the second one would be false
 *   * no row → "no certificate with that id"
 *   * a row → the name, the count, the date, and a revoked notice if there is one
 *
 * A revoked certificate still resolves. That is the point of revocation: the credential stays honest
 * rather than quietly disappearing, which would leave the holder's résumé linking to a 404.
 */
import { Suspense } from "react";

import { certificateUrl, formatIssued } from "../../../lib/certificate/eligibility.js";
import { isCredentialId, normaliseCredentialId } from "../../../lib/certificate/credential.js";
import { verify } from "../../../lib/certificate/issue.js";
import { requestOrigin } from "../../../lib/certificate/origin.js";
import { progressClient } from "../../../lib/progress/write.js";
import { AuthShell } from "../../auth/shell.js";
import { AuthCard, Links, Loading, Notice } from "../../auth/ui.js";
import "../../certificate/certificate.css";
import { PrintButton } from "../../certificate/print.js";

export const metadata = {
  title: "Verify a certificate",
  description: "Check an Excel Supreme certificate of completion by its credential id.",
  // A credential names one person. It belongs in a résumé link, not in a search result.
  robots: { index: false, follow: false },
};

// The record is looked up per request and a public page must not be cached into a stale answer.
export const instant = false;

function Sheet({ row, url }) {
  const issued = formatIssued(row.issued_at);
  return (
    <div className="certificate-sheet" data-revoked={row.status === "revoked" ? "true" : "false"}>
      <p className="certificate-kicker">Excel Supreme · Certificate of completion</p>
      <p className="certificate-name">{row.display_name}</p>
      <p className="certificate-basis">
        Finished all {row.lesson_count} lessons of the Excel track
        {issued ? `, recorded ${issued}` : ""}.
      </p>
      <p className="certificate-serial">
        Credential <strong>{row.credential_id}</strong>
      </p>
      <p className="certificate-print-url">
        Check this credential at {url}
      </p>
    </div>
  );
}

async function VerifyScreen({ id }) {
  const credential = normaliseCredentialId(id);

  if (!isCredentialId(credential)) {
    return (
      <AuthCard title="Check a certificate" lede="A credential id is sixteen characters — digits and capital letters, without I, L, O or U.">
        <Notice>That is not a credential id. Check the sixteen characters on the certificate for a typo.</Notice>
        <Links items={[{ href: "/certificate", label: "Your certificate" }]} />
      </AuthCard>
    );
  }

  const client = progressClient();
  if (!client) {
    return (
      <AuthCard title="Check a certificate">
        <Notice>
          Certificates cannot be checked on this deployment — it has no database configured, so there is no
          record to look up here. That is a property of this deployment, not of the credential.
        </Notice>
        <Links items={[{ href: "/learn", label: "The drills" }]} />
      </AuthCard>
    );
  }

  const found = await verify(client, credential);
  if (found.error) {
    return (
      <AuthCard title="Check a certificate">
        <Notice>The certificate record could not be read just now. Try again in a moment.</Notice>
      </AuthCard>
    );
  }

  if (!found.row) {
    return (
      <AuthCard title="Check a certificate">
        <Notice>No certificate has that credential id. Check the sixteen characters on the certificate for a typo.</Notice>
        <Links items={[{ href: "/learn", label: "The drills" }]} />
      </AuthCard>
    );
  }

  const url = certificateUrl(await requestOrigin(), found.row.credential_id);
  return (
    <AuthCard
      title="Check a certificate"
      lede={
        found.row.status === "revoked"
          ? "This credential resolves, and it has been revoked."
          : "This credential resolves to a record. That is what the certificate claims."
      }
    >
      <Sheet row={found.row} url={url} />
      <PrintButton />
      {found.row.status === "revoked" ? (
        <Notice>
          Revoked{found.row.revoked_at ? ` on ${formatIssued(found.row.revoked_at)}` : ""}. A revoked certificate is
          no longer a claim of completion; treat it as withdrawn.
        </Notice>
      ) : null}
      <Links items={[{ href: "/learn", label: "The drills" }, { href: "/certificate", label: "Your certificate" }]} />
    </AuthCard>
  );
}

export default async function VerifyPage({ params }) {
  const { id } = await params;
  return (
    <AuthShell counter="Verify" skipLabel="certificate record">
      <Suspense fallback={<Loading />}>
        <VerifyScreen id={id} />
      </Suspense>
    </AuthShell>
  );
}
