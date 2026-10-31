/**
 * The message catalogue's rules, as assertions.
 *
 * The catalogue only earns its keep if it is the whole truth: a key nothing asks for is dead copy, a
 * `t()` the catalogue has never heard of is a crash on a page nobody opened, and a value carrying
 * markup or a curly quote is the thing the copy gate exists to stop — arriving through the back door,
 * because the gate runs over lessons and not over chrome.
 *
 * The scan below is a text scan, not a module graph, which is exactly right here: it reads the call
 * sites as written, so a string that was moved into the catalogue but not replaced at the call site
 * still shows up as a hit.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { findBanned, findTypography, loadRules } from "../packages/content-lint/copy.js";
import { catalogue, messageKeys, t } from "../legacy/src/site/messages.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_DIRS = ["app", "legacy/src", "lib", "packages", "scripts"];
const SKIP = new Set(["messages.mjs"]);

/** Every `.js`/`.mjs` under the directories that render, walking rather than globbing for clarity. */
function sources(dir, found = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist" || name === ".next") continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      sources(path, found);
    } else if (extname(name) === ".js" || extname(name) === ".mjs") {
      if (!SKIP.has(name)) found.push(path);
    }
  }
  return found;
}

// `t("chrome.skip", { what })` and `{t("auth.login.title")}` both count; a template literal does not,
// and neither does a variable, which is the point — keys stay findable by reading.
const CALL = /\bt\(\s*"([^"]+)"/g;

const used = new Map();
for (const dir of SOURCE_DIRS) {
  for (const path of sources(join(ROOT, dir))) {
    const text = readFileSync(path, "utf8");
    for (const match of text.matchAll(CALL)) {
      const key = match[1];
      if (!used.has(key)) used.set(key, []);
      used.get(key).push(path.slice(ROOT.length + 1));
    }
  }
}

describe("the message catalogue", () => {
  it("names its entries by position, in dotted lowerCamelCase", () => {
    for (const key of Object.keys(catalogue)) {
      assert.match(key, /^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*)+$/, `"${key}" is not a dotted key`);
    }
  });

  it("holds plain text, because only the template knows where the text lands", () => {
    for (const [key, value] of Object.entries(catalogue)) {
      assert.equal(typeof value, "string", `${key} is not a string`);
      assert.ok(value.trim().length > 0, `${key} is empty`);
      assert.equal(value, value.trim(), `${key} has whitespace the caller would have to trim`);
      // An `&amp;` in the catalogue is escaped twice by `esc`; a `<b>` in the catalogue is markup in a
      // file that is supposed to hold words.
      assert.doesNotMatch(value, /[<>]|&[a-z]+;/, `${key} carries markup or an entity`);
    }
  });

  it("keeps its holes to {word} and nothing else", () => {
    for (const [key, value] of Object.entries(catalogue)) {
      assert.doesNotMatch(value.replace(/\{\w+\}/g, ""), /[{}]/, `${key} has a brace that is not a hole`);
    }
  });

  it("uses only holes it can fill, and asks for every value it needs", () => {
    const holes = (value) => [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]);
    for (const [key, value] of Object.entries(catalogue)) {
      const names = holes(value);
      assert.equal(new Set(names).size, names.length, `${key} repeats a hole`);
      if (names.length === 0) continue;
      // Every hole present is a hole that can be filled with a stand-in, which is also the check that
      // the message cannot print a literal `{name}` at a caller that forgot.
      const filled = t(key, Object.fromEntries(names.map((name) => [name, "x"])));
      assert.doesNotMatch(filled, /[{}]/, `${key} left a hole unfilled`);
      assert.throws(() => t(key, {}), new RegExp(`"${key}" needs`), `${key} accepted a missing value`);
    }
  });

  it("refuses a key it has never heard of, loudly", () => {
    // The alternative — returning the key, or an empty string — puts a string like `chrome.footer.te` on
    // a page and lets a typo ship. A throw is caught by the first test run that renders the template.
    assert.throws(() => t("chrome.footer.nope"), /no entry for "chrome\.footer\.nope"/);
  });

  it("is the only place the strings live: every key is asked for, and every ask is a key", () => {
    const missing = [...used.keys()].filter((key) => !Object.hasOwn(catalogue, key)).sort();
    assert.deepEqual(missing, [], "t() is asked for keys the catalogue does not define");
    const unused = messageKeys.filter((key) => !used.has(key));
    assert.deepEqual(unused, [], "the catalogue carries copy nothing asks for");
  });

  it("passes the copy gate the lessons pass", () => {
    const rules = loadRules();
    // One tolerated character: "Loading the form…" predates the catalogue and the ellipsis is the cue
    // that the section is still filling. Recorded here rather than by weakening the rule.
    const allowed = new Map([["chrome.loading.form", "ellipsis character"]]);
    for (const [key, value] of Object.entries(catalogue)) {
      const banned = findBanned(value, rules);
      assert.deepEqual(banned.map((hit) => hit.phrase), [], `${key} uses a banned phrase`);
      const slop = findTypography(value).filter((hit) => allowed.get(key) !== hit.name);
      assert.deepEqual(slop.map((hit) => hit.name), [], `${key} carries typography the copy gate bans`);
    }
  });
});

describe("the strings the tests read", () => {
  // A handful of specs and snapshots name the chrome by its words; if one of those strings moves, this
  // says which one moved instead of leaving a locator to time out in another file.
  it("still say what the footer and the ways-out block promised", () => {
    assert.equal(t("chrome.footer.privacy"), "Privacy");
    assert.equal(t("chrome.footer.terms"), "Terms");
    assert.equal(t("chrome.footer.feedback"), "Send feedback");
    assert.equal(t("chrome.ways.exercises"), "All Excel exercises");
    assert.equal(t("chrome.footer.claim", { name: "Excel Supreme" }), "Excel Supreme grades formulas in the browser. Nothing you type is sent anywhere.");
    assert.equal(t("chrome.skip", { what: "drill" }), "Skip to the drill");
  });
});
