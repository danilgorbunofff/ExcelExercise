/**
 * `POST /api/progress` as CI runs it: no Supabase project, so no account to attribute a write to.
 *
 * The failure this guards against is the tempting one — accepting the batch anyway "because the drill
 * worked". Without accounts there is nowhere for it to go, and saying so (503) is better than a 201
 * that quietly dropped a learner's lesson. The write itself is proved against the real database by
 * `tests/db/progress.spec.js`, and the derivation by `tests/progress-sync.test.js`.
 */
import { expect, test } from "@playwright/test";

const post = (request, body) =>
  request.post("/api/progress", { data: body, headers: { "content-type": "application/json" } });

test("refuses a progress batch when accounts are not configured", async ({ request }) => {
  const response = await post(request, { batch_id: "11111111-1111-4111-8111-111111111111", events: [] });
  expect(response.status()).toBe(503);
  expect(await response.json()).toEqual({ ok: false, error: "progress_sync_unconfigured" });
});

test("answers a malformed body with a status, never a crash", async ({ request }) => {
  const response = await request.post("/api/progress", {
    data: "not json",
    headers: { "content-type": "application/json" },
  });
  expect(response.status()).toBe(503);
  expect(response.headers()["cache-control"]).toBe("no-store");
});
