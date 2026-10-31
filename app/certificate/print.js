"use client";

import { t } from "../../legacy/src/site/messages.mjs";

/**
 * Print the record in front of you, using the browser's own print dialog.
 *
 * The certificate has no server-rendered PDF. It has a sheet that prints correctly, and this button,
 * because `window.print()` is the one renderer every machine already has — no dependency, no queue, no
 * "pending" state that can fail silently. What the sheet prints is decided by `@media print` in
 * `certificate.css`; the button itself is hidden there, so a printed page never offers to print again.
 */
export function PrintButton({ label = t("certificate.printRecord") }) {
  return (
    <p className="certificate-print">
      <button className="btn" type="button" onClick={() => window.print()}>
        {label}
      </button>
    </p>
  );
}
