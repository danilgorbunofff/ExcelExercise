/**
 * The four numbers a launch was priced at, written down as numbers.
 *
 * Every one of them already has a behaviour test, and every one of those tests reads the constant
 * instead of repeating it — which is the right way to write the behaviour and the wrong way to keep
 * the value honest. `max: 60` becoming `max: 600` leaves "allows exactly the budget, then refuses"
 * green, because the budget moved with the assertion. That is what these four tests are for: they
 * name the number the phase docs promise, so raising it is a red test and a decision, not a diff
 * nobody looked at.
 *
 * They are deliberately dull. The interesting assertions live beside the behaviour they describe;
 * this file only refuses silent drift.
 */
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import { datasetFor } from "../lib/projects.js";
import { LEADERBOARD_TTL, cachedBoards, clearLeaderboardCache } from "../lib/retention/leaderboard.js";
import { VERIFY_LIMIT, admitVerifyRequest, resetVerifyWindows } from "../lib/verify/limit.js";
import { DEFAULT_SESSION_MINUTES, createClock } from "../packages/session/clock.js";

describe("the certificate check limit", () => {
  // A minute of sixty: wide enough for a QA sweep or a shared office address, narrow enough that
  // walking the credential id space is pointless.
  it("is sixty per minute", () => {
    assert.equal(VERIFY_LIMIT.max, 60);
    assert.equal(VERIFY_LIMIT.windowMs, 60_000);
  });

  it("passes sixty and refuses the sixty-first inside one window", () => {
    resetVerifyWindows();
    const address = "203.0.113.7";
    for (let i = 1; i <= 60; i += 1) {
      assert.equal(admitVerifyRequest({ address, now: 0 }).allowed, true, `request ${i} of 60 was refused`);
    }
    assert.equal(admitVerifyRequest({ address, now: 0 }).allowed, false, "the 61st request was allowed");
    // The window is a window, not a ban: one millisecond past it the same address is served again.
    assert.equal(admitVerifyRequest({ address, now: 60_000 }).allowed, true, "the window did not reopen");
  });
});

describe("the default session budget", () => {
  it("is sixty minutes", () => {
    assert.equal(DEFAULT_SESSION_MINUTES, 60);
  });

  it("expires a clock built with no arguments at exactly sixty minutes", () => {
    // No injected budget: this is the default a page gets when nobody says otherwise.
    let now = 5_000;
    const clock = createClock({ now: () => now });
    now += 3_599_999;
    assert.equal(clock.expired(), false, "the session ended before the hour");
    assert.equal(clock.remainingMs(), 1);
    now += 1;
    assert.equal(clock.expired(), true, "the session outlived the hour");
    assert.equal(clock.remainingMs(), 0);
  });
});

describe("the leaderboard cache", () => {
  beforeEach(() => clearLeaderboardCache());

  /** Two calls per refill; the fake counts them so "served from memory" is observable. */
  const client = () => {
    const calls = [];
    return {
      calls,
      async rpc(name, args) {
        calls.push(name);
        return { data: [{ rank: "1", user_id: args.p_user, username: "me", points: "1", is_me: true }], error: null };
      },
    };
  };

  it("is one minute", () => {
    assert.equal(LEADERBOARD_TTL, 60_000);
  });

  it("serves from memory at 59 999 ms and refetches at 60 001 ms", async () => {
    const fake = client();
    let at = 10_000;
    const now = () => at;
    const args = { day: "2026-01-01", userId: "u1", now };

    await cachedBoards(fake, args);
    assert.equal(fake.calls.length, 2, "two boards, asked for once");

    at += 59_999;
    await cachedBoards(fake, args);
    assert.equal(fake.calls.length, 2, "the cache expired before the minute was up");

    at += 2;
    await cachedBoards(fake, args);
    assert.equal(fake.calls.length, 4, "the cache outlived the minute");
  });
});

describe("the dataset whitelist", () => {
  // The four fixtures the project track ships. The plan said nine; the track ships four, and the
  // assertion follows the content rather than the sentence.
  const REAL = ["ufo.xlsx", "trout.xlsx", "wine.xlsx", "interview-assessment.xlsx"];

  it("resolves every dataset the track ships", () => {
    for (const file of REAL) {
      const dataset = datasetFor(file);
      assert.ok(dataset, `${file} does not resolve`);
      assert.equal(dataset.file, file);
    }
  });

  it("refuses a path that climbs out of the directory", () => {
    for (const file of ["../package.json", "..%2fpackage.json", "../../etc/passwd", "..\\package.json"]) {
      assert.equal(datasetFor(file), null, `${file} was resolved`);
    }
  });

  it("refuses an absolute path", () => {
    for (const file of ["/etc/passwd", "/Users/danil/ufo.xlsx", "file:///etc/passwd"]) {
      assert.equal(datasetFor(file), null, `${file} was resolved`);
    }
  });

  it("refuses a name it does not ship, in any casing or with a leading dot", () => {
    for (const file of ["unknown.xlsx", "UFO.XLSX", "Ufo.xlsx", ".ufo.xlsx", ".env", "", "ufo", "ufo.xlsx "]) {
      assert.equal(datasetFor(file), null, `${JSON.stringify(file)} was resolved`);
    }
  });
});
