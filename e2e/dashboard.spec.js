/**
 * `/learn` in a real browser. The read model is covered by `tests/progress.test.js`; what only the
 * browser can prove is that the page and the drill agree on where progress lives — one writes
 * `localStorage`, the other reads it, and neither is any use if the key or the shape drifts.
 */
import { expect, test } from "@playwright/test";

import { loadSite } from "../lib/site.js";

const { track, index } = loadSite();
const LESSONS = index.length;
const FIRST = index[0].exercise.id;
// The group the first drill sits in: more than one drill, so the page's own count has work to do.
const GROUP = track.groups.find((group) => group.id === index[0].group);
const GROUP_LESSONS = index.filter((entry) => entry.group === GROUP.id);

/** Seed a finished drill the way the drill page would have left it. */
async function seedProgress(page, done) {
  await page.addInitScript((entries) => {
    window.localStorage.setItem("es.progress", JSON.stringify({ v: 1, done: entries, tries: {} }));
  }, done);
}

test("the dashboard lists every drill and opens on the first one", async ({ page }) => {
  await page.goto("/learn");

  await expect(page.locator(".lesson-row")).toHaveCount(LESSONS);
  await expect(page.locator("#dash-complete")).toHaveText("0");
  await expect(page.locator("#dash-total")).toHaveText(String(LESSONS));
  await expect(page.locator("#dash-note")).toHaveText(
    "Nothing started yet. The first drill is one formula and about two minutes.",
  );
  await expect(page.locator("#dash-next-label")).toHaveText(`Start drill 1 · ${index[0].exercise.title}`);
  await expect(page.locator("#dash-next-link")).toHaveAttribute("href", index[0].path);
  await expect(page.locator("#dash-recent")).toContainText("Nothing finished yet");

  // A group header counts its own lessons, not the track's.
  await expect(page.locator("[data-group-count]").first()).toHaveText(new RegExp(`^0 of \\d+$`));
});

test("a lesson finished on its own page shows up here", async ({ page }) => {
  await page.goto(`/learn/excel/${index[0].slug}`);
  await page.fill("#formula", "=SUM(B2:B4)");
  await page.click("#check");
  await expect(page.locator("#feedback")).toHaveClass(/is-correct/);

  await page.goto("/learn");

  await expect(page.locator("#dash-complete")).toHaveText("1");
  await expect(page.locator(`[data-lesson="${FIRST}"]`)).toHaveAttribute("data-badge", "complete");
  await expect(page.locator(`[data-lesson="${FIRST}"] .badge-pill`)).toHaveText("Complete");
  await expect(page.locator("#dash-next-label")).toHaveText(`Start drill 2 · ${index[1].exercise.title}`);
  await expect(page.locator("#dash-recent")).toContainText(index[0].exercise.title);
});

test("a stale completion is called stale, not complete", async ({ page }) => {
  await seedProgress(page, {
    [FIRST]: { at: "2020-01-01T00:00:00.000Z", tries: 1, helped: false },
  });
  await page.goto("/learn");

  await expect(page.locator(`[data-lesson="${FIRST}"]`)).toHaveAttribute("data-badge", "stale");
  await expect(page.locator(`[data-lesson="${FIRST}"] .badge-pill`)).toHaveText("Stale");
  await expect(page.locator("#dash-note")).toContainText("1 going stale.");
});

/** Every drill solved, in the shape and at the time the caller asks for. */
function allDone(overrides = {}) {
  const now = new Date().toISOString();
  const done = {};
  for (const entry of index) done[entry.exercise.id] = { at: now, tries: 1, helped: false };
  return { ...done, ...overrides };
}

test("a finished track says so and offers no button", async ({ page }) => {
  await seedProgress(page, allDone());
  await page.goto("/learn");

  await expect(page.locator("#dash-complete")).toHaveText(String(LESSONS));
  await expect(page.locator("#dash-note")).toContainText("Every drill is finished.");
  await expect(page.locator("#dash-next-label")).toHaveText("You have finished the track");
  await expect(page.locator("#dash-next-link")).toBeHidden();
  await expect(page.locator("#dash-next-why")).toContainText("Nothing is stale and nothing wants practice.");
});

test("a finished track points at the drill that has gone coldest", async ({ page }) => {
  const stale = index[3];
  await seedProgress(page, allDone({ [stale.exercise.id]: { at: "2020-01-01T00:00:00.000Z", tries: 1, helped: false } }));
  await page.goto("/learn");

  await expect(page.locator("#dash-next-label")).toHaveText(`Revisit drill ${stale.number} · ${stale.exercise.title}`);
  await expect(page.locator("#dash-next-link")).toHaveAttribute("href", stale.path);
  await expect(page.locator(`[data-lesson="${stale.exercise.id}"]`)).toHaveAttribute("data-badge", "stale");
});

test("resetting asks twice and then forgets everything", async ({ page }) => {
  await seedProgress(page, {
    [FIRST]: { at: new Date().toISOString(), tries: 1, helped: false },
  });
  await page.goto("/learn");
  await expect(page.locator("#dash-complete")).toHaveText("1");

  const reset = page.locator("#dash-reset");
  await expect(reset).toBeVisible();
  await reset.click();
  await expect(reset).toHaveText("Click again to erase");
  await expect(page.locator("#dash-complete")).toHaveText("1");

  await reset.click();
  await expect(page.locator("#dash-complete")).toHaveText("0");
  await expect(page.locator("#dash-note")).toHaveText(
    "Nothing started yet. The first drill is one formula and about two minutes.",
  );
  await expect(page.locator("#dash-recent")).toContainText("Nothing finished yet");
  await expect(page.locator("#dash-reset-section")).toBeHidden();

  // The seed script re-runs on every navigation, so the storage itself is what has to be empty.
  const stored = await page.evaluate(() => JSON.parse(window.localStorage.getItem("es.progress")));
  expect(stored.done).toEqual({});
});

test("a browser that refuses storage is told so, not shown zero", async ({ page }) => {
  // The failure mode this closes: a learner in a locked-down browser sees "0 of 16" and is told they
  // have done nothing, when the truth is that the page cannot read what they did.
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new DOMException("storage is blocked", "SecurityError");
      },
    });
  });
  await page.goto("/learn");

  await expect(page.locator("#dash-note")).toHaveText(
    "This browser blocks local storage, so nothing is saved. The drills still work, but this page cannot remember them.",
  );
  await expect(page.locator(".lesson-row")).toHaveCount(LESSONS);
  // Nothing to erase, and offering to erase it would be a lie too.
  await expect(page.locator("#dash-reset-section")).toBeHidden();
});

test("the dashboard stays out of the sitemap and out of the index", async ({ request }) => {
  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).not.toContain("/learn</loc>");
  expect(sitemap).not.toContain("/learn<");

  const response = await request.get("/learn");
  expect(response.status()).toBe(200);
});

test("a group heading opens that group on its own, and back returns to the track", async ({ page }) => {
  expect(GROUP_LESSONS.length).toBeGreaterThan(1);

  await page.goto("/learn");
  await page.click(`a[href="/learn/groups/${GROUP.id}"]`);

  await expect(page.locator("h1")).toHaveText(GROUP.title);
  // Only this group's drills, and the island counting them rather than the whole track.
  await expect(page.locator(".lesson-row")).toHaveCount(GROUP_LESSONS.length);
  const crossGroup = index.filter((entry) => entry.group !== GROUP.id).map((entry) => entry.exercise.id);
  for (const id of crossGroup) await expect(page.locator(`[data-lesson="${id}"]`)).toHaveCount(0);
  await expect(page.locator(`[data-group-count="${GROUP.id}"]`)).toHaveText(`0 of ${GROUP_LESSONS.length}`);

  await page.click("a.link-btn[href='/learn']");
  await expect(page.locator("h1")).toHaveText("Where you are");
  await expect(page.locator(".lesson-row")).toHaveCount(LESSONS);
});

test("group pages stay out of the sitemap, and an unknown group is the not-found page", async ({
  page,
  request,
}) => {
  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).not.toContain("/learn/groups/");

  expect((await request.get(`/learn/groups/${GROUP.id}`)).status()).toBe(200);

  // PPR answers the first request for an unknown param with a 200 shell, the same known consequence
  // phase-00 records for an unknown lesson slug. What a reader gets is the not-found page either way.
  await page.goto("/learn/groups/not-a-group");
  await expect(page.locator("h1")).toHaveText("That page is not a drill");
});
