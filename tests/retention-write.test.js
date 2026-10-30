/**
 * The retention half of a progress write, with the database replaced by a recorder.
 *
 * `tests/db/retention.spec.js` owns the questions that need a real Postgres — the row lock, the
 * per-day ceiling, the refusals. This file owns the ones that are the route's own: which screens are
 * worth asking about, which day the learner is having, whether a replay re-asks, and — the one that
 * matters most — whether a refused award turns into a failed batch. It must not.
 *
 * The client is a fake with the three methods the module uses, so a case can assert the arguments of
 * every call it made rather than the fact that it made one.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { FALLBACK_TIMEZONE } from "../lib/retention/points.js";
import {
  batchDay,
  creditBatch,
  creditScreens,
  learnerTimezone,
  moveStreak,
  payableScreens,
} from "../lib/retention/write.js";

/** A supabase-shaped client that records what was asked of it. */
function fakeClient({ timezone = "UTC", profileError = null, rpcError = null, award = 10, total = 10, streak = {} } = {}) {
  const calls = [];
  const rpcResults = {
    award_points: () => ({ data: { awarded: award, total }, error: rpcError }),
    touch_streak: () => ({
      data: { current: streak.current ?? 3, longest: streak.longest ?? 5, last_day: "2026-05-04", changed: true },
      error: rpcError,
    }),
  };
  return {
    calls,
    from(table) {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({ data: profileError ? null : { timezone }, error: profileError }),
      };
      calls.push({ method: "from", table });
      return chain;
    },
    async rpc(name, args) {
      calls.push({ method: "rpc", name, args });
      return rpcResults[name]();
    },
  };
}

const USER = { id: "user-1" };
const LESSON = "07-running-total";

describe("payableScreens", () => {
  it("pays the screens that were answered", () => {
    const screens = payableScreens([{ screen_id: "screen-1" }, { screen_id: "screen-2", help_used: false }]);
    assert.deepEqual(
      screens.map((screen) => screen.screen_id),
      ["screen-1", "screen-2"],
    );
  });

  it("does not pay a screen the reference answered for the learner", () => {
    const screens = payableScreens([
      { screen_id: "screen-1", help_used: true },
      { screen_id: "screen-2", help_used: false },
    ]);
    assert.equal(screens.length, 1);
    assert.equal(screens[0].screen_id, "screen-2");
  });

  it("skips a row with no screen id, which could never be claimed twice", () => {
    assert.deepEqual(payableScreens([{ screen_id: "" }, { screen_id: "   " }, {}, null]), []);
  });

  it("survives a payload that is not a list", () => {
    assert.deepEqual(payableScreens(undefined), []);
    assert.deepEqual(payableScreens("nope"), []);
  });
});

describe("learnerTimezone", () => {
  it("reads the learner's stored zone", async () => {
    const client = fakeClient({ timezone: "Pacific/Auckland" });
    assert.equal(await learnerTimezone(client, "user-1"), "Pacific/Auckland");
  });

  it("falls back to UTC when the profile cannot be read", async () => {
    assert.equal(await learnerTimezone(fakeClient({ profileError: { message: "boom" } }), "user-1"), FALLBACK_TIMEZONE);
    assert.equal(await learnerTimezone(fakeClient({ timezone: "" }), "user-1"), FALLBACK_TIMEZONE);
    assert.equal(
      await learnerTimezone(
        {
          from() {
            throw new Error("no network");
          },
        },
        "user-1",
      ),
      FALLBACK_TIMEZONE,
    );
  });
});

describe("batchDay", () => {
  it("is the learner's calendar day, not the server's", () => {
    const instant = "2026-06-01T12:30:00.000Z";
    assert.equal(batchDay(instant, "Pacific/Auckland"), "2026-06-02");
    assert.equal(batchDay(instant, "UTC"), "2026-06-01");
  });

  it("is never null, even for a bad zone and a bad instant", () => {
    assert.equal(batchDay("not a date", "Mars/Olympus").length, 10);
    assert.equal(batchDay("2026-06-01T12:30:00.000Z", "Mars/Olympus"), "2026-06-01");
  });
});

describe("creditScreens", () => {
  it("asks for one award per payable screen, all on the same day", async () => {
    const client = fakeClient({ award: 21, total: 21 });
    const result = await creditScreens(client, {
      user: USER,
      lessonId: LESSON,
      screens: [{ screen_id: "screen-1" }, { screen_id: "screen-2" }],
      day: "2026-05-04",
      random: () => 0.5,
    });
    assert.deepEqual(result, { ok: true, awarded: 42, total: 21, paid: 2 });
    const rpc = client.calls.filter((call) => call.method === "rpc");
    assert.equal(rpc.length, 2);
    assert.equal(rpc[0].name, "award_points");
    assert.equal(rpc[0].args.p_lesson_id, LESSON);
    assert.equal(rpc[0].args.p_day, "2026-05-04");
    assert.equal(rpc[0].args.p_screen_id, "screen-1");
    assert.equal(rpc[0].args.p_award, 21, "7 × the middle draw of 1..5");
  });

  it("asks for nothing when the lesson has no number to multiply", async () => {
    const client = fakeClient();
    const result = await creditScreens(client, {
      user: USER,
      lessonId: "project-ufo",
      screens: [{ screen_id: "screen-1" }],
      day: "2026-05-04",
    });
    assert.deepEqual(result, { ok: true, awarded: 0, total: 0, paid: 0 });
    assert.equal(client.calls.filter((call) => call.method === "rpc").length, 0);
  });

  it("reports a refusal as a value instead of throwing", async () => {
    const client = fakeClient({ rpcError: { message: "permission denied for function award_points" } });
    const result = await creditScreens(client, {
      user: USER,
      lessonId: LESSON,
      screens: [{ screen_id: "screen-1" }],
      day: "2026-05-04",
    });
    assert.deepEqual(result, { ok: false, error: "permission denied for function award_points" });
  });

  it("does not count a screen the day already paid for", async () => {
    const client = fakeClient({ award: 0, total: 40 });
    const result = await creditScreens(client, {
      user: USER,
      lessonId: LESSON,
      screens: [{ screen_id: "screen-1" }],
      day: "2026-05-04",
    });
    assert.equal(result.paid, 0);
    assert.equal(result.total, 40);
  });
});

describe("moveStreak", () => {
  it("returns the row the database holds", async () => {
    const client = fakeClient({ streak: { current: 4, longest: 9 } });
    assert.deepEqual(await moveStreak(client, { user: USER, day: "2026-05-04" }), {
      ok: true,
      current: 4,
      longest: 9,
      changed: true,
    });
  });

  it("reports a refusal as a value instead of throwing", async () => {
    const client = fakeClient({ rpcError: { message: "no" } });
    assert.deepEqual(await moveStreak(client, { user: USER, day: "2026-05-04" }), { ok: false, error: "no" });
  });

  it("reports an empty answer rather than claiming a streak of zero", async () => {
    const client = { async rpc() { return { data: null, error: null }; } };
    const result = await moveStreak(client, { user: USER, day: "2026-05-04" });
    assert.equal(result.ok, false);
  });
});

describe("creditBatch", () => {
  const attempts = [{ screen_id: "screen-1" }, { screen_id: "screen-2", help_used: true }];
  const summary = { score: 100, wrong: 0, helped: true, ms: 9000, completed: true };

  it("pays the payable screens and moves the streak on a completion", async () => {
    const client = fakeClient();
    const { points, streak } = await creditBatch(client, {
      user: USER,
      lessonId: LESSON,
      attempts,
      summary,
      instant: "2026-05-04T09:00:00.000Z",
    });
    assert.equal(points.ok, true);
    assert.equal(points.paid, 1, "one of the two screens was answered for the learner");
    assert.equal(streak.ok, true);
  });

  it("does not move the streak for a lesson that is still in progress", async () => {
    const client = fakeClient();
    const { streak } = await creditBatch(client, {
      user: USER,
      lessonId: LESSON,
      attempts,
      summary: { ...summary, completed: false },
    });
    assert.equal(streak.skipped, true);
    assert.equal(client.calls.filter((call) => call.name === "touch_streak").length, 0);
  });

  it("asks nothing at all for a replayed batch", async () => {
    const client = fakeClient();
    const result = await creditBatch(client, {
      user: USER,
      lessonId: LESSON,
      attempts,
      summary,
      replayed: true,
    });
    assert.deepEqual(result, { points: null, streak: null });
    assert.deepEqual(client.calls, []);
  });

  it("pays the screens but leaves the streak alone when the streak flag is off", async () => {
    const client = fakeClient();
    const { points, streak } = await creditBatch(client, {
      user: USER,
      lessonId: LESSON,
      attempts,
      summary,
      flags: { streaks: false },
    });
    assert.equal(points.ok, true);
    assert.equal(points.paid, 1, "points are not the switch's business");
    assert.equal(streak.skipped, true);
    assert.equal(client.calls.filter((call) => call.name === "touch_streak").length, 0);
  });

  it("uses the learner's timezone for the day it credits", async () => {
    const client = fakeClient({ timezone: "Pacific/Auckland" });
    await creditBatch(client, {
      user: USER,
      lessonId: LESSON,
      attempts,
      summary,
      instant: "2026-06-01T12:30:00.000Z",
    });
    const award = client.calls.find((call) => call.name === "award_points");
    const touch = client.calls.find((call) => call.name === "touch_streak");
    assert.equal(award.args.p_day, "2026-06-02");
    assert.equal(touch.args.p_day, "2026-06-02");
  });
});
