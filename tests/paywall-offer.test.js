/**
 * One question decides what the gate under a lesson offers: is checkout open?
 *
 * Before launch the only way past the gate was a button that unlocked the track for free in
 * this browser — correct while there was nothing to buy, wrong the moment Stripe accepts
 * money, because the free door stays next to the paid one and every reader finds it first.
 *
 * So the offer is a function of two facts, and this file is the whole matrix.
 */
import test from "node:test";
import assert from "node:assert/strict";

const { paywallOffer } = await import("../legacy/src/client/state.js");

const BUY = { kind: "buy" };
const UNLOCK = { kind: "unlock" };
const OPEN = { kind: "open" };

const cases = [
  // entitled, checkout, expected   — an entitled reader is never sold anything.
  [true, true, OPEN],
  [true, false, OPEN],
  // Checkout open: the paid door, and nothing else.
  [false, true, BUY],
  // Checkout closed: the pre-launch door, and nothing else.
  [false, false, UNLOCK],
];

for (const [entitled, checkout, expected] of cases) {
  test(`entitled=${entitled} checkout=${checkout} offers ${expected.kind}`, () => {
    const offer = paywallOffer({ entitled, checkout });
    assert.equal(offer.kind, expected.kind);
  });
}

test("no state offers the free unlock while checkout is open", () => {
  for (const entitled of [true, false]) {
    const offer = paywallOffer({ entitled, checkout: true });
    assert.notEqual(offer.kind, "unlock", `entitled=${entitled} still unlocked for free`);
  }
});

test("no state offers a buy button while checkout is closed", () => {
  for (const entitled of [true, false]) {
    const offer = paywallOffer({ entitled, checkout: false });
    assert.notEqual(offer.kind, "buy", `entitled=${entitled} still offered to buy`);
  }
});

test("the wall sells the shortest term, at the price the pricing page leads with", async () => {
  // `state.js` ships to the browser and cannot import `site/offer.mjs`, so the two values are pinned
  // against each other here rather than trusted to stay in step by hand.
  const { DEFAULT_PLAN, PRICE, planMenu } = await import("../legacy/src/site/offer.mjs");
  const { CHECKOUT_ACTION, TRACK_PRICE } = await import("../legacy/src/client/state.js");
  assert.equal(CHECKOUT_ACTION, `/api/stripe/checkout?plan=${DEFAULT_PLAN}`);
  assert.equal(TRACK_PRICE, PRICE.replace("/month", " a month"));

  const offer = paywallOffer({ entitled: false, checkout: true, price: TRACK_PRICE });
  assert.equal(offer.action, CHECKOUT_ACTION);
  assert.match(offer.label, /\$9\.99 a month/);
  assert.equal(offer.method, "post");
  // The wall cannot print three prices, but it must not pretend the other two do not exist.
  assert.match(offer.note, /pricing page/i, "the wall sells one term without naming where the others are");
  assert.ok(planMenu().includes("$9.99 a month"), "the term the wall sells is not the cheapest one on the page");
});

test("the buy offer still works without a known price — the route rejects an unknown plan", () => {
  const offer = paywallOffer({ entitled: false, checkout: true });
  assert.equal(offer.action, "/api/stripe/checkout?plan=monthly");
  assert.ok(offer.label.length > 0);
  assert.match(offer.note, /renews|cancel/i, "the wall names a price without saying what happens at the end of it");
});

test("the free unlock names what it unlocks and what it does not", () => {
  const offer = paywallOffer({ entitled: false, checkout: false });
  assert.match(offer.label, /unlock/i);
  // Pre-launch the flag is per browser, so the offer has to say so — it is not an account.
  assert.match(offer.note, /browser/i);
});

test("the open offer carries no button at all", () => {
  const offer = paywallOffer({ entitled: true, checkout: true });
  assert.equal(offer.action, undefined);
  assert.equal(offer.label, undefined);
});

/**
 * The offer is decided in the browser, so the fact that decides it has to travel there in the
 * lesson payload — the client cannot see the environment.
 */
test("the lesson payload carries the checkout fact, and defaults to closed", async () => {
  const { join } = await import("node:path");
  const { siteConfig } = await import("../legacy/src/site/config.mjs");
  const { loadContent } = await import("../legacy/src/site/content.mjs");
  const { renderExercisePage } = await import("../legacy/src/site/exercise-page.mjs");
  const root = join(import.meta.dirname, "..");
  const config = siteConfig({ SITE_URL: "https://drills.example", SITE_BUILT_AT: "2026-10-28" });
  const { track, index } = loadContent(join(root, "legacy/content"));
  const entry = index.find((item) => !item.free) ?? index[index.length - 1];

  const payloadOf = (html) => {
    const raw = html.match(/<script type="application\/json" id="exercise-data">([\s\S]*?)<\/script>/)[1];
    return JSON.parse(raw);
  };

  const closed = payloadOf(renderExercisePage({ config, track, index, entry, clientAvailable: true }));
  assert.equal(closed.paywall.checkout, false);

  const open = payloadOf(
    renderExercisePage({ config, track, index, entry, clientAvailable: true, checkout: { enabled: true } }),
  );
  assert.equal(open.paywall.checkout, true);
  // The wall quotes the entry term the same way the pricing page's heading does, and the page prints
  // all three terms in the plan cards behind it.
  assert.match(open.paywall.price, /\$9\.99\/month/, "the wall quotes a price the pricing page does not");
  assert.equal(open.paywall.action, "/api/stripe/checkout?plan=monthly");
});
