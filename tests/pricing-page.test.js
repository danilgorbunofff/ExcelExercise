/**
 * The page a reader lands on when they click the wall, and the only page that asks for money.
 *
 * Its history is three shapes. It began as two lists, three free exercises then eighty-five paid ones,
 * with the price in a heading above them: a catalogue rather than an offer. It became three cards side
 * by side, which asked a reader to compare three columns before they could decide anything, and paid
 * for the comparison with a how-note, a fact grid, a second copy of the free list and the whole
 * eighty-six-row catalogue underneath. It is now one card: a term switch, the price the card is
 * charged, one button, three inclusions, and the questions a buyer asks before typing a card number.
 *
 * The shape is worth pinning twice, at the renderer and through a real build, because the two
 * deployables share this module and a switch that only works in one of them is the drift this suite
 * exists to catch. It is pinned as markup rather than as pixels: the switch is three radios and a
 * sibling combinator, so the assertions that matter are that the radios precede the panel body, that
 * each panel carries its own plan, and that no second card, list or price block grew back.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, describe, it } from "node:test";

import { build } from "../legacy/src/build.mjs";
import { siteConfig } from "../legacy/src/site/config.mjs";
import { loadContent } from "../legacy/src/site/content.mjs";
import { GUARANTEE, PLANS, PRICE, REFUND_DAYS, savingPercent } from "../legacy/src/site/offer.mjs";
import { preparePricingPage } from "../legacy/src/site/pricing-page.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ADDRESS = "hello@drills.example";
const ENV = {
  SITE_URL: "https://drills.example",
  SITE_BUILT_AT: "2026-10-28",
  SITE_CONTACT: ADDRESS,
};
const { track, index } = loadContent(join(ROOT, "legacy/content"));
const config = siteConfig(ENV);
const amounts = PLANS.map((plan) => `$${plan.amount}`);
const freeCount = track.freeLessonCount;
const paidCount = index.length - freeCount;

const render = (extra = {}) => preparePricingPage({ config, track, index, ...extra }).body;

/** Titles are escaped in the markup; comparisons here are about which ones are present, not how. */
const decoded = (html) =>
  html
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

const titles = index.map((entry) => entry.exercise.title);
const paidTitles = index.filter((entry) => !entry.free).map((entry) => entry.exercise.title);

describe("one card, three terms", () => {
  it("asks the term as a question the page can answer without a script", () => {
    const body = render();
    // `<fieldset>`/`<legend>` is the grouping a radio set is supposed to have: it gives the switch an
    // accessible name without a heading, and it is the only grouping that survives the static build.
    assert.equal((body.match(/<fieldset class="term-switch">/g) ?? []).length, 1, "the offer is not one card");
    assert.match(body, /<legend class="term-legend">How long to pay for<\/legend>/, "the switch is unnamed");
    const radios = body.match(/<input class="term-radio" type="radio" name="term" id="term-[a-z]+"( checked)?>/g) ?? [];
    assert.deepEqual(
      radios.map((radio) => radio.match(/id="([^"]+)"/)[1]),
      PLANS.map((plan) => `term-${plan.id}`),
      "the switch does not offer exactly the plans on sale",
    );
    // The panels are revealed by `:checked ~ .term-body [data-plan]`, so the inputs have to come first.
    // A switch that stopped being a sibling chain would render as three stacked prices or as none.
    const firstRadio = body.indexOf('class="term-radio"');
    assert.ok(firstRadio > -1 && firstRadio < body.indexOf('class="term-body"'), "the inputs come after the panels");
  });

  it("opens on one term, and prints every term's price exactly once", () => {
    const body = render();
    assert.equal((body.match(/ checked>/g) ?? []).length, PLANS.length === 0 ? 0 : 1, "the switch has no default");
    const panels = body.match(/<div class="term-panel" id="panel-[a-z]+" data-plan="[a-z]+">/g) ?? [];
    assert.deepEqual(
      panels.map((panel) => panel.match(/data-plan="([a-z]+)"/)[1]),
      PLANS.map((plan) => plan.id),
      "a plan has no panel of its own",
    );
    for (const plan of PLANS) {
      assert.ok(body.includes(`<span class="term-amount">$${plan.amount}</span>`), `${plan.label} has no price`);
      assert.equal(
        body.split(`$${plan.amount}</span>`).length - 1,
        1,
        `$${plan.amount} is printed more than once, so a reader has two numbers to reconcile`,
      );
    }
    // The monthly equivalent is the line under the price for the two longer terms, and for the monthly
    // plan the same line says when it renews: a term price with no cadence beside it is a quote.
    for (const plan of PLANS.slice(1)) {
      assert.ok(body.includes(`$${plan.perMonth} a month`), `${plan.label} does not state its monthly price`);
      assert.ok(body.includes(`save ${savingPercent(plan)}%`), `${plan.label} does not state what it saves`);
    }
    assert.match(body, /Renews every month until you cancel/, "the monthly term does not say what it does at the end");
  });

  it("says what the money buys, in three lines, and never the catalogue", () => {
    const body = decoded(render());
    assert.equal((body.match(/class="term-includes"/g) ?? []).length, 1, "the inclusions belong to the card, not a panel");
    assert.ok(body.includes(`All ${paidCount} paid exercises`), "the card does not say what opens");
    assert.ok(body.includes("follows your account to any device"), "the card does not say what a second device costs");
    assert.ok(body.includes("Cancelling stops the next charge"), "the card does not say what cancelling does");
    // The one thing this page must never do again: print the track. An exercise title is the catalogue
    // leaking back in, whichever list it arrives through.
    for (const title of titles) {
      assert.ok(!body.includes(title), `"${title}" is listed on the offer`);
    }
    assert.ok(!/<details[^>]*class="track-list"/.test(body), "the folded catalogue is back");
    assert.ok(!body.includes('href="/excel/'), "the offer links into the exercises instead of selling them");
  });

  it("keeps the guarantee on the card floor, where it can be read before the button is pressed", () => {
    const body = render();
    assert.ok(
      body.includes(`<p class="term-guarantee">${GUARANTEE} inside ${REFUND_DAYS} days, cancel anytime.</p>`),
      "the guarantee is not stated once, in full, on the card",
    );
    assert.equal((body.match(/class="term-guarantee"/g) ?? []).length, 1, "the guarantee is repeated");
  });

  it("leads with the free half, because that is what a reader who is not ready can have", () => {
    assert.ok(render().includes(`<h1>${freeCount} exercises free. The rest from ${PRICE}</h1>`));
    const body = render({ startHref: "/start" });
    assert.ok(body.includes('href="/start"'), "the free lessons are not one click away");
    assert.ok(body.includes('href="/excel-exercises"'), "a reader who wants to see the rest cannot");
  });
});

describe("the questions a buyer asks first", () => {
  const body = render();
  // The question is a heading inside the fold's summary, not summary text: the fold is a disclosure and
  // the question is still a heading in the page outline. Hence the `<h3>` in the pattern.
  const questions = body.match(/<details class="faq"[\s\S]*?<summary><h3>([^<]+)<\/h3><\/summary>/g) ?? [];

  it("answers a short list of them, each phrased as a question", () => {
    assert.ok(questions.length >= 6, `only ${questions.length} questions are answered`);
    assert.ok(questions.length <= 8, `${questions.length} questions is the page growing an FAQ section again`);
    for (const question of questions) {
      assert.match(question, /<summary><h3>[^<]*\?<\/h3><\/summary>/, "an entry is not phrased as a question");
    }
  });

  it("covers the six things a reader wonders before typing a card number", () => {
    // The answers themselves live in `pricing-page.mjs`; what is checked here is that none of the
    // facets was quietly dropped while the wording changed.
    for (const facet of [/excel/i, /google sheets/i, /offline/i, /refund/i, /device/i, /renew/i]) {
      assert.ok(facet.test(body), `the page never addresses ${facet}`);
    }
  });

  it("routes a question to a person, and a returning reader to the door they need", () => {
    assert.ok(body.includes(`href="mailto:${ADDRESS}"`), "there is no way to ask a human");
    const signedIn = render({ signinHref: "/login?next=/pricing" });
    assert.ok(signedIn.includes('href="/login?next=/pricing"'), "a returning reader has no way in");
    assert.match(signedIn, /Already have an account\?/, "the sign-in offer has no words");
    const noAccount = render({ signinHref: null });
    assert.ok(!noAccount.includes('href="/login'), "the page offers a sign-in it cannot serve");
    assert.ok(!/href="(null|undefined)"/.test(noAccount), "the page shipped a broken href");
  });
});

describe("the call to action", () => {
  it("takes the money on the term the reader picked, not on a term the page chose", () => {
    const body = render({ checkout: { enabled: true } });
    for (const plan of PLANS) {
      const panel = body.slice(body.indexOf(`data-plan="${plan.id}"`));
      assert.ok(
        panel.includes(`<form class="term-buy" method="post" action="/api/stripe/checkout?plan=${plan.id}"`),
        `the ${plan.label} panel does not post to its own term`,
      );
      assert.ok(
        panel.includes(`>Pay $${plan.amount} ${plan.cadence}</button>`),
        `the ${plan.label} button does not name what the card is charged`,
      );
    }
    assert.ok(body.includes('href="/account"'), "a buyer who already paid has no way back to the exercises");
  });

  it("keeps the pre-launch promise when it cannot charge", () => {
    const body = render({ checkout: { enabled: false } });
    assert.ok(!body.includes('method="post"'), "a closed checkout still offers a payment form");
    assert.match(body, /Checkout is not open on this copy/);
    // A host with an account door still opens it: the account is free, and it is where the paid half
    // appears once checkout does. A host without one falls back to the only thing it can serve.
    assert.ok(body.includes("Create an account"), "a closed checkout leaves the card with no action at all");
    const noDoor = render({ checkout: { enabled: false }, signupHref: null });
    assert.ok(
      noDoor.includes(`Start with the free ${freeCount}`),
      "with no account door the free exercises have to be the action",
    );
    assert.ok(!/href="(null|undefined|\/signup)/.test(noDoor), "the card points somewhere it cannot serve");
  });
});

describe("the built page", () => {
  let dist;
  before(() => {
    dist = mkdtempSync(join(tmpdir(), "pricing-"));
    build({ root: join(ROOT, "legacy"), out: dist, env: ENV, quiet: true });
  });
  after(() => rmSync(dist, { recursive: true, force: true }));

  it("ships the same card the renderer does", () => {
    const html = readFileSync(join(dist, "pricing/index.html"), "utf8");
    for (const amount of amounts) {
      assert.ok(html.includes(`<span class="term-amount">${amount}</span>`), `the built page lost ${amount}`);
    }
    assert.equal((html.match(/class="term-switch"/g) ?? []).length, 1, "the built page is not one card");
    assert.equal((html.match(/class="term-radio"/g) ?? []).length, PLANS.length, "the built switch lost a term");
    assert.ok(!/<details[^>]*class="track-list"/.test(html), "the built page lists the track unfolded");
    assert.ok(html.includes(`href="mailto:${ADDRESS}"`), "the built page has no contact route");
    assert.ok(/100% refund guarantee/i.test(html), "the built page lost the guarantee");
    assert.equal((html.match(/<details class="faq"/g) ?? []).length, 6, "the built page lost its FAQ");
  });

  it("stays out of the index, and says so", () => {
    const html = readFileSync(join(dist, "pricing/index.html"), "utf8");
    assert.match(html, /<meta name="robots" content="noindex">/, "the offer is competing with the track index");
  });
});
