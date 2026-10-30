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

/** The sender runs in the browser, so the only honest proof of it is a real browser: type the answer,
 *  finish the lesson, and read the request it made. `sum-basics` is one screen and free, so the drill
 *  reaches `lesson_complete` on the first accepted formula. */
test("the drill posts its lesson's events when the lesson ends", async ({ page }) => {
  const request = page.waitForRequest((r) => r.url().endsWith("/api/progress") && r.method() === "POST");
  const response = page.waitForResponse((r) => r.url().endsWith("/api/progress") && r.request().method() === "POST");

  await page.goto("/learn/excel/sum-basics");
  await expect(page.locator("#formula")).toBeVisible();
  await page.fill("#formula", "=SUM(B2:B4)");
  await page.click("#check");
  await expect(page.locator("#feedback")).toHaveClass(/is-correct/);

  const body = JSON.parse((await request).postData());
  expect(body.batch_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  const types = body.events.map((event) => event.type);
  expect(types).toContain("drill_start");
  expect(types).toContain("check_correct");
  expect(types).toContain("lesson_complete");
  // One batch carries one lesson, and every event in it names that lesson.
  expect([...new Set(body.events.map((event) => event.id))]).toEqual(["01-sum-basics"]);
  // No accounts in CI, so the refusal is the deployment's answer — and grading was unaffected.
  expect((await response).status()).toBe(503);
  await expect(page.locator("#feedback")).toBeVisible();
});
