// What a signed-in browser sees, and where it comes back to.
//
// Two claims, both about state a learner reaches rather than a function that exists:
//
//   * The dashboard counts what the *database* holds, so a second browser or a fresh machine shows the
//     real total instead of an empty track (D10 / B13 — the read path `/api/progress` GET exists for this).
//   * A drill reopens where it was left, and a finished drill opens at the top rather than mid-sentence.
//
// The server-side rows are seeded through the service role: the write path is proved by `tests/db/`,
// and this spec is about the read path it fills.

import { expect, test } from "@playwright/test";

import { loadSite } from "../lib/site.js";

import {
  TWO_SCREEN_LESSON,
  address,
  deliver,
  finishLessons,
  forget,
  lifetimeEvent,
  reset,
  signIn,
  signUpThroughForm,
  userIdOf,
} from "./fixtures.js";

test.describe.configure({ mode: "serial" });

const made = [];

test.beforeAll(async () => {
  await reset();
});

test.afterAll(async () => {
  forget(...made);
});

const lessonIdFor = (slug) => loadSite().index.find((entry) => entry.slug === slug).exercise.id;

test("a signed-in learner on a second browser sees the progress the database holds", async ({
  page,
  browser,
}) => {
  const email = address("dashboard");
  made.push(email);

  await signUpThroughForm(page, email, "Dashboard Learner");
  const userId = userIdOf(email);

  const first = [loadSite().index[0].exercise.id, loadSite().index[1].exercise.id];
  await finishLessons(userId, first);

  // A different browser, same account: nothing in this context's localStorage says anything.
  const second = await browser.newContext();
  const other = await second.newPage();
  const errors = [];
  other.on("pageerror", (error) => errors.push(error.message));

  await signIn(other, email, "/learn");
  await other.goto("/learn");

  // The island fetches `/api/progress` on boot and repaints from the merge.
  await expect(other.locator("#dash-complete")).toHaveText('' + first.length, { timeout: 15_000 });
  await expect(other.locator("#dash-total")).not.toHaveText("0");
  expect(errors, errors.join("\n")).toEqual([]);

  // And the same count is what the local browser now keeps, so a later offline visit still knows it.
  const stored = await other.evaluate(() => window.localStorage.getItem("es.progress"));
  expect(stored, "the merge is written back to localStorage").toBeTruthy();
  expect(JSON.parse(stored).done).toBeTruthy();
  await second.close();
});

test("a drill reopens on the screen it was left on, and a finished one opens at the top", async ({
  page,
  request,
}) => {
  const email = address("resume");
  made.push(email);
  await signUpThroughForm(page, email, "Resume Learner");
  // The only drills with more than one screen are past the free three, so this learner buys one the
  // same way a real one does: a signed webhook, then a navigation.
  await deliver(request, lifetimeEvent(userIdOf(email), "resume"));

  const slug = TWO_SCREEN_LESSON.split("/").pop();
  const lessonId = lessonIdFor(slug);

  // Same origin, so the keys the drill reads are the keys this sets.
  await page.goto("/learn");

  // Part one: booting the drill records a position, even at the start.
  await page.goto(TWO_SCREEN_LESSON);
  await expect(page.locator("#screen-position")).toContainText("screen 1 of");
  const boot = await page.evaluate(() => JSON.parse(window.localStorage.getItem("es.resume") ?? "null"));
  expect(boot).toBeTruthy();
  expect(boot.slug).toBe(slug);
  expect(boot.index).toBe(0);

  // Part two: a stored position past the first screen is honoured on the next visit.
  await page.evaluate(
    ({ slug: key }) => window.localStorage.setItem("es.resume", JSON.stringify({ slug: key, index: 1, at: new Date().toISOString() })),
    { slug },
  );
  await page.reload();
  await expect(page.locator("#screen-position")).toContainText("screen 2 of");

  // Part three: a complete drill has nothing to resume, so it opens at the first screen again.
  await page.evaluate(
    ({ id }) => {
      const progress = { v: 1, done: {}, tries: {}, unlocked: false };
      progress.done[id] = { at: new Date().toISOString(), tries: 1, helped: false };
      window.localStorage.setItem("es.progress", JSON.stringify(progress));
    },
    { id: lessonId },
  );
  await page.reload();
  await expect(page.locator("#screen-position")).toContainText("screen 1 of");
});

test("the progress endpoint answers a signed-in learner with a record the island can parse", async ({
  page,
}) => {
  const email = address("record");
  made.push(email);
  await signUpThroughForm(page, email, "Record Learner");
  const userId = userIdOf(email);
  const ids = loadSite().index.slice(0, 3).map((entry) => entry.exercise.id);
  await finishLessons(userId, ids);

  const response = await page.request.get("/api/progress");
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.ok).toBe(true);
  expect(body.signed_in).toBe(true);
  expect(body.progress.v).toBe(1);
  expect(Object.keys(body.progress.done).length).toBe(ids.length);
  // Dated, so `parseProgress` keeps them; an undated row would degrade to a count instead.
  for (const row of Object.values(body.progress.done)) {
    expect(Number.isNaN(Date.parse(row.at))).toBe(false);
  }
});
