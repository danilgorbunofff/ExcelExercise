/**
 * The shortcut silo: six families of keys, one page each, and a hub that lists them.
 *
 * The content rules are asserted through the same function the gate uses (`shortcutProblems`), so this
 * file cannot drift from `npm run content:shortcuts`. What a rule cannot see is asserted separately:
 * that the page a reader gets carries a keycap table for every action, that the tabs are links whose
 * addresses differ per platform, and that the practice button reaches the exercise on whichever build is
 * rendering it.
 */
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { FAMILIES, loadShortcuts, shortcutProblems } from "../packages/content/shortcuts.js";
import { servedPaths } from "../packages/content-lint/articles.js";
import { buildSearchIndex, search } from "../packages/search/index.js";
import { siteConfig } from "../legacy/src/site/config.mjs";
import { loadContent } from "../legacy/src/site/content.mjs";
import { esc } from "../legacy/src/site/html.mjs";
import { prepareShortcutPage, prepareShortcutsHub, SHORTCUTS_BASE } from "../legacy/src/site/shortcut-page.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONTENT = join(ROOT, "legacy", "content");
const config = siteConfig({ SITE_URL: "https://drills.example", SITE_BUILT_AT: "2026-11-02" });
const { track, index } = loadContent(CONTENT);
const shortcuts = loadShortcuts(join(CONTENT, "shortcuts"));

const page = (shortcut, extra = {}) =>
  prepareShortcutPage({ config, track, index, shortcuts, shortcut, clientAvailable: true, ...extra });

/** The count of a shape in a string, so "one per action" is a number rather than an eye. */
const count = (text, pattern) => (text.match(pattern) ?? []).length;

describe("the shortcut pages that ship", () => {
  it("parses every file in the folder, one per family", () => {
    const files = readdirSync(join(CONTENT, "shortcuts")).filter((name) => name.endsWith(".md"));
    assert.ok(files.length > 0, "the shortcuts folder is empty");
    assert.equal(shortcuts.length, files.length);
    assert.equal(shortcuts.length, FAMILIES.length, "every family in the hub list has a page");
    assert.deepEqual(
      shortcuts.map((shortcut) => shortcut.slug).sort(),
      FAMILIES.map((family) => family.id).sort(),
    );
  });

  it("passes the gate the content script runs", () => {
    const problems = shortcutProblems({
      shortcuts,
      lessons: index.map((entry) => entry.exercise),
      paths: servedPaths(
        index.map((entry) => entry.exercise),
        [],
        [],
        shortcuts,
      ),
    });
    assert.deepEqual(problems, []);
  });

  it("gives each family a table, prose, and the date it was checked", () => {
    for (const shortcut of shortcuts) {
      assert.ok(shortcut.rows.length >= 8, `${shortcut.slug}: ${shortcut.rows.length} rows is a stub, not a page`);
      assert.deepEqual(shortcut.platforms.slice(0, 2), ["windows", "macos"]);
      assert.match(shortcut.updated, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(shortcut.whenToUseIt.length > 40, `${shortcut.slug}: no explanation of when to use these keys`);
      assert.ok(shortcut.checkedAgainst.length > 0, `${shortcut.slug}: does not say what it was checked against`);
    }
  });
});

describe("one family's page", () => {
  const shortcut = shortcuts.find((candidate) => candidate.slug === "navigation");
  const { body, page: meta } = page(shortcut);

  it("opens with one heading and the summary a reader clicked", () => {
    assert.equal(count(body, /<h1>/g), 1);
    assert.ok(body.includes(`<h1>${esc(shortcut.title)}</h1>`));
    assert.ok(body.includes(`<p class="lede">${esc(shortcut.summary)}</p>`));
    assert.equal(meta.title, shortcut.title);
    assert.equal(meta.description, shortcut.description);
  });

  it("canonicalises to the bare address, because Windows is the default tab", () => {
    assert.equal(meta.path, `${SHORTCUTS_BASE}/navigation`);
    assert.ok(!meta.path.includes("?platform="), "the default tab must not need a query string");
  });

  it("offers a tab per platform, as links, with the current one marked", () => {
    assert.equal(count(body, /class="platform-tab"/g), shortcut.platforms.length);
    assert.ok(body.includes('href="/shortcuts/navigation" aria-current="page">Windows</a>'));
    for (const platform of shortcut.platforms.filter((candidate) => candidate !== "windows")) {
      assert.ok(
        body.includes(`href="/shortcuts/navigation?platform=${platform}"`),
        `${platform} tab does not carry its own address`,
      );
    }
  });

  it("renders a keycap for every key in both columns, and names the cells that have no default", () => {
    // Every platform's column ships in the HTML: the page has to work with no JavaScript and print as
    // one sheet, so the client hides a column rather than the renderer dropping it.
    for (const platform of shortcut.platforms) {
      assert.ok(body.includes(`data-platform="${platform}"`), `${platform} has no column`);
    }
    assert.equal(count(body, /<th scope="row">/g), shortcut.rows.length);
    for (const row of shortcut.rows) {
      assert.ok(body.includes(`<th scope="row">${esc(row.action)}</th>`), `"${row.action}" is not a row`);
      for (const platform of shortcut.platforms) {
        const cell = row.cells[platform];
        if (cell.none) {
          assert.ok(body.includes(`<span class="keys-none">${esc(cell.keys)}</span>`), `${row.action}: ${platform}`);
        } else {
          assert.ok(
            body.includes(`<span class="keycap">${esc(cell.keys.split(" + ")[0])}</span>`),
            `${row.action}: ${platform} has no keycap`,
          );
        }
      }
    }
  });

  it("keeps the touch banner off screen until the script decides the pointer is coarse", () => {
    assert.ok(body.includes('class="touch-banner"'));
    assert.ok(body.includes('id="shortcuts-banner" hidden'), "the banner is announced before it is usable");
    assert.ok(body.includes('id="shortcuts-banner-dismiss"'), "the banner cannot be dismissed");
  });

  it("loads its script only when there is one to load", () => {
    assert.ok(body.includes('<script type="module" src="/assets/client/shortcuts.js"></script>'));
    assert.ok(!page(shortcut, { clientAvailable: false }).body.includes("client/shortcuts.js"));
  });

  it("ships the article and the trail a crawler reads", () => {
    const graph = JSON.parse(meta.jsonLd)["@graph"];
    const kinds = graph.map((item) => item["@type"]);
    assert.ok(kinds.includes("Article"), "no Article in the structured data");
    assert.ok(kinds.includes("BreadcrumbList"), "no BreadcrumbList in the structured data");
    const article = graph.find((item) => item["@type"] === "Article");
    assert.equal(article.dateModified, shortcut.updated);
  });
});

describe("the practice button", () => {
  const shortcut = shortcuts.find((candidate) => candidate.slug === "navigation");

  it("reaches the exercise the file names, on the static edition's address", () => {
    const exercise = index.find((entry) => entry.slug === shortcut.practice);
    const { body } = page(shortcut);
    assert.ok(exercise, "the exercise the page practises is not published");
    assert.ok(body.includes(`class="btn btn-primary" href="${exercise.path}"`), "the practice button is missing");
    assert.ok(body.includes(`Practise it: ${esc(exercise.exercise.title)}`), "the button does not name the exercise");
  });

  it("follows the app's lesson paths when it renders under Next", () => {
    // One probe: the app serves exercises under `/learn/excel/`, and neither the button nor the prose link
    // may keep the static edition's `/excel/` address and lean on the redirect.
    const { body } = page(shortcut, {
      index: index.map((entry) => ({ ...entry, path: `/learn/excel/${entry.slug}` })),
      lessonBase: "/learn/excel",
    });
    assert.ok(body.includes(`href="/learn/excel/${shortcut.practice}"`));
    assert.ok(!body.includes('href="/excel/'), "a lesson link still points at the redirecting address");
  });
});

describe("the hub", () => {
  const { body, page: meta } = prepareShortcutsHub({ config, track, index, shortcuts, clientAvailable: true });

  it("lists every action of every family, linked to its page", () => {
    for (const shortcut of shortcuts) {
      assert.ok(body.includes(`id="family-${shortcut.slug}"`), `${shortcut.slug} has no shelf`);
      assert.ok(body.includes(`<a href="${SHORTCUTS_BASE}/${shortcut.slug}">`), `${shortcut.slug} is not linked`);
      for (const row of shortcut.rows) {
        assert.ok(body.includes(`>${esc(row.action)}</a>`), `${shortcut.slug}: "${row.action}" is not listed`);
      }
    }
    assert.equal(count(body, /class="shortcut-row"/g), shortcuts.reduce((total, s) => total + s.rows.length, 0));
  });

  it("renders its filter box hidden, so a reader without the script never sees a box that does nothing", () => {
    assert.ok(body.includes('id="shortcut-filter" hidden'));
    assert.ok(body.includes('id="shortcut-search"'));
    assert.ok(body.includes('id="shortcut-filter-status" role="status"'), "the filter reports nothing to a screen reader");
  });

  it("is indexable and lists its families in order", () => {
    assert.equal(meta.path, SHORTCUTS_BASE);
    const graph = JSON.parse(meta.jsonLd)["@graph"];
    const list = graph.find((item) => item["@type"] === "ItemList");
    assert.equal(list.numberOfItems, shortcuts.length);
    assert.deepEqual(
      list.itemListElement.map((item) => item.url),
      shortcuts.map((shortcut) => `${config.baseUrl}${SHORTCUTS_BASE}/${shortcut.slug}`),
    );
  });

  it("carries the script that makes the filter work", () => {
    assert.ok(body.includes('<script type="module" src="/assets/client/shortcuts.js"></script>'));
  });
});

describe("finding a shortcut", () => {
  const built = buildSearchIndex({ track, index, articles: [], formulas: [], shortcuts });

  it("indexes each family once, with the actions it answers", () => {
    const entries = built.filter((entry) => entry.kind === "shortcut");
    assert.equal(entries.length, shortcuts.length);
    for (const shortcut of shortcuts) {
      const entry = entries.find((candidate) => candidate.slug === shortcut.slug);
      assert.ok(entry, `${shortcut.slug} is not searchable`);
      assert.equal(entry.path, `${SHORTCUTS_BASE}/${shortcut.slug}`);
      assert.ok(entry.title.includes(shortcut.title));
    }
  });

  it("finds the family when a reader types an action from its table", () => {
    const action = shortcuts[0].rows[0].action;
    const word = action.split(" ").find((part) => part.length > 6) ?? action;
    const results = built.filter((entry) => entry.kind === "shortcut");
    assert.ok(
      results.some((entry) => entry.text.toLowerCase().includes(word.toLowerCase())),
      `"${word}" finds no family`,
    );
    // The search surface itself agrees, which is the part a reader actually touches.
    assert.ok(search(word, built).length > 0, `searching "${word}" returns nothing`);
  });
});
