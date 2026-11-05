/**
 * One offer, stated the same way on every page.
 *
 * The failure this catches is not a typo: `/pricing` was rebuilt into a real offer, and the three pages
 * that also mention money — `/about`, `/excel-exercises` and `/terms` — kept their older sentences.
 * Two of them called the track "a one-off payment" and "nothing recurring" while the checkout the wall
 * posts to is `?plan=annual`, which `lib/stripe.js` sells as `{ mode: "subscription", recurring: true }`.
 * A page that says "one payment" next to a yearly subscription is a promise the product does not keep,
 * and the reader who notices it is the one who was about to pay.
 *
 * So the offer is a value in `site/offer.mjs` and the sentences are built from it. These tests hold the
 * line: the cadence in the copy has to match the cadence in the code that charges, and every page that
 * names a price has to name the same one.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { PLANS } from "../lib/stripe.js";
import { siteConfig } from "../legacy/src/site/config.mjs";
import { loadContent } from "../legacy/src/site/content.mjs";
import { prepareAboutPage, prepareExercisesHub } from "../legacy/src/site/hub-page.mjs";
import { prepareLegalPage } from "../legacy/src/site/legal-page.mjs";
import { GUARANTEE, PRICE, offerLine, planMenu, renewalLine } from "../legacy/src/site/offer.mjs";
import { preparePricingPage } from "../legacy/src/site/pricing-page.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ENV = { SITE_URL: "https://drills.example", SITE_BUILT_AT: "2026-10-28", SITE_CONTACT: "hello@drills.example" };
const config = siteConfig(ENV);
const { track, index } = loadContent(join(ROOT, "legacy/content"));
const free = track.freeLessonCount;
const total = index.length;

/** The markup escaped for arithmetic; the copy is compared as text, not as entities. */
const decoded = (html) =>
  html
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

/** Every page that mentions money, as the reader receives it. */
function pages() {
  return {
    "/pricing": decoded(preparePricingPage({ config, track, index, checkout: { enabled: true } }).body),
    "/about": decoded(prepareAboutPage({ config, track, index }).body),
    "/excel-exercises": decoded(prepareExercisesHub({ config, track, index, groups: [] }).body),
    "/privacy": decoded(prepareLegalPage({ config, track, index, kind: "privacy" }).body),
    "/terms": decoded(prepareLegalPage({ config, track, index, kind: "terms" }).body),
  };
}

describe("the cadence in the copy is the cadence in the code that charges", () => {
  it("sells the plan the pages describe: annual, recurring, cancelled by the buyer", () => {
    const plan = PLANS.annual;
    assert.equal(plan.mode, "subscription", "the plan the wall links to is no longer a subscription");
    assert.equal(plan.recurring, true, "the plan the wall links to stopped renewing");
    assert.equal(plan.interval, "year", "the plan the wall links to is no longer annual");
  });

  it("never promises a one-off payment for a subscription", () => {
    // The phrases that were on the pages before the offer was written down once. Each of them is a
    // promise about the future that Stripe will break a year after the first charge.
    const promises = [/one-off payment/i, /nothing recurring/i, /one payment\b/i, /not one per exercise/i];
    for (const [path, body] of Object.entries(pages())) {
      for (const promise of promises) {
        assert.doesNotMatch(body, promise, `${path} promises ${promise} but the plan renews`);
      }
    }
  });

  it("says the term renews, on every page that names a price", () => {
    // The three term prices as the pages print them, from the same array that draws the cards.
    const named = Object.entries(pages()).filter(([, body]) => body.includes(planMenu()));
    // Two pages carry the price menu today; the check is per page, so a third one cannot appear without
    // the sentence that says what happens at the end of the term.
    assert.ok(named.length >= 2, `only ${named.length} page names a price`);
    for (const [path, body] of named) {
      assert.match(body, /renews|cancel/i, `${path} names a price without saying whether it renews`);
    }
  });
});

describe("the offer line", () => {
  it("is built from the content, not from numbers typed into a page", () => {
    const line = offerLine({ free, total });
    assert.ok(line.includes(`${free} exercises are free forever`), "the offer line does not name the free exercises from track.json");
    assert.ok(line.includes(`The other ${total - free}`), "the offer line does not count the paid exercises");
    assert.ok(line.includes(planMenu()), "the offer line does not carry the three prices");
    assert.ok(line.includes(GUARANTEE.toLowerCase()), "the offer line does not carry the guarantee");
  });

  it("appears verbatim on the pages that state the offer", () => {
    const line = offerLine({ free, total });
    const rendered = pages();
    for (const path of ["/about", "/excel-exercises", "/terms"]) {
      assert.ok(rendered[path].includes(line), `${path} does not carry the offer line`);
    }
    // `/pricing` is the exception: it prints the three prices as a switch, and its description is a
    // shorter sentence for a search result, because the full offer line is 243 characters and a
    // description has roughly 155 to work with. What it may not do is disagree with the offer, so it
    // has to carry the three facts a buyer needs before clicking: how many are free, how many are
    // paid, and the price the paid half starts at.
    const pricing = preparePricingPage({ config, track, index, checkout: { enabled: true } });
    const description = pricing.page.description;
    assert.ok(description.length >= 70 && description.length <= 155, `the description is ${description.length} characters`);
    assert.ok(description.includes(String(free)), "the description does not say how many exercises are free");
    assert.ok(description.includes(String(total - free)), "the description does not say how many are paid");
    // `PRICE` is written "$9.99/month" and a description is prose, so the amount is the shared fact.
    const amount = PRICE.match(/\d+\.\d+/)[0];
    assert.ok(description.includes(amount), "the description does not quote the price the offer starts at");
  });

  it("is the only sentence about renewal, so the answer cannot differ between pages", () => {
    const renewal = renewalLine();
    const rendered = pages();
    assert.ok(rendered["/pricing"].includes(renewal), "the pricing page does not answer whether it renews");
    assert.ok(rendered["/about"].includes(renewal), "the about page states a price without the renewal terms");
  });
});

describe("the pricing page heading", () => {
  const page = preparePricingPage({ config, track, index, checkout: { enabled: true } });

  it("names the cadence rather than implying a single payment", () => {
    const heading = page.body.match(/<h1>([^<]+)<\/h1>/);
    assert.ok(heading, "the pricing page has no heading");
    assert.match(heading[1], /\/month/, "the heading does not say how often the card is charged");
    assert.ok(heading[1].includes(PRICE), "the heading quotes a price the offer does not");
    // The title and the heading may punctuate the same offer differently; they may not disagree on it.
    const figures = (text) => text.match(/\d+(?:\.\d+)?|free/gi).map((word) => word.toLowerCase()).sort();
    assert.deepEqual(figures(heading[1]), figures(page.page.title), "the heading and the document title say different things");
  });

  it("counts the free and paid exercises from the content", () => {
    assert.ok(page.body.includes(`${free} exercises free`), "the page does not say how many exercises are free");
    assert.ok(
      page.body.includes(`All ${total - free} paid exercises`),
      "the page does not name how many exercises the money buys",
    );
  });
});

describe("the wall's own sentence", () => {
  it("does not sell a plan the pricing page never offers", () => {
    const source = readFileSync(join(ROOT, "legacy/src/client/state.js"), "utf8");
    for (const word of ["lifetime", "one-off", "three months", "quarterly"]) {
      assert.ok(!new RegExp(word, "i").test(source), `the gate advertises ${word}, which no page sells`);
    }
    // Whatever plan the gate does sell has to be one of the three, and it has to name its length.
    const plan = source.match(/\/api\/stripe\/checkout\?plan=([a-z]+)/)?.[1];
    assert.ok(plan && Object.hasOwn(PLANS, plan), `the gate sells "${plan}", which is not a plan`);
    assert.match(source, /renews|cancel/i, "the gate names a price without saying it renews");
  });
});
