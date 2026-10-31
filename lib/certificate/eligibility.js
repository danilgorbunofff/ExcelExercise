/**
 * Who has earned a certificate, and what the certificate says.
 *
 * Everything here is a pure function over data the caller already has, so the two halves of the
 * decision can be tested without a database: `eligibility` answers "has this learner finished the
 * track?", `daysTaken` answers "how long did it take them?", and `certificateUrl`/`linkedInUrl` build
 * the two links a finished certificate offers. The database re-counts eligibility anyway (see
 * `issue_certificate` in `0013_certificates.sql`) — this is the half that can explain itself to a
 * learner, not the half that decides.
 *
 * The rules, stated once:
 *
 *   * **Completion, no accuracy bar.** A finished track is a finished track. The reference has no
 *     minimum score, and a bar the curriculum never announced would fail people who did the work.
 *   * **Session-free.** A learner who finished every lesson without ever signing in has nothing in
 *     `lesson_progress`, so there is nothing to certify — the certificate names a row that has to exist.
 *     The page says so rather than pretending the browser's own record is enough.
 *   * **Two entries, one name.** The name is typed twice before issue because it cannot be changed
 *     afterwards; that comparison lives here so the form and the route cannot disagree about it.
 */

/** The longest name a certificate holds, and the shortest. Mirrors the check in `0013`. */
export const NAME_MIN = 2;
export const NAME_MAX = 60;

/**
 * What is wrong with a typed name, or `null` when nothing is.
 *
 * Trimmed first, then length-checked, then stripped of control characters — a name with a newline in it
 * would break the one-line layout and, once printed, the PDF. Returns the value to store so the caller
 * cannot accidentally keep the untrimmed one.
 */
export function checkName(raw) {
  const value = String(raw ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (value.length < NAME_MIN) return { error: `Use at least ${NAME_MIN} characters, exactly as it should appear on the certificate.`, value };
  if (value.length > NAME_MAX) return { error: `Use at most ${NAME_MAX} characters.`, value };
  return { error: null, value };
}

/**
 * Whether the two typed names match, and what to say when they do not.
 *
 * Compared after the same normalisation `checkName` applies, so a trailing space is not a reason to
 * refuse — but a different spelling is, because this is the last chance to notice it.
 */
export function checkNameConfirmation(first, second) {
  const a = checkName(first);
  if (a.error) return { error: a.error, value: a.value };
  const b = String(second ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (a.value !== b) return { error: "The two entries do not match. The name cannot be changed after the certificate is issued.", value: a.value };
  return { error: null, value: a.value };
}

/**
 * The lesson ids the certificate covers: every lesson in the Excel track, in catalog order.
 *
 * Passed to `issue_certificate` as the list the database counts against, so the definition of "the
 * track" lives in `track.json` rather than in a number typed into the route.
 */
export function requiredLessonIds(track) {
  return (track?.lessons ?? []).map((lesson) => lesson?.id).filter((id) => typeof id === "string" && id.length > 0);
}

/**
 * How much of the track is finished.
 *
 * @param {Array<{ lesson_id: string, status?: string }>} progress rows from `lesson_progress`
 * @param {string[]} required ids from `requiredLessonIds`
 */
export function eligibility(progress, required) {
  const done = new Set(
    (progress ?? [])
      .filter((row) => row && row.status === "complete")
      .map((row) => row.lesson_id),
  );
  const total = (required ?? []).length;
  const missing = (required ?? []).filter((id) => !done.has(id));
  return { total, finished: total - missing.length, missing, eligible: total > 0 && missing.length === 0 };
}

/**
 * Days from the first finished lesson to the last one, or `null` when that cannot be known.
 *
 * `null` is a real answer — a learner whose rows predate timestamps, or who has one lesson — and the page
 * prints "not recorded" rather than inventing a span. A same-day finish is `0`.
 */
export function daysTaken(progress, required) {
  const wanted = new Set(required ?? []);
  const stamps = (progress ?? [])
    .filter((row) => row && row.status === "complete" && wanted.has(row.lesson_id))
    .map((row) => Date.parse(row.completed_at ?? ""))
    .filter((ms) => Number.isFinite(ms));
  if (stamps.length < 2) return null;
  const first = Math.min(...stamps);
  const last = Math.max(...stamps);
  return Math.floor((last - first) / 86_400_000);
}

/** `2026-10-30` → `30 October 2026`, in UTC so a prerender and a request agree. */
export function formatIssued(iso) {
  const at = new Date(iso ?? "");
  if (Number.isNaN(at.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(at);
}

/** The public address of a credential, absolute because it is pasted into LinkedIn. */
export function certificateUrl(origin, credential) {
  const base = String(origin ?? "").replace(/\/+$/, "");
  return `${base}/verify/${credential}`;
}

/**
 * LinkedIn's "add licence or certification" deep link.
 *
 * The field names are LinkedIn's, not ours, and two of them are month/year rather than a date. `certId`
 * is the credential id and `certUrl` the public verify page, so a recruiter clicking through lands on a
 * page that either confirms the record or does not. UTF-8 names are fine — `URLSearchParams` encodes them.
 */
export function linkedInUrl({ credential, issuedAt, origin }) {
  const at = new Date(issuedAt ?? "");
  const params = new URLSearchParams({
    startTask: "CERTIFICATION_NAME",
    name: "Excel Supreme — Certificate of Completion",
    organizationName: "Excel Supreme",
    certUrl: certificateUrl(origin, credential),
    certId: credential,
  });
  if (!Number.isNaN(at.getTime())) {
    params.set("issueYear", String(at.getUTCFullYear()));
    params.set("issueMonth", String(at.getUTCMonth() + 1));
  }
  return `https://www.linkedin.com/profile/add?${params.toString()}`;
}
