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

/** Two bodies share the route — an event batch and a migration — so every wait names the one it wants
 *  rather than taking whichever POST arrived first. */
const requestOf = (message) => (typeof message.request === "function" ? message.request() : message);
const carries = (body, message) => {
  const request = requestOf(message);
  return (
    request.method() === "POST" &&
    request.url().endsWith("/api/progress") &&
    (request.postData() ?? "").includes(body)
  );
};

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
  const request = page.waitForRequest((r) => carries('"events"', r));
  const response = page.waitForResponse((r) => carries('"events"', r));

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

/** The signed-out roll-up: a page that already has `es.progress` offers it once, and only keeps the
 *  marker when the server took it. CI has no accounts, so the refusal must leave the marker unset —
 *  otherwise a learner's first signed-out lesson would be discarded on the first page load after
 *  deployment. The write itself is proved by `tests/db/migrate.spec.js`. */
test("the page offers a signed-out roll-up once, and keeps it when the server refuses", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "es.progress",
      JSON.stringify({
        v: 1,
        done: { "01-sum-basics": { at: "2026-02-01T09:00:00.000Z", tries: 2, helped: true } },
        tries: { "02-average-scores": 3 },
        unlocked: false,
      }),
    );
    localStorage.removeItem("es.progress.migrated");
  });

  const request = page.waitForRequest((r) => carries('"lessons"', r));
  const response = page.waitForResponse((r) => carries('"lessons"', r));
  await page.goto("/learn/excel/sum-basics");

  const body = JSON.parse((await request).postData());
  expect(body.batch_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  expect(body.lessons).toEqual([
    { lesson_id: "01-sum-basics", completed_at: "2026-02-01T09:00:00.000Z", helped: true, score: 0 },
    { lesson_id: "02-average-scores", completed_at: null, helped: false, score: 0 },
  ]);
  expect(body.events).toBeUndefined();

  expect((await response).status()).toBe(503);
  expect(await page.evaluate(() => localStorage.getItem("es.progress.migrated"))).toBeNull();
});

test("does not offer a corrupt roll-up at all", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("es.progress", "{not json");
    localStorage.removeItem("es.progress.migrated");
  });

  const sent = [];
  page.on("request", (request) => {
    if (carries('"lessons"', request)) sent.push(request.postData());
  });
  await page.goto("/learn/excel/sum-basics");
  // Hydration is the moment the migration would fire, so wait for it before concluding it did not.
  await page.waitForFunction(() => typeof window.__esOnEvent === "function");
  await page.waitForTimeout(300);

  expect(sent).toEqual([]);
  // The evidence is left alone: a record the browser mangled is not rewritten by the migration.
  expect(await page.evaluate(() => localStorage.getItem("es.progress"))).toBe("{not json");
});
