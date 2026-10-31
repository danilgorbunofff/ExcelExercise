// Phase 5, unit 5h — the three kill switches, and the wiring that has to respect them.
//
// The module half is pure: an `env` in, three booleans out, no process state. The wiring half is not —
// a route handler reads `process.env` when it is called — so those cases set the variable, import the
// handler that CI actually serves, and put the environment back afterwards. That is the only way to
// prove the switch is connected to the surface rather than merely defined next to it.
//
// What is deliberately *not* here: rendering a page with a flag off, and the `/api/daily` route. The
// pages are server components and `/api/daily` imports `next/headers` through the session, which
// plain node cannot resolve — the honest proof for those is a build with the variable set, which is
// also what the operator does. `/api/flashcards` has no session and is exercised directly.

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { FLAG_COPY, FLAG_VARIABLES, flagCopy, flagEnabled, retentionFlags } from "../lib/flags.js";

const NAMES = ["dailyChallenge", "flashcards", "streaks"];

/** Run `fn` with some environment variables in place, and put the old ones back whatever happens. */
async function withEnv(vars, fn) {
  const saved = new Map();
  for (const [key, value] of Object.entries(vars)) {
    saved.set(key, process.env[key]);
    process.env[key] = value;
  }
  try {
    return await fn();
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

describe("flagEnabled", () => {
  it("leaves every surface on when nothing is configured", () => {
    for (const name of NAMES) assert.equal(flagEnabled(name, {}), true, name);
  });

  it("turns a surface off for each spelling of off", () => {
    for (const value of ["off", "OFF", " 0 ", "false", "No"]) {
      for (const name of NAMES) {
        assert.equal(flagEnabled(name, { [FLAG_VARIABLES[name]]: value }), false, `${name}=${value}`);
      }
    }
  });

  it("keeps the surface on for a value nobody recognises", () => {
    // The safe direction: a typo must not be able to hide a working feature during an incident.
    for (const value of ["", "on", "1", "true", "yes", "disable", "enabled", "falsey"]) {
      assert.equal(flagEnabled("flashcards", { [FLAG_VARIABLES.flashcards]: value }), true, JSON.stringify(value));
    }
  });

  it("reads only its own variable", () => {
    const env = { RETENTION_FLASHCARDS: "off" };
    assert.equal(flagEnabled("flashcards", env), false);
    assert.equal(flagEnabled("streaks", env), true);
    assert.equal(flagEnabled("dailyChallenge", env), true);
  });

  it("is loud about a name it does not know", () => {
    assert.throws(() => flagEnabled("leaderboard", {}), (error) => {
      assert.ok(error instanceof TypeError);
      assert.match(error.message, /unknown feature flag: leaderboard/);
      return true;
    });
  });
});

describe("retentionFlags", () => {
  it("answers all three, and agrees with the single-flag reader", () => {
    const env = { RETENTION_STREAKS: "off", RETENTION_DAILY_CHALLENGE: "off" };
    const flags = retentionFlags(env);
    assert.deepEqual(Object.keys(flags).sort(), NAMES);
    for (const name of NAMES) assert.equal(flags[name], flagEnabled(name, env), name);
    assert.equal(flags.streaks, false);
    assert.equal(flags.dailyChallenge, false);
    assert.equal(flags.flashcards, true);
  });

  it("is all-on for an empty environment", () => {
    assert.deepEqual(retentionFlags({}), { streaks: true, dailyChallenge: true, flashcards: true });
  });
});

describe("the flag table", () => {
  it("pins the variable names, so a rename is a visible change", () => {
    assert.deepEqual(FLAG_VARIABLES, {
      streaks: "RETENTION_STREAKS",
      dailyChallenge: "RETENTION_DAILY_CHALLENGE",
      flashcards: "RETENTION_FLASHCARDS",
    });
  });

  it("has a sentence for every flag, and only for real flags", () => {
    assert.deepEqual(Object.keys(FLAG_COPY).sort(), NAMES);
    for (const name of NAMES) {
      const copy = flagCopy(name);
      assert.equal(typeof copy, "string");
      assert.ok(copy.length > 20, `${name} says too little`);
      assert.match(copy, /switched off/, `${name} does not say it is off`);
    }
  });

  it("names the surface, and throws for a name it does not know", () => {
    assert.match(flagCopy("flashcards"), /Flashcards/);
    assert.match(flagCopy("dailyChallenge"), /daily challenge/);
    assert.match(flagCopy("streaks"), /Streaks/);
    assert.throws(() => flagCopy("nope"), TypeError);
  });
});

describe("the routes respect the switch", () => {
  afterEach(() => {
    for (const variable of Object.values(FLAG_VARIABLES)) delete process.env[variable];
  });

  it("serves flashcards when the flag is on", async () => {
    const { GET } = await import("../app/api/flashcards/route.js");
    const { loadSite } = await import("../lib/site.js");
    const lessonId = loadSite().index[0].exercise.id;
    const response = await GET(new Request(`http://127.0.0.1/api/flashcards?id=${lessonId}`));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.ok(body.cards.length > 0, "a live lesson still builds cards");
  });

  it("refuses flashcards with a 404 when the flag is off", async () => {
    const { GET } = await import("../app/api/flashcards/route.js");
    const response = await withEnv({ RETENTION_FLASHCARDS: "off" }, () =>
      GET(new Request("http://127.0.0.1/api/flashcards?id=01-first-screen")),
    );
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { ok: false, error: "flashcards_disabled" });
  });
});
