import { expect, test } from "@playwright/test";

/**
 * The enumeration guard on `/verify/<id>`, proven against a real server.
 *
 * The unit tests own the counter; what only a running build can prove is that the guard is wired
 * where it has to be — above the unconfigured-accounts early return in `proxy.js`, so a deployment
 * with no database still refuses a crawl — and that the address it keys on actually reaches it. A
 * limiter reading a header the framework overwrites would look correct in isolation and be one
 * shared bucket in production, refusing honest readers while a crawler changed nothing but its own
 * header.
 *
 * Requests are labelled with `x-forwarded-for` addresses in TEST-NET-2 and TEST-NET-3, which cannot
 * be real callers, so the buckets these tests exhaust are their own and the rest of the suite keeps
 * its own. The label is derived from the worker rather than drawn at random, so two concurrent
 * workers cannot land in the same bucket.
 */

/** Sixteen characters from the credential alphabet, so the guard is hit instead of the "typo" branch. */
const SHAPED = "ABCDEFGHJKMNPQRS";
const BUDGET = 60;

test("a crawl is refused with a wait, and a reader on another address is not", async ({ request }) => {
  const slot = test.info().workerIndex % 20;
  const crawler = `203.0.113.${slot + 1}`;
  const reader = `203.0.113.${slot + 101}`;

  for (let attempt = 1; attempt <= BUDGET; attempt += 1) {
    const response = await request.get(`/verify/${SHAPED}`, { headers: { "x-forwarded-for": crawler } });
    expect(response.status(), `request ${attempt} of the budget`).toBe(200);
  }

  const refused = await request.get(`/verify/${SHAPED}`, { headers: { "x-forwarded-for": crawler } });
  expect(refused.status()).toBe(429);
  expect(refused.headers()["retry-after"]).toMatch(/^\d+$/);
  expect(Number(refused.headers()["retry-after"])).toBeGreaterThan(0);
  expect(refused.headers()["cache-control"]).toBe("no-store");
  // A refusal a browser renders must not be a blank tab or an attachment.
  expect(refused.headers()["content-type"]).toContain("text/html");
  expect(await refused.text()).toContain("Too many certificate checks");

  // Same moment, different address: the honest reader sharing a certificate never meets the guard.
  const other = await request.get(`/verify/${SHAPED}`, { headers: { "x-forwarded-for": reader } });
  expect(other.status()).toBe(200);
});

test("the guard reaches the browser's own navigation, not just API clients", async ({ page }) => {
  const slot = test.info().workerIndex % 20;
  const crawler = `198.51.100.${slot + 1}`;

  for (let attempt = 1; attempt <= BUDGET; attempt += 1) {
    const response = await page.request.get(`/verify/${SHAPED}`, { headers: { "x-forwarded-for": crawler } });
    expect(response.status(), `request ${attempt} of the budget`).toBe(200);
  }

  await page.setExtraHTTPHeaders({ "x-forwarded-for": crawler });
  const response = await page.goto(`/verify/${SHAPED}`);
  expect(response?.status()).toBe(429);
  await expect(page.getByRole("heading", { name: "Too many certificate checks" })).toBeVisible();
  await expect(page.getByText(/Try again in \d+ seconds?\./)).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to Excel Supreme" })).toHaveAttribute("href", "/");
});
