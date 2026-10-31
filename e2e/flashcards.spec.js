import { expect, test } from "@playwright/test";

import { loadSite } from "../lib/site.js";

/**
 * Flashcards in a real browser.
 *
 * What only a browser can prove: a card built from a finished lesson renders, space turns it over, an
 * arrow grades it, the session advances, and a reload remembers the grade. The e2e environment has no
 * Supabase, so the completed lessons come from `es.progress` — which is exactly the store a signed-out
 * learner has, and the one the drill writes.
 */

const LESSON = "27-what-a-formula-actually-does";
/** The card says the lesson's title, and the title is copy: reading it from the content means a
 *  rewrite moves this assertion with it instead of turning a passing page into a failing test. */
const LESSON_TITLE = loadSite().index.find((entry) => entry.exercise.id === LESSON).exercise.title;
const SECOND = "03-countif-open-tickets";

/** The shape `legacy/src/client/state.js` reads: `{v, done, tries, unlocked}`. */
function progress(...ids) {
  const done = {};
  for (const [index, id] of ids.entries()) {
    done[id] = { at: new Date(Date.UTC(2026, 10, 1 + index)).toISOString(), tries: 1 };
  }
  return JSON.stringify({ v: 1, done, tries: {}, unlocked: true });
}

async function seed(page, value, deck) {
  await page.addInitScript(
    ([progressText, deckText]) => {
      window.localStorage.setItem("es.progress", progressText);
      if (deckText) window.localStorage.setItem("es.flashcards", deckText);
    },
    [value, deck ?? null],
  );
}

test("a browser with nothing finished is told why there are no cards", async ({ page }) => {
  await seed(page, progress());
  await page.goto("/flashcards");
  await expect(page.getByRole("heading", { name: "Flashcards" })).toBeVisible();
  await expect(page.getByText(/lessons you have finished, and there are none/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Your drills" })).toHaveAttribute("href", "/learn");
  await expect(page.getByRole("button", { name: "Turn over" })).toHaveCount(0);
});

test("a finished lesson becomes a card, space turns it over, an arrow grades it", async ({ page }) => {
  await seed(page, progress(LESSON));
  await page.goto("/flashcards");

  await expect(page.getByRole("heading", { name: /total the crates delivered this week/i })).toBeVisible();
  await expect(page.getByText(`Lesson 1 · ${LESSON_TITLE}`)).toBeVisible();
  await expect(page.getByText(/Card 1 of 1/)).toBeVisible();
  // The answer is not on the front of the card.
  await expect(page.getByRole("heading", { name: "Answer" })).toHaveCount(0);

  await page.keyboard.press("Space");
  await expect(page.getByRole("heading", { name: "Answer" })).toBeVisible();
  await expect(page.getByText("=SUM(B2:B4)")).toBeVisible();

  await page.keyboard.press("ArrowRight");
  await expect(page.getByText(/You went through 1 card this session/)).toBeVisible();
  await expect(page.getByText(/The next card is due on/)).toBeVisible();

  // The grade is in `es.flashcards`, so a reload does not ask the same card again.
  const saved = await page.evaluate(() => window.localStorage.getItem("es.flashcards"));
  expect(saved).toContain(`${LESSON}#`);
  await page.reload();
  // Nothing is due, so the deck does not claim a session it did not run.
  await expect(page.getByText(/You went through/)).toHaveCount(0);
  await expect(page.getByText("Nothing is due right now.")).toBeVisible();
  await expect(page.getByText(/The next card is due on/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Turn over" })).toHaveCount(0);
});

test("the buttons do the same job as the keys", async ({ page }) => {
  await seed(page, progress(LESSON, SECOND));
  await page.goto("/flashcards");

  await expect(page.getByText(/Card 1 of 2/)).toBeVisible();
  await page.getByRole("button", { name: "Turn over" }).click();
  await page.getByRole("heading", { name: "Answer" }).waitFor();
  // Four grades, each labelled with the interval it would schedule.
  await expect(page.getByRole("button", { name: /Again/ })).toBeVisible();
  await page.getByRole("button", { name: /Good/ }).click();
  await expect(page.getByText(/Card 2 of 2/)).toBeVisible();
});

test("grading `again` brings the card back next session", async ({ page }) => {
  await seed(page, progress(LESSON));
  await page.goto("/flashcards");
  await expect(page.getByText(/Card 1 of 1/)).toBeVisible();
  await page.keyboard.press("Space");
  await page.getByRole("button", { name: /Again/ }).click();
  await expect(page.getByText(/You went through 1 card/)).toBeVisible();

  await page.getByRole("button", { name: "Check what is due" }).click();
  await expect(page.getByText(/Card 1 of 1/)).toBeVisible();
  await expect(page.getByRole("heading", { name: /total the crates delivered this week/i })).toBeVisible();
});

test("the cards API answers about the lessons it was asked for, and nothing else", async ({ request }) => {
  const one = await request.get(`/api/flashcards?id=${LESSON}`);
  expect(one.status()).toBe(200);
  const payload = await one.json();
  expect(payload.ok).toBe(true);
  expect(payload.cards.length).toBe(1);
  expect(payload.cards[0].lessonId).toBe(LESSON);
  expect(payload.cards[0].answer.length).toBeGreaterThan(0);
  expect(payload.cards[0].explain.length).toBeGreaterThan(0);

  const none = await request.get("/api/flashcards");
  expect(none.status()).toBe(400);
  expect((await none.json()).error).toBe("no_lessons");

  const unknown = await request.get("/api/flashcards?id=not-a-lesson");
  expect((await unknown.json()).cards).toEqual([]);

  // A chord or sequence screen cannot be a card, so the lesson contributes only its formula.
  const mixed = await request.get(`/api/flashcards?id=${SECOND}`);
  const cards = (await mixed.json()).cards;
  expect(cards.length).toBe(1);
  expect(cards.every((card) => card.type === "formula" || card.type === "picture")).toBe(true);
});
