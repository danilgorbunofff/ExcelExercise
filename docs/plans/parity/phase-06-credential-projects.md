# Phase 6 — Credential and projects


> Part of the [reference-parity plan](00-overview.md). This file is self-contained:
> scope, work breakdown, acceptance criteria, tests and risks for this phase only.

**Duration:** 2 weeks · **Depends on:** phase 4 · **Blocks:** phase 10

---

## Objective

Ship the two artefacts that justify a paid price and create word of mouth: a verifiable certificate of
completion, and project exercises that turn lessons into portfolio work.

Reference behaviour being reproduced: eligibility once all lessons are complete, a name that cannot be
changed after generation, a credential ID, a public verification page, and an add-to-LinkedIn link.
Reference projects: 4 dashboards + 1 interview assessment with downloadable XLSX datasets.

## Scope

**Certificate**
- Eligibility check (all Excel lessons complete; SQL optional track flag).
- Name entry with double confirmation; immutable after issue.
- Server-issued credential ID (opaque, non-guessable), PDF render, public `/verify/[credentialId]`.
- Add-to-LinkedIn deep link with prefilled name, issue date, credential URL.
- Revocation (admin only) with a visible "revoked" state on the verify page.

**Projects**
- 4 guided projects + 1 interview assessment, each with narrative, dataset, tasks, and a graded
  final answer set.
- First-party dataset downloads (no OneDrive), read-only preview, per-project progress.
- Premium gating identical to lessons.

## Out of scope

- Accredited certification, proctoring, or exam centres.
- Employer-facing verification API (post-launch).
- Additional projects beyond the five.

## Work breakdown

1. **Eligibility.** `certificate_eligible(uid)` = all lessons in the track complete and a minimum
   accuracy threshold (default 0 — document the choice; the reference has none beyond completion).
2. **Issue flow.** `/certificate` → confirm name (typed twice, mismatch blocks) → `POST
   /api/certificate` → transaction: unique `credential_id` (base32, 16 chars), `issued_at`,
   `lesson_count`, `days_taken` → enqueue PDF render → status `pending` → client polls until `ready`
   → redirect to `/verify/[credentialId]`.
3. **Immutability.** `certificates.display_name` is write-once (trigger raises on update except
   `revoked_at`). Same guarantee for `credential_id`.
4. **PDF.** Server-side render (React-PDF or a headless template) with name, credential ID, date,
   lesson count, verification URL and a QR code. Stored in Supabase Storage, private bucket, served by
   signed URL; public copy at a stable path for the verify page.
5. **Verification page.** `/verify/[credentialId]` works signed out, `noindex` off (indexable is
   fine), shows holder name, issue date, lesson count, status; "not found" is a distinct, honest
   state; rate-limited to prevent ID enumeration.
6. **LinkedIn.** Deep link with `startTask=CERTIFICATION_NAME`, `name`, `organizationName`,
   `issueYear`, `issueMonth`, `certUrl`, `certId`. Verify the URL opens correctly in a manual test.
7. **Revocation.** Admin action sets `revoked_at`; verify page shows revoked; PDF remains but is
   flagged. Logged with actor + reason.
8. **Projects.** Author 4 project definitions in `content/projects/*.json` (narrative sections,
   dataset link, 6–10 tasks, expected answers, hints). Datasets go in `public/datasets/` with
   `Content-Disposition: attachment`. The four, mirroring the reference:

   | Project | Dataset | Learner does |
   |---|---|---|
   | UFO dashboard practice | `ufo.xlsx` | clean a sightings table, build pivots and a summary block |
   | Wine dashboard practice | `wine.xlsx` | regional summaries, ranking formulas, conditional formatting |
   | Trout dashboard case | `trout.xlsx` | a multi-section case from raw catch data to a formatted report |
   | Job-interview assessment | `interview-assessment.xlsx` | a timed, unseen task set standing in for a hiring test |

   Datasets are rebuilt first-party from scratch — the reference's XLSX files are not ours to ship.
   The fifth reference project is a SQL case and lands in phase 8, once the engine exists.
9. **Project runner.** Reuse the player with a `project` lesson type: sequential tasks, free
   navigation, no recycling, completion recorded as a `lesson_progress` row with `track='project'`.
10. **Preview panel.** Read-only sheet rendered from the XLSX at build time (same package as phase 2
    workbook screens); no iframe.

## Acceptance criteria

- [ ] Issuing twice returns the existing certificate, never a second one.
- [ ] Name cannot be changed by client request, DB update, or re-run of the issue endpoint.
- [ ] `/verify/{id}` works signed out and in a private window.
- [ ] An unknown ID returns a clean not-found page, not an error.
- [ ] Revoked certificate shows "revoked" while remaining verifiable as a record.
- [ ] LinkedIn URL opens the add-licence form with all fields prefilled (manual check, recorded).
- [ ] PDF renders correctly with a 60-character name and non-Latin characters.
- [ ] All 4 Excel projects downloadable first-party with correct MIME and size; no third-party
      request. (The fifth, the SQL case, is accepted in phase 8.)
- [ ] Projects are gated identically to lessons (free user cannot reach the fourth).

## Test plan

| Area | Tests |
|---|---|
| Eligibility | unit: 0, partial, all complete, SQL-inclusive variant |
| Issue | integration: first issue, re-issue, concurrent issue (race), immutability |
| Verify | e2e: valid, revoked, unknown, malformed ID |
| PDF | snapshot render + visual check at 2 name lengths |
| Projects | e2e: open, complete a task, download dataset, gate check |
| Security | enumeration rate limit, signed URL expiry |

## Risks

| Risk | Mitigation |
|---|---|
| Certificate implies accreditation | wording review: "certificate of completion", no exam claims |
| PDF rendering environment differences | render server-side only, snapshot test the output |
| Name typos are permanent | double entry + preview of the rendered name before confirming |
| Project content cost | reuse existing screens where possible; 4 Excel projects ≈ 12 author-days |
