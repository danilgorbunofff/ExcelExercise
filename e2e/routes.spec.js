/**
 * The URL contract: every address the static build published still resolves on the ported app, and
 * an address that was never ours is a real 404 rather than a blank 200.
 */
import { expect, test } from "@playwright/test";

import { loadSite } from "../lib/site.js";

const LESSON_COUNT = loadSite().index.length;

test("the legacy lesson URLs redirect to the ported route", async ({ request }) => {
  const response = await request.get("/excel/sum-basics", { maxRedirects: 0 });
  expect(response.status()).toBe(308);
  expect(response.headers().location).toBe("/learn/excel/sum-basics");
});

test("/index.html redirects to the root", async ({ request }) => {
  const response = await request.get("/index.html", { maxRedirects: 0 });
  expect(response.status()).toBe(308);
  expect(response.headers().location).toBe("/");
});

test("an unknown path answers 404 with the site chrome", async ({ page }) => {
  const response = await page.goto("/nothing-here");
  expect(response.status()).toBe(404);
  await expect(page.locator("h1")).toHaveText("That page is not a drill");
  await expect(page.locator(".site .brand")).toBeVisible();
  await expect(page.locator("a.btn-primary")).toHaveAttribute("href", "/");
});

test("/api/health reports the deploy identity", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.status).toBe("ok");
  expect(typeof body.sha).toBe("string");
  expect(body.sha.length).toBeGreaterThan(0);

  // CI exports the commit it is testing; the endpoint echoes it, which is what makes an external
  // probe able to tell two deploys apart.
  const expected = process.env.GIT_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA;
  if (expected) expect(body.sha).toBe(expected);
});

test("no page asks a third-party origin for anything", async ({ page }) => {
  const foreign = [];
  page.on("request", (request) => {
    const { hostname } = new URL(request.url());
    if (hostname !== "127.0.0.1" && hostname !== "localhost") foreign.push(request.url());
  });

  await page.goto("/");
  await page.goto("/learn/excel/sum-basics");
  expect(foreign, "the zero-third-party promise is a product feature, not an optimisation").toEqual([]);
});

test("the sitemap and robots the app serves describe the routes it actually has", async ({ request }) => {
  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  expect(sitemap.headers()["content-type"]).toContain("xml");
  const locs = [...(await sitemap.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  expect(locs).toHaveLength(LESSON_COUNT + 1);
  for (const loc of locs) {
    const { pathname } = new URL(loc);
    // A sitemap full of redirects is worse than none: `/excel/*` only ever 308s.
    expect(pathname === "/" || pathname.startsWith("/learn/excel/"), `${loc} is not a served route`).toBe(true);
  }

  const robots = await request.get("/robots.txt");
  expect(robots.status()).toBe(200);
  const text = await robots.text();
  expect(text).toContain("Allow: /");
  expect(text).toMatch(/^Sitemap: \S+\/sitemap\.xml$/m);
});
