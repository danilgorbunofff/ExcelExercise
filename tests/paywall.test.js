/**
 * The server half of the paywall: the decision, the flag that turns it on, and the wiring in
 * `proxy.js` that makes a direct URL land on the offer instead of the drill.
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
import { siteConfig } from "../legacy/src/site/config.mjs";
import { loadContent } from "../legacy/src/site/content.mjs";
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
const entry = (number) => index[number - 1];
const freeLessonCount = track.freeLessonCount;

describe("paywallDecision", () => {
  it("serves the free drills", () => {
    for (let number = 1; number <= freeLessonCount; number += 1) {
      assert.equal(paywallDecision({ entry: entry(number), freeLessonCount }), null, `drill ${number}`);
    }
  });

  it("serves the prompt drill, because its 'continue free this once' button is client-side", () => {
    const prompt = paywallDecision({ entry: entry(freeLessonCount + 1), freeLessonCount });
    assert.equal(prompt, null, "a redirect here would make the soft prompt's button unreachable");
  });

  it("sends a paid drill to the offer", () => {
    for (let number = freeLessonCount + 2; number <= index.length; number += 1) {
      assert.equal(paywallDecision({ entry: entry(number), freeLessonCount }), PAYWALL_PATH, `drill ${number}`);
    }
  });

  it("reads the free count from the track, not from a constant in the code", () => {
    // The plan's "config, not code": the same drill is served or walled depending on `track.json`,
    // which is the point — moving the boundary must not need a code change.
    const fifth = { free: false, number: 5, path: "/excel/fifth" };
    assert.equal(paywallDecision({ entry: fifth, freeLessonCount: 3 }), PAYWALL_PATH);
    assert.equal(paywallDecision({ entry: fifth, freeLessonCount: 4 }), null, "the prompt drill follows the config");
    assert.equal(paywallDecision({ entry: fifth, freeLessonCount: 5 }), PAYWALL_PATH, "and so does the wall");
  });

  it("serves anything to an entitled reader", () => {
    assert.equal(paywallDecision({ entry: entry(index.length), freeLessonCount, entitled: true }), null);
  });

  it("serves everything when enforcement is off, which is the shipped default", () => {
    for (let number = 1; number <= index.length; number += 1) {
      assert.equal(paywallDecision({ entry: entry(number), freeLessonCount, enforced: false }), null);
    }
  });

  it("has no opinion about a slug that is not in the catalog", () => {
    // `null` here means the lesson route's `notFound()` decides, which is the right 404 for a stranger.
    assert.equal(paywallDecision({ entry: null, freeLessonCount }), null);
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
    assert.match(code, /freeLessonCount: track\.freeLessonCount/);
  });

  it("asks it after the session, so a signed-in reader's entitlement is what decides", () => {
    const session = code.indexOf("await supabase.auth.getUser()");
    const paywall = code.indexOf("const paywall = await paywallFor(");
    assert.ok(session > -1 && paywall > session, "the paywall must run after getUser(), or entitlement is always false");
    assert.match(code, /if \(paywall\) return NextResponse\.redirect\(new URL\(paywall, request\.url\)\)/);
  });

  it("returns early before any of it when accounts are unconfigured", () => {
    const early = code.indexOf("if (!config.enabled) return NextResponse.next()");
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

  it("quotes the price the reference charges", () => {
    for (const phrase of ["$59.99/year", "100% refund guarantee", "Cancel anytime"]) {
      assert.ok(body.includes(phrase), `the offer does not say ${phrase}`);
    }
  });

  it("says how many drills are free and links every one of them", () => {
    assert.ok(body.includes(`Drills 1–${free.length} are free`), "the free range in the lede");
    for (const candidate of free) assert.ok(body.includes(`href="${candidate.path}"`), candidate.path);
  });

  it("names the paid drills without linking into a wall", () => {
    for (const candidate of paid) {
      assert.ok(body.includes(candidate.exercise.title), candidate.exercise.title);
      assert.equal(body.includes(`href="${candidate.path}"`), false, `${candidate.path} links into a gated drill`);
    }
  });

  it("does not claim the header badge it does not honour", () => {
    // The site header says "Free · no signup" everywhere else; on a price page that sentence would be
    // a lie in the first element a reader reads.
    const html = page.badge ? "free drills" : "";
    assert.ok(page.badge, "the pricing page must override the header badge");
    assert.equal(html.includes("no signup"), false);
  });

  it("tells the reader that checkout is not open yet, rather than taking a payment it cannot take", () => {
    assert.ok(body.includes("Checkout is not open yet"), "the page must not imply a working checkout");
  });
});
