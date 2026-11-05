/**
 * The about page carries the two things a stranger checks before trusting a small paid site:
 * who is behind it, and whether they are the intended reader. Both are claims, so both are tested:
 * the first may not appear unless the build was given a name, and the second may not be dressed up
 * with numbers nobody counted.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadContent } from "../legacy/src/site/content.mjs";
import { prepareAboutPage } from "../legacy/src/site/hub-page.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const { track, index } = loadContent(join(ROOT, "legacy/content"));

const BASE = { SITE_URL: "https://drills.example", SITE_BUILT_AT: "2026-10-28" };

function config(extra = {}) {
  return {
    name: "Excel Supreme",
    baseUrl: "https://drills.example",
    appUrl: null,
    pathPrefix: "/excel",
    author: null,
    contact: null,
    builtAt: "2026-10-28",
    inLanguage: "en",
    themeColor: { light: "#f9f9f8", dark: "#191918" },
    ...extra,
  };
}

function about(extra = {}) {
  return prepareAboutPage({ config: config(extra), track, index, icons: {} });
}

describe("the about page", () => {
  it("says who runs the site, but only for a build that was told a name", () => {
    // A placeholder name is worse than none: it reads as a company that does not exist. The section
    // is absent, not empty, so a build with no `SITE_AUTHOR` never prints a blank promise.
    const anonymous = about().body;
    assert.equal(anonymous.includes("Who runs it"), false, "about names an operator it was not given");

    const named = about({ author: "Dana Silva" }).body;
    assert.ok(named.includes("Who runs it"), "about does not say who runs the site");
    assert.ok(named.includes("Dana Silva"), "about does not name the operator");
    assert.ok(named.includes("one person"), "about does not admit the size of the operation");
  });

  it("puts the address beside the name, when there is one", () => {
    const body = about({ author: "Dana Silva", contact: "hello@drills.example" }).body;
    assert.ok(body.includes('href="mailto:hello@drills.example"'), "about names an operator with no way to reach them");
  });

  it("says who the exercises are for and who they are not for", () => {
    const body = about().body;
    assert.ok(body.includes("Who it"), "about does not describe the reader it was written for");
    for (const claim of [
      "who already opens a spreadsheet",
      "Not for",
      "macros",
      "Power Query",
      "Google Sheets",
    ]) {
      assert.ok(body.includes(claim), `about does not mention ${claim}`);
    }
  });

  it("does not count users, students or anything else nobody counted", () => {
    // The product has no analytics and no testimonials, so any number about its audience would be
    // invented. This is the test that keeps it honest.
    const body = about({ author: "Dana Silva", contact: "hello@drills.example" }).body;
    for (const invented of [
      /\b\d[\d,]*\+?\s+(?:users|students|learners|people|professionals|customers)\b/i,
      /\btrusted by\b/i,
      /\b(?:rated|rating)\b/i,
      /\bbest-?sell/i,
      /\bas seen (?:in|on)\b/i,
      /\btestimonials?\b/i,
    ]) {
      assert.equal(invented.test(body), false, `about carries an unverifiable claim: ${invented}`);
    }
  });

  it("keeps the trademark disclaimer one click from the price", () => {
    // The terms page disclaims Microsoft; a reader who lands on about and buys has to be able to see
    // the same sentence without hunting for the legal page.
    const body = about().body;
    assert.ok(body.includes("not affiliated with Microsoft"), "about does not disclaim affiliation");
  });
});
