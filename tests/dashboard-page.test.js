/**
 * The dashboard renderer, in both shapes: the whole track at `/learn` and one group at
 * `/learn/groups/<id>`.
 *
 * The group page reuses the dashboard's rows, payload and island, so the risks worth pinning are that it
 * quietly leaks another group's drills into the list, that it loses the section the island's count
 * updates, and that it starts ranking in a search engine.
 */
import assert from "node:assert/strict";
import { join } from "node:path";
import { describe, it } from "node:test";

import { readIcons } from "../legacy/src/site/assets.mjs";
import { siteConfig } from "../legacy/src/site/config.mjs";
import { loadContent } from "../legacy/src/site/content.mjs";
import { dashboardGroups, prepareDashboardPage, renderDashboardPage } from "../legacy/src/site/dashboard-page.mjs";

const ROOT = join(import.meta.dirname, "..");
const CONTENT = join(ROOT, "legacy/content");
const ENV = { SITE_URL: "https://drills.example", SITE_BUILT_AT: "2026-10-28" };

const config = siteConfig(ENV);
const { track, index } = loadContent(CONTENT);
const icons = readIcons(join(ROOT, "legacy/vendor/icons"));
const args = { config, track, index, icons, clientAvailable: true };

const groups = dashboardGroups({ track, index });
const rowsOf = (html) => [...html.matchAll(/data-lesson="([^"]+)"/g)].map((match) => match[1]);

describe("dashboardGroups", () => {
  it("keeps track order and drops the groups no lesson sits in", () => {
    const ids = groups.map((group) => group.id);
    assert.deepEqual(ids, track.groups.map((group) => group.id).filter((id) => ids.includes(id)));
    assert.equal(groups.length, new Set(index.map((entry) => entry.group)).size);
    for (const group of groups) {
      assert.deepEqual(
        group.entries.map((entry) => entry.exercise.id),
        index.filter((entry) => entry.group === group.id).map((entry) => entry.exercise.id),
      );
    }
  });
});

describe("prepareDashboardPage", () => {
  it("still renders the whole track when no group is asked for", () => {
    const { body, page } = prepareDashboardPage(args);
    assert.equal(page.path, "/learn");
    assert.equal(page.noindex, true);
    for (const group of groups) {
      assert.match(body, new RegExp(`id="group-${group.id}"`));
      assert.match(body, new RegExp(`aria-labelledby="group-${group.id}-heading"`));
      // The heading opens the group's own page; without it those pages are unreachable by clicking.
      assert.match(
        body,
        new RegExp(`<h2 id="group-${group.id}-heading"><a class="dash-group-link" href="/learn/groups/${group.id}">`),
      );
      assert.match(body, new RegExp(`data-group-count="${group.id}"`));
    }
    // Group-major on the page, curriculum order in the plan: the same drills either way.
    assert.deepEqual(
      [...rowsOf(body)].sort(),
      index.map((entry) => entry.exercise.id).sort(),
    );
  });

  for (const group of groups) {
    it(`renders /learn/groups/${group.id} as that group alone`, () => {
      const { body, page } = prepareDashboardPage({ ...args, group: group.id });

      assert.equal(page.path, `/learn/groups/${group.id}`);
      assert.equal(page.title, group.title);
      assert.equal(page.noindex, true);
      assert.equal(page.counter, `${group.entries.length} drill${group.entries.length === 1 ? "" : "s"}`);
      assert.ok(page.description.length <= 155, `description is ${page.description.length} characters`);
      assert.ok(!page.description.includes("\n"), "description is one line");

      // The drills, in track order, and nobody else's.
      assert.deepEqual(
        rowsOf(body),
        group.entries.map((entry) => entry.exercise.id),
      );
      for (const other of groups.filter((candidate) => candidate.id !== group.id)) {
        assert.ok(!body.includes(`id="group-${other.id}"`), `leaks the ${other.id} section`);
      }

      // One section, named for the group rather than by a heading, since the page's <h1> is the title.
      assert.match(body, new RegExp(`<h1>${group.title}</h1>`));
      assert.match(body, new RegExp(`id="group-${group.id}" aria-label="${group.title}">`));
      assert.ok(!body.includes(`id="group-${group.id}-heading"`), "repeats the title as a heading");
      assert.ok(!body.includes(`href="/learn/groups/${group.id}"`), "links to itself");
      assert.match(body, new RegExp(`data-group-count="${group.id}">0 of ${group.entries.length}<`));

      // The intro is authored as paragraphs; an HTML <p> would flatten them into one.
      const paragraphs = body.match(/<p class="dash-group-intro">/g) ?? [];
      assert.equal(paragraphs.length, group.intro.split(/\n{2,}/).filter((line) => line.trim()).length);

      // The island's payload and the way back to the track.
      assert.match(body, /<script type="application\/json" id="dashboard-data">/);
      assert.match(body, /<script type="module" src="\/assets\/client\/dashboard\.js"><\/script>/);
      assert.match(body, /<a class="link-btn" href="\/learn">All groups<\/a>/);
    });
  }

  it("ships no island when the client is unavailable", () => {
    const { body } = prepareDashboardPage({ ...args, clientAvailable: false, group: groups[0].id });
    assert.ok(!body.includes("/assets/client/dashboard.js"));
  });

  it("throws on a group that is not in the track, naming it", () => {
    assert.throws(() => prepareDashboardPage({ ...args, group: "nope" }), /no group "nope"/);
  });

  it("renders a document with the group's own title and a noindex", () => {
    const html = renderDashboardPage({ ...args, group: groups[0].id });
    assert.match(html, new RegExp(`<title>${groups[0].title}`));
    assert.match(html, /<meta name="robots" content="noindex">/);
    assert.match(html, new RegExp(`<body class="light dashboard-page">`));
  });
});
