import { expect, test } from "@playwright/test";

/**
 * The two certificate routes in a browser with no accounts configured.
 *
 * What only a browser can prove: the public record answers a stranger without redirecting them to a
 * login, and each of the three "cannot answer" branches says a different, true thing. The e2e
 * environment has no Supabase, so the branches under test are the ones a fresh clone renders —
 * "cannot be checked here", not "does not exist", which would be a false claim about the credential.
 */

/** Sixteen characters from the credential alphabet: digits and A-H, J-N, P-T, V-Z. */
const SHAPED = "ABCDEFGHJKMNPQRS";
/** Same sixteen, but lowercase — the record is asked for in whichever case the holder typed. */
const SHAPED_LOWER = "abcdefghjkmnpqrs";
/** Sixteen characters that include the four the alphabet excludes: I, L, O and U. */
const UNSHAPED = "ABCDEFGHIJKLMNOP";

test("a credential-shaped id is answered, and this deployment says it cannot check it", async ({ page }) => {
  const response = await page.goto(`/verify/${SHAPED}`);
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Check a certificate" })).toBeVisible();
  // The distinction that matters: this deployment has no database — the credential is not "missing".
  await expect(page.getByText(/cannot be checked on this deployment/)).toBeVisible();
  await expect(page.getByText(/no database configured/)).toBeVisible();
  await expect(page.getByText(/No certificate has that credential id/)).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Your certificate" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "The drills" })).toHaveAttribute("href", "/learn");
});

test("the id is read in either case, so a typed lowercase credential resolves the same way", async ({ page }) => {
  await page.goto(`/verify/${SHAPED_LOWER}`);
  await expect(page.getByText(/cannot be checked on this deployment/)).toBeVisible();
  await expect(page.getByText(/That is not a credential id/)).toHaveCount(0);
});

test("an id that is not credential-shaped is a typo, not a missing record", async ({ page }) => {
  await page.goto(`/verify/${UNSHAPED}`);
  await expect(page.getByRole("heading", { name: "Check a certificate" })).toBeVisible();
  await expect(page.getByText(/That is not a credential id/)).toBeVisible();
  // The alphabet is spelled out, because the fix is to re-read one character.
  await expect(page.getByText(/without I, L, O or U/)).toBeVisible();
  await expect(page.getByText(/cannot be checked on this deployment/)).toHaveCount(0);
});

test("a short id is rejected on length before anything is looked up", async ({ page }) => {
  await page.goto("/verify/ABC123");
  await expect(page.getByText(/That is not a credential id/)).toBeVisible();
});

test("the certificate page tells a signed-out learner that a certificate names an account", async ({ page }) => {
  await page.goto("/certificate");
  await expect(page.getByRole("heading", { name: "Certificate" })).toBeVisible();
  // No account store here, so the honest state is the unconfigured one rather than a sign-in prompt.
  await expect(page.getByText(/Accounts are not configured on this deployment/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Your drills" })).toHaveAttribute("href", "/learn");
  // Nothing on this page can issue yet, so the name-twice form is not offered.
  await expect(page.getByRole("button", { name: /issue/i })).toHaveCount(0);
  await expect(page.getByText(/cannot be changed afterwards/)).toHaveCount(0);
});

test("a credential record is not offered to search engines", async ({ page }) => {
  await page.goto(`/verify/${SHAPED}`);
  // A credential names one person; it belongs in a résumé link, not in a search result.
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
});

/**
 * What the sheet does on paper. The certificate has no server-rendered PDF — `window.print()` is the
 * renderer — so the print stylesheet *is* the artifact, and the failure worth catching is the obvious
 * one: printing the site's chrome along with the document, which is what happens when nobody writes a
 * print stylesheet at all.
 */
test("printing keeps the document and drops the site chrome", async ({ page }) => {
  await page.emulateMedia({ media: "print" });
  await page.goto(`/verify/${SHAPED}`);
  // Navigation, the footer's feedback button and the skip link are browser furniture, not the document.
  await expect(page.locator("header.site")).toBeHidden();
  await expect(page.locator("footer.foot")).toBeHidden();
  await expect(page.locator("a.skip")).toBeHidden();
  // The page's own words survive.
  await expect(page.getByRole("heading", { name: "Check a certificate" })).toBeVisible();
  await expect(page.getByText(/cannot be checked on this deployment/)).toBeVisible();
});

test("a page with no record to print offers no print button", async ({ page }) => {
  await page.goto(`/verify/${SHAPED}`);
  // Honest absence: this deployment has nothing to print, so there is no button pretending otherwise.
  await expect(page.getByRole("button", { name: /print/i })).toHaveCount(0);
});
