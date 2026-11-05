/**
 * The funnel's browser end, end to end: a real exercise reports a start and a completion, the route
 * answers `204`, and no cookie rides along. `tests/content-report.test.js` proves the report reads
 * such lines; this proves the page writes them, which is the half no unit test can see.
 */
import { expect, test } from "@playwright/test";

import { freeDrill } from "../lib/site.js";

const FREE = freeDrill();
const ENDPOINT = "/api/events";

/** Every funnel post this page made, in order, with the answer the server gave it. */
function watch(page) {
  const sent = [];
  page.on("request", (request) => {
    if (request.method() !== "POST" || new URL(request.url()).pathname !== ENDPOINT) return;
    sent.push({ body: request.postDataJSON(), cookie: request.headers().cookie ?? null });
  });
  const statuses = [];
  page.on("response", (response) => {
    if (new URL(response.url()).pathname === ENDPOINT) statuses.push(response.status());
  });
  return { sent, statuses };
}

test("an exercise reports a start and a finish that the route accepts", async ({ page }) => {
  const { sent, statuses } = watch(page);

  await page.goto(`/learn/excel/${FREE.slug}`);
  await expect(page.locator("#formula")).toBeVisible();

  await page.fill("#formula", "=SUM(B2:B4)");
  await expect.poll(() => sent.map((entry) => entry.body.event)).toContain("drill_started");

  await page.click("#check");
  await expect(page.locator("#feedback")).toHaveClass(/is-correct/);
  await expect.poll(() => sent.map((entry) => entry.body.event)).toContain("drill_completed");

  const start = sent.find((entry) => entry.body.event === "drill_started").body;
  expect(start.fields.surface).toBe("lesson");
  expect(start.fields.slug).toBe(FREE.slug);

  // The counts travel; the answer typed into the field does not.
  const done = sent.find((entry) => entry.body.event === "drill_completed").body;
  expect(done.fields.attempts).toBe(1);
  expect(JSON.stringify(done)).not.toContain("SUM(B2:B4)");

  await expect.poll(() => statuses.length).toBeGreaterThanOrEqual(2);
  expect(statuses.every((status) => status === 204)).toBe(true);
  expect(sent.every((entry) => entry.cookie === null), "a funnel line carried a cookie").toBe(true);
});

test("a page view is counted once, not once per keystroke", async ({ page }) => {
  const { sent } = watch(page);

  await page.goto(`/learn/excel/${FREE.slug}`);
  await expect(page.locator("#formula")).toBeVisible();
  await page.fill("#formula", "=SU");
  await page.type("#formula", "M(B2:B4)");

  await expect.poll(() => sent.length).toBeGreaterThan(0);
  expect(sent.filter((entry) => entry.body.event === "drill_started")).toHaveLength(1);
});
