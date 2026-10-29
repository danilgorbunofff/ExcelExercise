/**
 * The feedback dialog, in a browser. `tests/feedback.test.js` covers the queue rules; what only the
 * browser can prove is the promise the dialog makes — that a note is kept here and nowhere else — so
 * every test below reads the queue and the event sink out of the page rather than trusting the copy.
 */
import { expect, test } from "@playwright/test";

const QUEUE_KEY = "es.feedback";

const openDialog = async (page) => {
  await page.goto("/");
  await page.click("#feedback-open");
  await expect(page.locator("#feedback-dialog")).toBeVisible();
};

const readQueue = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "[]"), QUEUE_KEY);

test("the footer opens a dialog that counts characters and closes on Escape", async ({ page }) => {
  await openDialog(page);

  const dialog = page.locator("#feedback-dialog");
  await expect(dialog).toHaveAttribute("aria-labelledby", "feedback-heading");
  await expect(page.locator("#feedback-count")).toHaveText("0 of 500 characters");

  await page.fill("#feedback-text", "the second step lost me");
  await expect(page.locator("#feedback-count")).toHaveText("23 of 500 characters");

  // Escape is the browser's own close, and the count has to be reset by the listener, not by luck.
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await page.click("#feedback-open");
  await expect(page.locator("#feedback-text")).toHaveValue("");
  await expect(page.locator("#feedback-count")).toHaveText("0 of 500 characters");
});

test("a note with no mood is refused, and the cursor lands on the choice", async ({ page }) => {
  await openDialog(page);
  await page.fill("#feedback-text", "no mood picked");
  await page.click("#feedback-form button[type='submit']");

  await expect(page.locator("#feedback-error")).toHaveText(
    "Pick the one that fits first. The note on its own is not enough.",
  );
  await expect(page.locator("#feedback-dialog")).toBeVisible();
  await expect(page.locator("input[name='mood']").first()).toBeFocused();

  // Nothing was filed by a refused submission.
  expect(await readQueue(page)).toEqual([]);
});

test("a sent note is queued here and the dialog says nothing was sent", async ({ page }) => {
  await openDialog(page);
  await page.check("input[name='mood'][value='stuck']");
  await page.fill("#feedback-text", "  counting by hand, I keep losing my place  ");
  await page.click("#feedback-form button[type='submit']");

  await expect(page.locator("#feedback-form")).toBeHidden();
  await expect(page.locator("#feedback-done-note")).toContainText("Saved in this browser, and nowhere else");
  await expect(page.locator("#feedback-done-note")).toContainText("nothing has been sent");

  const queue = await readQueue(page);
  expect(queue).toHaveLength(1);
  expect(queue[0]).toMatchObject({
    mood: "stuck",
    text: "counting by hand, I keep losing my place",
    route: "/",
  });
  expect(typeof queue[0].at).toBe("string");

  // The funnel sees that a note was filed, and how long it was — never what it said.
  const event = await page.evaluate(() =>
    (globalThis.__esEvents ?? []).find((entry) => entry.type === "feedback_sent"),
  );
  expect(event).toMatchObject({ mood: "stuck", chars: 40, kept: 1, stored: true });
  expect(JSON.stringify(event)).not.toContain("losing my place");

  // And it survives the reload the learner will do next.
  await page.reload();
  expect(await readQueue(page)).toHaveLength(1);
});

test("the queue stops at twenty notes so it cannot crowd out the progress record", async ({ page }) => {
  const seeded = Array.from({ length: 20 }, (_, at) => ({
    mood: "progress",
    text: `note ${at}`,
    route: "/",
    at: new Date(2024, 0, 1, 0, at).toISOString(),
  }));
  await page.addInitScript(
    ([key, entries]) => localStorage.setItem(key, JSON.stringify(entries)),
    [QUEUE_KEY, seeded],
  );

  await openDialog(page);
  await page.check("input[name='mood'][value='clicked']");
  await page.fill("#feedback-text", "the newest note");
  await page.click("#feedback-form button[type='submit']");

  const queue = await readQueue(page);
  expect(queue).toHaveLength(20);
  expect(queue.at(-1).text).toBe("the newest note");
  expect(queue.some((entry) => entry.text === "note 0")).toBe(false);
  expect(queue[0].text).toBe("note 1");
});

test("a browser that refuses storage is told so instead of being thanked", async ({ page }) => {
  await page.addInitScript(() => {
    const refuse = () => {
      throw new Error("quota");
    };
    Storage.prototype.setItem = refuse;
  });

  await openDialog(page);
  await page.check("input[name='mood'][value='progress']");
  await page.fill("#feedback-text", "this one will not be kept");
  await page.click("#feedback-form button[type='submit']");

  await expect(page.locator("#feedback-done-note")).toContainText("refused to keep the note");
  await expect(page.locator("#feedback-done-note")).toContainText("Nothing was sent");

  const event = await page.evaluate(() =>
    (globalThis.__esEvents ?? []).find((entry) => entry.type === "feedback_sent"),
  );
  expect(event).toMatchObject({ stored: false, kept: 0 });
});
