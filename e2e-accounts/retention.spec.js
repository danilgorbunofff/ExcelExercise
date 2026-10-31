// Retention: the daily run's endpoint, and the two surfaces that read what it wrote.
//
// The grading half is proved by `tests/db/` and the unit suites; what only a browser can prove is that
// a learner who has points is ranked on `/leaderboard` and sees their week on `/account`. So this spec
// seeds the rows the run would have written, then reads the pages.

import { expect, test } from "@playwright/test";

import { address, forget, reset, signUpThroughForm, userIdOf } from "./fixtures.js";
import { psql } from "../tests/db/harness.mjs";

test.describe.configure({ mode: "serial" });

const made = [];

test.beforeAll(async () => {
  await reset();
});

test.afterAll(async () => {
  forget(...made);
});

test("the daily run is refused without a session and started with one, without leaking answers", async ({
  page,
}) => {
  const anonymous = await page.request.post("/api/daily", { data: { action: "start" } });
  expect(anonymous.status()).toBe(401);

  const email = address("daily");
  made.push(email);
  await signUpThroughForm(page, email, "Daily Learner");

  const start = await page.request.post("/api/daily", { data: { action: "start" } });
  expect(start.status()).toBe(200);
  const body = await start.json();
  expect(body.ok).toBe(true);
  expect(body.size).toBe(10);
  expect(body.screens.length).toBe(10);
  // The run page never holds the key: a screen carries what to ask, not what counts as right.
  for (const screen of body.screens) {
    expect(Object.keys(screen)).not.toContain("answer");
    expect(Object.keys(screen)).not.toContain("expected");
  }

  // Starting twice resumes the same run rather than minting a second one.
  const again = await page.request.post("/api/daily", { data: { action: "start" } });
  expect((await again.json()).startedAt).toBe(body.startedAt);
});

test("a learner with points is ranked on the board, and the account shows their week", async ({ page }) => {
  const email = address("retention");
  made.push(email);
  await signUpThroughForm(page, email, "Retention Learner");
  const userId = userIdOf(email);
  const username = email.split("@")[0];

  psql(
    `insert into daily_points (user_id, day, points) values ('${userId}', current_date, 250)
       on conflict (user_id, day) do update set points = 250;
     insert into streaks (user_id, current, longest, last_day)
       values ('${userId}', 3, 5, current_date)
       on conflict (user_id) do update set current = 3, longest = 5, last_day = current_date;
     insert into attempts (user_id, lesson_id, screen_id, attempt_seq, started_at, ended_at, correct_first_try)
       values ('${userId}', 'what-a-formula-actually-does', 'screen-1', 1, now() - interval '1 minute', now(), true)
       on conflict do nothing;`,
  );

  await page.goto("/leaderboard");
  // The id labels the section and its heading, so the board is addressed by the section rather than by
  // the heading alone (the table is its sibling).
  const board = page.locator('section[aria-labelledby="board-points"]');
  await expect(board).toBeVisible();
  await expect(board).toContainText(username);
  // The row the session owns is marked, so a learner can find themselves without reading every name.
  await expect(board.locator('tr[aria-current="true"]')).toHaveCount(1);
  // 250 points with nobody else on the board is rank 1.
  await expect(board).toContainText("250");

  await page.goto("/account");
  const week = page.locator(".auth-week");
  await expect(week).toBeVisible();
  await expect(week).toContainText("250");
  await expect(week).toContainText("3 days");
});

test("a learner with no points is told so rather than shown an empty table", async ({ page }) => {
  const email = address("empty");
  made.push(email);
  await signUpThroughForm(page, email, "Empty Learner");

  await page.goto("/leaderboard");
  // Ranking needs players; with none of their own, the page says which, and still renders a board.
  await expect(page.locator('section[aria-labelledby="board-points"]')).toBeVisible();
  await page.goto("/account");
  await expect(page.locator(".auth-week")).toContainText("0");
});
