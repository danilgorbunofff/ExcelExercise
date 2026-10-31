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
      // A group is a native disclosure: all 88 drills stay in the document, one list is on screen.
      assert.match(body, new RegExp(`<details class="dash-group" id="group-${group.id}"`));
      assert.match(body, new RegExp(`aria-labelledby="group-${group.id}-heading"`));
      // The title names the row and nothing else: a control inside <summary> is the nested-interactive
      // failure axe rates serious, so the group's own page is linked from the open panel instead.
      assert.match(body, new RegExp(`<h2 id="group-${group.id}-heading">${group.title}</h2>`));
      assert.ok(
        body.includes(`<a class="dash-group-link" href="/learn/groups/${group.id}">About this group</a>`),
        `group ${group.id} has no way out to its own page`,
      );
      // Sixteen counters read "5 drills" until a drill in that group is finished.
      assert.match(body, new RegExp(`data-group-count="${group.id}">${group.entries.length} drills?<`));
      // The prose is written for the group's own page; the index is an index.
      assert.ok(!body.includes('class="dash-group-intro"'), "the track page repeats the group intro");
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
      // The hub says the skill and the tool: "Looking values up" ranks for nothing on its own, and the
      // title is what a reader sees in the result.
      assert.equal(page.title, `Excel exercises: ${group.title}`);
      assert.equal(page.noindex, undefined, "the hub is a landing page, not a private dashboard");
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
      assert.match(body, new RegExp(`<h1>Excel exercises: ${group.title}</h1>`));
      assert.match(body, new RegExp(`id="group-${group.id}" aria-label="${group.title}">`));
      assert.ok(!body.includes(`id="group-${group.id}-heading"`), "repeats the title as a heading");
      assert.ok(!body.includes(`href="/learn/groups/${group.id}"`), "links to itself");
      assert.match(body, new RegExp(`data-group-count="${group.id}">0 of ${group.entries.length}<`));

      // The intro is authored as paragraphs; an HTML <p> would flatten them into one. The first one is
      // the lede under the heading — that is what the hub's meta description is clamped from — and the
      // rest keep the `.dash-group-intro` paragraph shape.
      const authored = group.intro.split(/\n{2,}/).filter((line) => line.trim()).length;
      const ledes = body.match(/<p class="lede">/g) ?? [];
      const paragraphs = body.match(/<p class="dash-group-intro">/g) ?? [];
      assert.equal(ledes.length, 1, "the hub should open with one lede");
      assert.equal(ledes.length + paragraphs.length, authored);

      // The island's payload and the way back out, which is the hub that lists every group rather than
      // the personal dashboard: a reader who landed here from a search result is not on `/learn`.
      assert.match(body, /<script type="application\/json" id="dashboard-data">/);
      assert.match(body, /<script type="module" src="\/assets\/client\/dashboard\.js"><\/script>/);
      assert.match(body, /<a class="link-btn" href="\/excel-exercises">All Excel exercises<\/a>/);

      // Indexable, and structured: the trail up to the group, and the drills as a list. The JSON-LD
      // lands in the head, so it is asserted on the page rather than on the body.
      assert.match(body, /class="crumbs"/);
      assert.ok(page.jsonLd.includes('"@type":"ItemList"'), "the hub does not list its drills as structured data");
      assert.ok(page.jsonLd.includes('"@type":"BreadcrumbList"'), "the hub has no trail");
    });
  }

  it("ships no island when the client is unavailable", () => {
    const { body } = prepareDashboardPage({ ...args, clientAvailable: false, group: groups[0].id });
    assert.ok(!body.includes("/assets/client/dashboard.js"));
  });

  it("throws on a group that is not in the track, naming it", () => {
    assert.throws(() => prepareDashboardPage({ ...args, group: "nope" }), /no group "nope"/);
  });

  it("renders a document with the group's own title and no noindex", () => {
    const html = renderDashboardPage({ ...args, group: groups[0].id });
    assert.match(html, new RegExp(`<title>Excel exercises: ${groups[0].title}`));
    assert.ok(!html.includes('content="noindex"'), "the hub is noindex, so it cannot rank");
    assert.match(html, /<link rel="canonical" href="[^"]*\/learn\/groups\/[^"]+">/);
    assert.match(html, new RegExp(`<body class="light dashboard-page">`));
  });
});
