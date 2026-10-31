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
const LAST = index[index.length - 1];
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
  // Nothing is finished, so the section that lists finished drills is not on screen at all.
  await expect(page.locator("#dash-recent-section")).toBeHidden();

  // A group header counts its own lessons, not the track's, and says nothing about zero.
  const firstGroup = page.locator("[data-group-count]").first();
  await expect(firstGroup).toHaveText(new RegExp(`^\\d+ drills?$`));
  await expect(page.locator("#dash-legend")).toBeHidden();
  await expect(page.locator("#dash-rail")).toBeHidden();
  // The group holding the next drill is open so the CTA and the list agree; the other 15 stay shut.
  await expect(page.locator(`#group-${GROUP.id}`)).toHaveAttribute("open", "");
  await expect(page.locator("details.dash-group[open]")).toHaveCount(1);
});

test("a lesson finished on its own page shows up here", async ({ page }) => {
  await page.goto(`/learn/excel/${index[0].slug}`);
  await page.fill("#formula", "=SUM(B2:B4)");
  await page.click("#check");
  await expect(page.locator("#feedback")).toHaveClass(/is-correct/);

  // The drill page reloads before the dashboard is opened: what the dashboard counts has to be what
  // survived a fresh document, not what the previous page still had in memory.
  await page.reload();
  await expect(page.locator(`.rail-item[data-lesson="${FIRST}"]`)).toHaveClass(/is-done/);

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
  await expect(page.locator("#dash-recent-section")).toBeHidden();
  await expect(page.locator("#dash-reset-section")).toBeHidden();

  // The seed script re-runs on every navigation, so the storage itself is what has to be empty.
  const stored = await page.evaluate(() => JSON.parse(window.localStorage.getItem("es.progress")));
  expect(stored.done).toEqual({});
});

test("erasing progress does not put the walls back", async ({ page }) => {
  // Reset forgets what was learnt, not the learner's decision to open the track: `armReset` keeps
  // `unlocked`. The seed is one-shot on purpose — an init script that re-runs on every navigation
  // would write the pre-reset record back and let this pass without the reset ever preserving it.
  await page.addInitScript(
    (record) => {
      if (window.sessionStorage.getItem("es.seeded") === "1") return;
      window.sessionStorage.setItem("es.seeded", "1");
      window.localStorage.setItem("es.progress", JSON.stringify(record));
    },
    {
      v: 1,
      done: { [FIRST]: { at: new Date().toISOString(), tries: 1, helped: false } },
      tries: {},
      unlocked: true,
    },
  );

  await page.goto("/learn");
  await expect(page.locator("#dash-complete")).toHaveText("1");

  const reset = page.locator("#dash-reset");
  await reset.click();
  await reset.click();
  await expect(page.locator("#dash-complete")).toHaveText("0");

  const stored = await page.evaluate(() => JSON.parse(window.localStorage.getItem("es.progress")));
  expect(stored.done).toEqual({});
  expect(stored.unlocked).toBe(true);

  // The last drill is behind both walls at once — the order gate and the paywall. Neither is one now.
  await page.goto(LAST.path);
  await expect(page.locator("#formula")).toBeVisible();
  await expect(page.locator("#paywall")).toHaveCount(0);
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

  // A group's own page is linked from inside its panel, so the reader opens the group first.
  const panel = page.locator(`#group-${GROUP.id}`);
  if (!(await panel.evaluate((details) => details.open))) await panel.locator("summary").click();
  await panel.locator(`a[href="/learn/groups/${GROUP.id}"]`).click();

  // The hub's heading says the skill and the tool, because that is what it ranks for.
  await expect(page.locator("h1")).toHaveText(`Excel exercises: ${GROUP.title}`);
  // Only this group's drills, and the island counting them rather than the whole track.
  await expect(page.locator(".lesson-row")).toHaveCount(GROUP_LESSONS.length);
  const crossGroup = index.filter((entry) => entry.group !== GROUP.id).map((entry) => entry.exercise.id);
  for (const id of crossGroup) await expect(page.locator(`[data-lesson="${id}"]`)).toHaveCount(0);
  await expect(page.locator(`[data-group-count="${GROUP.id}"]`)).toHaveText(`0 of ${GROUP_LESSONS.length}`);

  // The way back is the public hub, not the personal dashboard: a reader can arrive here from a search
  // result without ever having opened `/learn`.
  await page.click("a.link-btn[href='/excel-exercises']");
  await expect(page.locator("h1")).toHaveText("Excel exercises with instant answers");
});

test("group hubs are in the sitemap and indexable, and an unknown group is the not-found page", async ({
  page,
  request,
}) => {
  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).toContain(`/learn/groups/${GROUP.id}`);

  const hub = await request.get(`/learn/groups/${GROUP.id}`);
  expect(hub.status()).toBe(200);
  expect(await hub.text()).not.toContain('content="noindex"');

  // PPR answers the first request for an unknown param with a 200 shell, the same known consequence
  // phase-00 records for an unknown lesson slug. What a reader gets is the not-found page either way.
  await page.goto("/learn/groups/not-a-group");
  await expect(page.locator("h1")).toHaveText("That page is not a drill");
});
