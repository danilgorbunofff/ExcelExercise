// The certificate: refused until the track is finished, issued once, and readable by a stranger.
//
// The middle claim is the interesting one — a second POST must return the certificate already held
// rather than minting a second one — and the last one is the public URL a recruiter opens.

import { expect, test } from "@playwright/test";

import { loadSite } from "../lib/site.js";

import { address, finishLessons, forget, reset, signUpThroughForm, userIdOf } from "./fixtures.js";

test.describe.configure({ mode: "serial" });

const made = [];

test.beforeAll(async () => {
  await reset();
});

test.afterAll(async () => {
  forget(...made);
});

const required = () => loadSite().index.map((entry) => entry.exercise.id);

test("signed out, the certificate route asks for a session", async ({ page }) => {
  const response = await page.request.post("/api/certificate", {
    data: { name: "Nobody", nameAgain: "Nobody" },
  });
  expect(response.status()).toBe(401);
});

test("an unfinished track is refused with the count, and a mismatched name is refused first", async ({
  page,
}) => {
  const email = address("certificate-early");
  made.push(email);
  await signUpThroughForm(page, email, "Early Learner");

  const mismatch = await page.request.post("/api/certificate", {
    data: { name: "Early Learner", nameAgain: "Early Leanner" },
  });
  expect(mismatch.status()).toBe(400);
  expect((await mismatch.json()).error).toContain("do not match");

  const unfinished = await page.request.post("/api/certificate", {
    data: { name: "Early Learner", nameAgain: "Early Learner" },
  });
  expect(unfinished.status()).toBe(409);
  const body = await unfinished.json();
  expect(body.error).toContain("0 of");
  expect(body.error).toContain("done");
});

test("a finished track is issued once, and the credential verifies for anyone", async ({ page, browser }) => {
  const email = address("certificate");
  made.push(email);
  await signUpThroughForm(page, email, "Certificate Learner");
  const userId = userIdOf(email);
  await finishLessons(userId, required());

  const issued = await page.request.post("/api/certificate", {
    data: { name: "Certificate Learner", nameAgain: "Certificate Learner" },
  });
  expect(issued.status()).toBe(200);
  const first = await issued.json();
  expect(first.ok).toBe(true);
  expect(first.existing).toBe(false);
  expect(first.credentialId).toMatch(/^[0-9A-HJKMNP-TV-Z]{16}$/);

  const again = await page.request.post("/api/certificate", {
    data: { name: "Someone Else", nameAgain: "Someone Else" },
  });
  expect(again.status()).toBe(200);
  const second = await again.json();
  expect(second.existing).toBe(true);
  expect(second.credentialId).toBe(first.credentialId);

  // A stranger with no session reads it, which is the whole point of a credential.
  const stranger = await browser.newContext();
  const anonymous = await stranger.newPage();
  const verified = await anonymous.goto(`/verify/${first.credentialId}`);
  expect(verified.status()).toBe(200);
  await expect(anonymous.getByText("Certificate Learner").first()).toBeVisible();
  await stranger.close();

  // And the owner's own page shows it rather than offering to issue a second.
  await page.goto("/certificate");
  await expect(page.locator("body")).toContainText("Certificate Learner");
});

/**
 * The page's hardest print: sixty characters with no space in them, in a script that does not break
 * at a hyphen. A name is the one line on the certificate that comes from the learner, and a sheet
 * that clips it or pushes it off the paper is a document that fails the person who earned it.
 *
 * Two papers, because the sheet is a page rather than a screen: A4 is 210mm and Letter is 216mm, so
 * A4 is the narrower constraint and both are checked rather than assuming one implies the other.
 * Two pages, because they are different documents: the owner's page is what the learner prints,
 * and the public record is the sheet a stranger prints to check it.
 */
const HOSTILE = "АлександрНиколаевичДостоевский".repeat(3).slice(0, 60);

// The printable width of each paper at 96 dpi, minus the stylesheet's 16mm margins: what the sheet
// actually has to fit inside. 1mm = 96/25.4 CSS pixels.
const PAPER = [
  { format: "A4", widthPx: Math.round((210 - 32) * (96 / 25.4)) },
  { format: "Letter", widthPx: Math.round((215.9 - 32) * (96 / 25.4)) },
];

async function expectPrintsInside(page, { path, format, widthPx, credentialId }) {
  await page.goto(path);
  await page.emulateMedia({ media: "print" });
  // The paper's usable width, not the laptop's: a page that only fits a 1280px screen has not been
  // printed at all.
  await page.setViewportSize({ width: widthPx, height: 1_000 });

  const overflow = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(overflow.scroll, `${path} on ${format}: the sheet is wider than the paper`).toBeLessThanOrEqual(
    overflow.client + 1,
  );

  // The address a stranger checks it at has to be on the paper, or the printed sheet is a claim with
  // no way to test it.
  await expect(page.locator(".certificate-print-url")).toBeVisible();
  await expect(page.locator(".certificate-print-url")).toContainText(`/verify/${credentialId}`);

  const pdf = await page.pdf({ format, printBackground: true });
  expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
  expect(pdf.byteLength, `${path} on ${format}: the PDF is empty`).toBeGreaterThan(10_000);

  await page.emulateMedia({ media: "screen" });
}

test("a sixty-character name prints inside the paper, on both sizes", async ({ page }) => {
  expect([...HOSTILE]).toHaveLength(60);
  const email = address("certificate-print");
  made.push(email);
  await signUpThroughForm(page, email, "Print Learner");
  const userId = userIdOf(email);
  await finishLessons(userId, required());

  const issued = await page.request.post("/api/certificate", {
    data: { name: HOSTILE, nameAgain: HOSTILE },
  });
  expect(issued.status()).toBe(200);
  const { credentialId } = await issued.json();

  // The owner's page names it in the facts list; the public record sets it as the sheet's headline.
  await page.goto("/certificate");
  await expect(page.locator("body")).toContainText(HOSTILE);
  await page.goto(`/verify/${credentialId}`);
  await expect(page.locator(".certificate-name")).toHaveText(HOSTILE);

  for (const { format, widthPx } of PAPER) {
    await expectPrintsInside(page, { path: "/certificate", format, widthPx, credentialId });
    await expectPrintsInside(page, { path: `/verify/${credentialId}`, format, widthPx, credentialId });
  }
});

test("an invented credential id is not a certificate", async ({ page }) => {
  const response = await page.goto("/verify/ZZZZZZZZZZZZZZZZ");
  expect(response.status()).toBe(200); // the page answers; what it says is "not found"
  await expect(page.locator("body")).not.toContainText("Certificate Learner");
  await expect(page.locator("body")).toContainText(/not found|no certificate|does not exist/i);
});
