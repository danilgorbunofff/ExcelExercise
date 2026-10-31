/**
 * The static edition's error page. A static host answers an unknown address with one document the
 * deploy names; without it the reader loses the chrome and every way back. This asserts the page a
 * reader actually gets, not that a file exists: the status, the heading, the two doors.
 */
import { expect, test } from "@playwright/test";

const INVENTED = ["/no-such-page", "/excel/no-such-lesson", "/excel-functions/no-such-function", "/deep/path/that/is/not/real"];

for (const path of INVENTED) {
  test(`${path} answers 404 with the site's own page`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response?.status()).toBe(404);
    await expect(page.locator("h1")).toHaveText("That page is not here");
    await expect(page.locator('header.site')).toBeVisible();
    await expect(page.locator('footer.foot')).toBeVisible();
    // Two doors back: the front page, and the catalogue the reader was probably looking for.
    const back = page.locator("main .docs");
    await expect(back.locator('a[href="/"]')).toBeVisible();
    await expect(back.locator('a[href="/excel-exercises"]')).toBeVisible();
  });
}

test("the 404 page asks not to be indexed", async ({ page }) => {
  await page.goto("/no-such-page");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex");
});
