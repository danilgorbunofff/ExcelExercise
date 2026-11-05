/**
 * The preview a link turns into, in a browser: does the card a crawler is told about exist, at the size
 * the tags claim, and does the manifest name icons the server actually returns?
 *
 * `tests/social.test.js` proves the static build writes these files. What only the running app can
 * prove is that they survive the hop into `public/assets` and out through Next's static handler — a
 * generated file that is never copied is a 404 in the one place it matters.
 */
import { expect, test } from "@playwright/test";

const metaContent = (page, selector) => page.locator(selector).first().getAttribute("content");

test("the home page advertises a card the server returns at the size it claims", async ({ page, request }) => {
  await page.goto("/");

  const image = await metaContent(page, 'meta[property="og:image"]');
  expect(image, "the home page names no preview image").toBeTruthy();
  expect(new URL(image).pathname).toBe("/assets/social/home.png");
  expect(await metaContent(page, 'meta[name="twitter:card"]')).toBe("summary_large_image");
  expect(await metaContent(page, 'meta[property="og:image:alt"]')).toBeTruthy();

  // The tag is absolute because a crawler has no origin to resolve against; what has to exist is the
  // path, served by whichever host is answering right now.
  const response = await request.get(new URL(image).pathname);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("image/png");
  const bytes = await response.body();
  expect(bytes.subarray(1, 4).toString("ascii")).toBe("PNG");
  expect(bytes.readUInt32BE(16)).toBe(1200);
  expect(bytes.readUInt32BE(20)).toBe(630);
});

test("a lesson page previews the lesson card", async ({ page, request }) => {
  await page.goto("/");

  const lesson = await page.locator('a[href^="/learn/excel/"]').first().getAttribute("href");
  await page.goto(lesson);

  const image = await metaContent(page, 'meta[property="og:image"]');
  expect(image, "a lesson page names no preview image").toBeTruthy();
  expect(new URL(image).pathname).toBe("/assets/social/lesson.png");
  expect((await request.get(new URL(image).pathname)).status()).toBe(200);
});

test("the manifest is served, installable and its icons resolve", async ({ page, request }) => {
  await page.goto("/");

  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(href).toBe("/manifest.webmanifest");

  const response = await request.get("/manifest.webmanifest");
  expect(response.status()).toBe(200);
  const manifest = await response.json();
  expect(manifest.display).toBe("browser");
  expect(manifest.start_url).toBe("/");
  expect(manifest.icons.some((icon) => icon.purpose === "maskable")).toBe(true);

  for (const icon of manifest.icons) {
    const served = await request.get(icon.src);
    expect(served.status(), `${icon.src} is in the manifest but not served`).toBe(200);
    expect(served.headers()["content-type"]).toContain("image/png");
    const [width, height] = icon.sizes.split("x").map(Number);
    const bytes = await served.body();
    expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([width, height]);
  }
});

test("the touch icon a phone saves the site with resolves", async ({ page, request }) => {
  await page.goto("/");
  const href = await page.locator('link[rel="apple-touch-icon"]').getAttribute("href");
  expect(href).toBe("/assets/icons/apple-touch-icon.png");
  expect((await request.get(href)).status()).toBe(200);
});
