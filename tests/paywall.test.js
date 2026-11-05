/**
 * The server half of the paywall: the decision, the flag that turns it on, and the wiring in
 * `proxy.js` that makes a direct URL land on the offer instead of the exercise.
 *
 * The decision is a pure function of the catalog flags and the database's answer, so the matrix is
 * tested here rather than through a running server. `proxy.js` cannot be imported by `node --test`
 * (it imports `next/server`), so the wiring is pinned with source probes — the repo already does that
 * for client modules whose only failure mode is being quietly unwired.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { readIcons } from "../legacy/src/site/assets.mjs";
import { esc } from "../legacy/src/site/html.mjs";
import { siteConfig } from "../legacy/src/site/config.mjs";
import { loadContent } from "../legacy/src/site/content.mjs";
import { PLANS } from "../legacy/src/site/offer.mjs";
import { preparePricingPage } from "../legacy/src/site/pricing-page.mjs";
import { entitledFor, PAYWALL_PATH, paywallDecision, paywallEnforced } from "../lib/paywall.js";

const ROOT = join(import.meta.dirname, "..");
const ENV = { SITE_URL: "https://drills.example", SITE_BUILT_AT: "2026-10-28" };
const ACCOUNTS = {
  NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
};

const config = siteConfig(ENV);
const { track, index } = loadContent(join(ROOT, "legacy/content"));
const icons = readIcons(join(ROOT, "legacy/vendor/icons"));

/** The catalog entry the lesson URL resolves to, in the shape `proxy.js` gets from `loadSite()`. */
const freeEntries = index.filter((candidate) => candidate.free);
const paidEntries = index.filter((candidate) => !candidate.free);
const promptEntry = index.find((candidate) => candidate.number === track.promptAt);
const freeLessonCount = track.freeLessonCount;

describe("paywallDecision", () => {
  it("serves the free exercises", () => {
    assert.equal(freeEntries.length, freeLessonCount, "track.json and the catalog disagree on the free set");
    for (const candidate of freeEntries) {
      assert.equal(paywallDecision({ entry: candidate, promptAt: track.promptAt }), null, candidate.path);
    }
  });

  it("serves the prompt exercise, because its 'continue free this once' button is client-side", () => {
    assert.ok(promptEntry, "track.json nominates no paid exercise to prompt at");
    assert.equal(promptEntry.free, false, "the prompt exercise is free, so nothing is being prompted");
    assert.equal(paywallDecision({ entry: promptEntry, promptAt: track.promptAt }), null, "the soft prompt was walled");
  });

  it("sends every other paid exercise to the offer", () => {
    const walled = paidEntries.filter((candidate) => candidate.number !== track.promptAt);
    assert.equal(walled.length, paidEntries.length - 1, "exactly one paid exercise is the prompt");
    for (const candidate of walled) {
      assert.equal(paywallDecision({ entry: candidate, promptAt: track.promptAt }), PAYWALL_PATH, candidate.path);
    }
  });

  it("reads the boundary from the track, not from a constant in the code", () => {
    // The plan's "config, not code": the same exercise is served or walled depending on `track.json`,
    // which is the point — moving the boundary must not need a code change. The boundary is two facts
    // now: the exercise's own `free` flag, and the one paid exercise nominated as the prompt.
    const fifth = { free: false, number: 5, path: "/excel/fifth" };
    assert.equal(paywallDecision({ entry: fifth, promptAt: 4 }), PAYWALL_PATH);
    assert.equal(paywallDecision({ entry: fifth, promptAt: 5 }), null, "the prompt exercise follows the config");
    assert.equal(paywallDecision({ entry: { ...fifth, free: true }, promptAt: 4 }), null, "a free flag is served wherever it sits");
    assert.equal(paywallDecision({ entry: fifth, promptAt: null }), PAYWALL_PATH, "no prompt means no soft door");
  });

  it("serves anything to an entitled reader", () => {
    const last = index[index.length - 1];
    assert.equal(paywallDecision({ entry: last, promptAt: track.promptAt, entitled: true }), null);
  });

  it("serves everything when enforcement is off, which is the shipped default", () => {
    for (const candidate of index) {
      assert.equal(paywallDecision({ entry: candidate, promptAt: track.promptAt, enforced: false }), null, candidate.path);
    }
  });

  it("has no opinion about a slug that is not in the catalog", () => {
    // `null` here means the lesson route's `notFound()` decides, which is the right 404 for a stranger.
    assert.equal(paywallDecision({ entry: null, promptAt: track.promptAt }), null);
  });
});

describe("paywallEnforced", () => {
  it("is off unless it is asked for", () => {
    assert.equal(paywallEnforced({}), false);
    assert.equal(paywallEnforced({ PAYWALL: "" }), false);
    assert.equal(paywallEnforced({ ...ACCOUNTS }), false);
    assert.equal(paywallEnforced({ ...ACCOUNTS, PAYWALL: "off" }), false);
  });

  it("stays off without accounts, because nobody could buy and /pricing would be a dead end", () => {
    assert.equal(paywallEnforced({ PAYWALL: "on" }), false);
  });

  it("turns on for the flag when accounts are configured", () => {
    for (const flag of ["on", "ON", " 1 ", "true"]) {
      assert.equal(paywallEnforced({ ...ACCOUNTS, PAYWALL: flag }), true, flag);
    }
  });
});

describe("entitledFor", () => {
  const user = { id: "9f6e1f0a-0000-4000-8000-000000000001" };

  it("asks the database, and only the database", async () => {
    const calls = [];
    const supabase = {
      rpc: async (name, args) => {
        calls.push({ name, args });
        return { data: true, error: null };
      },
    };
    assert.equal(await entitledFor(supabase, user), true);
    assert.deepEqual(calls, [{ name: "is_entitled", args: { uid: user.id } }]);
  });

  it("treats a failed question as 'no', not 'yes'", async () => {
    const failed = { rpc: async () => ({ data: null, error: { message: "boom" } }) };
    assert.equal(await entitledFor(failed, user), false);
    assert.equal(await entitledFor({ rpc: async () => ({ data: "yes" }) }, user), false);
  });

  it("is false without a client or a user, so a deployment without accounts cannot be entitled", async () => {
    assert.equal(await entitledFor(null, user), false);
    assert.equal(await entitledFor({ rpc: async () => ({ data: true }) }, null), false);
  });
});

describe("proxy wiring", () => {
  const code = readFileSync(join(ROOT, "proxy.js"), "utf8");

  it("asks the shared rule for a lesson URL", () => {
    assert.match(code, /import \{ entitledFor, paywallDecision, paywallEnforced \} from "\.\/lib\/paywall\.js"/);
    assert.match(code, /const LESSON = \/\^\\\/learn\\\/excel/);
    assert.match(code, /return paywallDecision\(\{/);
    assert.match(code, /promptAt: track\.promptAt/);
  });

  it("asks it after the session, so a signed-in reader's entitlement is what decides", () => {
    const session = code.indexOf("await supabase.auth.getUser()");
    const paywall = code.indexOf("const paywall = await paywallFor(");
    assert.ok(session > -1 && paywall > session, "the paywall must run after getUser(), or entitlement is always false");
    assert.match(code, /if \(paywall\) return NextResponse\.redirect\(new URL\(paywall, request\.url\)\)/);
  });

  it("returns early before any of it when accounts are unconfigured", () => {
    // Still an early return, now inside the branch that also counts the render the funnel is built on.
    const early = code.indexOf("if (!config.enabled) {");
    assert.ok(early > -1 && early < code.indexOf("const paywall = await paywallFor("));
  });
});

describe("the offer page", () => {
  const { body, page } = preparePricingPage({ config, track, index, icons });
  const paid = index.filter((candidate) => !candidate.free);
  const free = index.filter((candidate) => candidate.free);

  it("is out of the index: noindex, and the sitemap check keeps it out", () => {
    assert.equal(page.noindex, true);
    assert.equal(page.path, "/pricing");
  });

  it("quotes the three prices the checkout charges, and the guarantee", () => {
    for (const plan of PLANS) {
      assert.ok(body.includes(`$${plan.amount}`), `the offer does not name the ${plan.label} price`);
    }
    for (const phrase of ["100% refund guarantee", "cancel anytime"]) {
      assert.ok(body.toLowerCase().includes(phrase.toLowerCase()), `the offer does not say ${phrase}`);
    }
  });

  it("says how many exercises are free, and sends the reader to them", () => {
    assert.ok(body.includes(`${track.freeLessonCount} exercises free`), "the free count is not in the heading");
    assert.ok(body.includes('href="/start"'), "the free exercises are not one click from the price");
  });

  it("does not print either half of the catalogue", () => {
    // The page sold the track by listing it, twice: ten linked titles, then eighty-six rows in a fold.
    // A catalogue is the one thing an offer page must not be, so a title anywhere on it is a regression
    // whichever list it came back through.
    for (const candidate of [...free, ...paid]) {
      const title = esc(candidate.exercise.title);
      assert.equal(body.includes(title), false, `"${candidate.exercise.title}" is listed on the offer`);
      assert.equal(body.includes(`href="${candidate.path}"`), false, `${candidate.path} links into an exercise`);
    }
  });

  it("carries no header fact at all, so it cannot promise one it does not honour", () => {
    // The header used to state one fact about the page, and each page overrode it — a badge here, a
    // count there. The slot is gone, so the pricing page cannot leave a promise in it, and the offer
    // is stated exactly where it is explained: in the page body.
    assert.equal(page.counter, undefined, "the pricing page set a header count");
    assert.equal(page.badge, undefined, "the pricing page set a header badge");
  });

  it("tells the reader that checkout is not open yet, rather than taking a payment it cannot take", () => {
    assert.ok(body.includes("Checkout is not open on this copy"), "the page must not imply a working checkout");
  });
});
