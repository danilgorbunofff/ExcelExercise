/**
 * The two pages a reader checks before trusting a refund term, plus the two endpoints the account page
 * points at. `tests/legal.test.js` proves the documents say the right things and `tests/db/legal.spec.js`
 * proves the database honours them; this file is the only one that can say the shipped build serves
 * them at the URLs the footer links to, with the metadata a crawler reads.
 */
import { expect, test } from "@playwright/test";

const PAGES = [
  {
    path: "/privacy",
    title: "What this site keeps, and what it never sees",
    must: ["no analytics script", "es.progress", "Kept, unlinked from you:", "It happens immediately"],
  },
  {
    path: "/terms",
    title: "The deal, in plain English",
    must: ["$59.99/year", "not affiliated with", "not been reviewed by a lawyer", "refund"],
  },
];

for (const page of PAGES) {
  test(`${page.path} is served, indexable, and says what it promises`, async ({ page: view }) => {
    const response = await view.goto(page.path);
    expect(response.status()).toBe(200);

    await expect(view.locator("#main h1")).toHaveText(page.title);

    // Indexable on purpose: these are the pages a search result should be able to land on. The
    // sitemap lists them, so a `noindex` here would be a page that asks not to be found.
    const robots = view.locator('meta[name="robots"]');
    if ((await robots.count()) > 0) {
      await expect(robots).not.toHaveAttribute("content", /noindex/);
    }

    const text = await view.locator("#main").innerText();
    for (const probe of page.must) {
      expect(text, `${page.path} does not mention ${JSON.stringify(probe)}`).toContain(probe);
    }

    // Both legal pages are reachable from the footer of every page, not only from each other.
    await expect(view.locator("footer.foot")).toContainText("Privacy");
    await expect(view.locator("footer.foot")).toContainText("Terms");
  });
}

test("the sitemap lists both pages, and the home page", async ({ request }) => {
  const response = await request.get("/sitemap.xml");
  expect(response.status()).toBe(200);
  const xml = await response.text();
  for (const path of ["/", "/privacy", "/terms"]) {
    const loc = path === "/" ? /<loc>https?:\/\/[^<]+<\/loc>/ : new RegExp(`<loc>https?://[^<]+${path}</loc>`);
    expect(xml, `sitemap is missing ${path}`).toMatch(loc);
  }
  expect(xml).not.toContain("/pricing");
  expect(xml).not.toContain("/account");
});

test("the export refuses a signed-out caller, and says why", async ({ request }) => {
  const response = await request.get("/api/account/export");
  // With accounts unconfigured (CI, a fresh clone) the honest answer is 503 and a reason; with them
  // configured and no session it is a 401. Both are refusals, and neither may be a JSON file.
  expect([401, 503]).toContain(response.status());
  expect(response.headers()["content-disposition"]).toBeUndefined();
  const body = await response.json();
  expect(body.ok).toBe(false);
  expect(["account_export_unconfigured", "sign_in_required"]).toContain(body.error);
});

test("the delete endpoint refuses a signed-out caller before it reads a confirmation word", async ({ request }) => {
  const response = await request.post("/api/account/delete", { form: { confirm: "delete my account" } });
  expect([401, 503]).toContain(response.status());
  const body = await response.json();
  expect(["account_delete_unconfigured", "sign_in_required"]).toContain(body.error);
});

test("the confirmation page is reachable without a session, and says what happened", async ({ page }) => {
  // It is the one `/account` path the proxy lets through: by the time it renders, the session it would
  // have gated on has been deleted on purpose.
  const response = await page.goto("/account/deleted");
  expect(response.status()).toBe(200);
  await expect(page.locator(".auth-card h1")).toHaveText("Your account is gone");
  await expect(page.locator(".auth-card")).toContainText("no name or email");
  await expect(page.locator('.auth-card a[href="/privacy"]')).toHaveCount(2); // the sentence and the links list
});
