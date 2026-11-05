/**
 * Every structured-data node the build ships, checked as a site rather than as a page.
 *
 * The reason this is site-wide: a lesson page references `#organization` and `#formula-drills` and
 * defines neither. Those two `@id`s live on the home page, which is exactly the point of `@id` — one
 * definition, many references — and a per-page check would fail on every lesson for doing it right.
 * So the test parses every `ld+json` in a fresh build, unions the definitions, and then asks whether
 * each reference resolves somewhere in that union.
 *
 * The negative half matters as much as the positive one. `HowTo`, `FAQPage`, `Quiz` and a rated
 * `Course` are the four shapes that turn a page into a rich result, and three of them would be a lie
 * about what the page is: there is no how-to, no answer key and no review count anywhere in this
 * site. `tests/markup.test.js` refuses them by name so that a future "SEO improvement" has to argue
 * with a test rather than with a reviewer's memory.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, describe, it } from "node:test";

import { build } from "../legacy/src/build.mjs";
import { PLANS, PRICE_CURRENCY } from "../legacy/src/site/offer.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ENV = { SITE_URL: "https://drills.example", SITE_BUILT_AT: "2026-10-28" };
const LD = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;

function htmlFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...htmlFiles(full));
    else if (entry.name.endsWith(".html")) out.push(full);
  }
  return out.sort();
}

/** The nodes in a page's JSON-LD: the graph items when there is a graph, the node otherwise. */
function nodesOf(html, file) {
  const nodes = [];
  for (const [, raw] of html.matchAll(LD)) {
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      assert.fail(`${file}: ld+json is not JSON`);
    }
    assert.equal(parsed["@context"], "https://schema.org", `${file}: @context is not schema.org`);
    const graph = Array.isArray(parsed["@graph"]) ? parsed["@graph"] : [parsed];
    for (const node of graph) {
      assert.ok(node["@type"], `${file}: a node has no @type`);
      nodes.push(node);
    }
  }
  return nodes;
}

/** Every `{ "@id": … }` inside a node, at any depth: those are the references. */
function referencesIn(value, into = []) {
  if (Array.isArray(value)) {
    for (const item of value) referencesIn(item, into);
    return into;
  }
  if (!value || typeof value !== "object") return into;
  const keys = Object.keys(value);
  if (keys.length === 1 && keys[0] === "@id") into.push(value["@id"]);
  else for (const item of Object.values(value)) referencesIn(item, into);
  return into;
}

describe("structured data", () => {
  let out;
  let pages;

  before(() => {
    out = mkdtempSync(join(tmpdir(), "es-markup-"));
    build({ out, env: ENV, quiet: true });
    pages = htmlFiles(out).map((file) => {
      const name = file.slice(out.length + 1);
      return { name, nodes: nodesOf(readFileSync(file, "utf8"), name) };
    });
  });

  after(() => {
    rmSync(out, { recursive: true, force: true });
  });

  it("ships JSON-LD on the pages that claim to describe something", () => {
    const withMarkup = pages.filter((page) => page.nodes.length > 0).map((page) => page.name);
    assert.ok(withMarkup.includes("index.html"), "the home page describes nothing");
    assert.ok(withMarkup.some((name) => name.startsWith("excel/")), "no lesson page describes its exercise");
    // The 404 document carries no markup on purpose: it describes a page that does not exist.
    assert.ok(withMarkup.length > 100, `only ${withMarkup.length} pages ship structured data`);
  });

  it("stays inside schema.org and gives every node a type", () => {
    // `@type` is asserted in `nodesOf`, per page, so a failure names the file. What is left is the
    // vocabulary: a type outside schema.org is ignored by every consumer, which looks like success.
    for (const page of pages) {
      for (const node of page.nodes) {
        const types = Array.isArray(node["@type"]) ? node["@type"] : [node["@type"]];
        for (const type of types) assert.match(type, /^[A-Za-z]+$/, `${page.name}: "${type}" is not a schema.org type`);
      }
    }
  });

  it("defines each @id once and resolves every reference to it", () => {
    const defined = new Map();
    for (const page of pages) {
      for (const node of page.nodes) {
        const id = node["@id"];
        if (!id) continue;
        const previous = defined.get(id);
        if (previous) {
          assert.deepEqual(node, previous.node, `${page.name}: ${id} is defined differently in ${previous.name}`);
          continue;
        }
        defined.set(id, { node, name: page.name });
      }
    }

    assert.ok(defined.has(`${ENV.SITE_URL}/#organization`), "nothing defines the organization");
    assert.ok(defined.has(`${ENV.SITE_URL}/#app`), "nothing defines the application");

    const dangling = [];
    for (const page of pages) {
      for (const node of page.nodes) {
        for (const id of referencesIn(node)) if (!defined.has(id)) dangling.push(`${page.name}: ${id}`);
      }
    }
    assert.deepEqual(dangling, [], "a reference points at an @id no page defines");
  });

  it("describes the app with the price the pricing page prints", () => {
    const home = pages.find((page) => page.name === "index.html");
    const app = home.nodes.find((node) => node["@type"] === "SoftwareApplication");
    assert.ok(app, "the home page does not describe the app");
    assert.equal(app.applicationCategory, "EducationalApplication");
    assert.equal(app.operatingSystem, "Web");
    assert.deepEqual(app.publisher, { "@id": `${ENV.SITE_URL}/#organization` });
    // One Offer per term: a single price here would pick one of the three on the reader's behalf.
    assert.equal(app.offers.length, PLANS.length, "the markup sells a different number of terms than the page");
    const pricing = readFileSync(join(out, "pricing/index.html"), "utf8");
    for (const [at, offer] of app.offers.entries()) {
      const plan = PLANS[at];
      assert.equal(offer["@type"], "Offer");
      assert.equal(offer.category, "subscription");
      assert.equal(offer.price, plan.amount, `${plan.id}: the markup and the store disagree on the amount`);
      assert.equal(offer.priceCurrency, PRICE_CURRENCY);
      // The markup and the page have to agree in the reader's units, not just in ours.
      assert.ok(pricing.includes(`$${plan.amount}`), `the pricing page does not print $${plan.amount}`);
      assert.ok(pricing.includes(plan.label), `the pricing page does not name the ${plan.label} term`);
    }
  });

  it("claims none of the three results this site cannot back up", () => {
    const banned = new Map([
      ["HowTo", "no page is a how-to; an exercise is a graded answer, not a set of steps"],
      ["FAQPage", "no page asks and answers a set of questions"],
      ["Quiz", "the deck is noindex and client-rendered, so no card text is in any HTML to mark up"],
    ]);

    for (const page of pages) {
      for (const node of page.nodes) {
        const types = Array.isArray(node["@type"]) ? node["@type"] : [node["@type"]];
        for (const type of types) {
          const reason = banned.get(type);
          if (reason) assert.fail(`${page.name}: ships ${type}, but ${reason}`);
        }
      }
    }
  });

  it("keeps the course a plain description rather than a rated or itemised one", () => {
    for (const page of pages) {
      for (const node of page.nodes) {
        const types = Array.isArray(node["@type"]) ? node["@type"] : [node["@type"]];
        if (!types.includes("Course")) continue;
        // A rating nobody left and a `hasPart` that re-lists the lessons both look authoritative and
        // are both untrue: the graph already links every exercise to the course by `@id`.
        assert.equal(node.aggregateRating, undefined, `${page.name}: a Course claims a rating`);
        assert.equal(node.hasPart, undefined, `${page.name}: a Course re-lists its own lessons`);
      }
    }
  });

  it("ships no ItemList of courses, because there is one course", () => {
    for (const page of pages) {
      for (const node of page.nodes) {
        const types = Array.isArray(node["@type"]) ? node["@type"] : [node["@type"]];
        if (!types.includes("ItemList")) continue;
        const items = JSON.stringify(node.itemListElement ?? null);
        assert.ok(!items.includes('"Course"'), `${page.name}: an ItemList of courses, and the site has one course`);
      }
    }
  });
});
