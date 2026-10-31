/**
 * The leaderboard's shaping and its minute of cache, with the database replaced by a recorder.
 *
 * `tests/db/leaderboard.spec.js` owns the ordering — that is a window function and belongs in SQL.
 * What this file owns is everything the page would get wrong if the module were written carelessly:
 * a rank that arrives as a string, an own row that is found by comparing ids instead of trusting
 * `is_me`, an error that gets cached and hides a recovered database for a minute, and a cache shared
 * between two learners whose `my_rank` then differs from their own.
 */
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import {
  LEADERBOARD_SIZE,
  LEADERBOARD_TTL,
  cachedBoards,
  clearLeaderboardCache,
  loadBoards,
} from "../lib/retention/leaderboard.js";

const DAY = "2026-05-04";

const POINTS = [
  { rank: "1", user_id: "u1", username: "ada", points: "120", flagged: false, is_me: false },
  { rank: "2", user_id: "u2", username: "grace", points: "90", flagged: false, is_me: false },
  { rank: "3", user_id: "u3", username: "linus", points: "40", flagged: false, is_me: false },
  { rank: "4", user_id: "u9", username: "me", points: "10", flagged: false, is_me: true },
];

const STREAKS = [
  { rank: "1", user_id: "u2", username: "grace", streak: "9", is_me: false },
  { rank: "2", user_id: "u9", username: "me", streak: "2", is_me: true },
];

/** A service client that counts the calls it serves and can be made to fail. */
function fakeClient({ points = POINTS, streaks = STREAKS, error = null } = {}) {
  const calls = [];
  return {
    calls,
    async rpc(name, args) {
      calls.push({ name, args });
      if (error) return { data: null, error: { message: error } };
      // `is_me` is the database's answer, not the fixture's: it is true for the learner who asked.
      const mine = (row) => ({ ...row, is_me: row.user_id === args.p_user });
      return { data: (name === "leaderboard_points" ? points : streaks).map(mine), error: null };
    },
  };
}

beforeEach(() => clearLeaderboardCache());

describe("loadBoards", () => {
  it("asks both boards for the same day and learner", async () => {
    const client = fakeClient();
    await loadBoards(client, { day: DAY, userId: "u9" });
    assert.deepEqual(client.calls.map((call) => call.name).sort(), ["leaderboard_points", "leaderboard_streaks"]);
    for (const call of client.calls) {
      assert.deepEqual(call.args, { p_day: DAY, p_user: "u9", p_limit: LEADERBOARD_SIZE });
    }
  });

  it("turns the row values into numbers and keeps the own row out of the ranking", async () => {
    const { points } = await loadBoards(fakeClient(), { day: DAY, userId: "u9" });
    assert.equal(typeof points.rows[0].rank, "number");
    assert.equal(points.rows[0].points, 120);
    assert.equal(points.myRank, 4, "the own row that is below the cut still carries its rank");
    assert.equal(points.myPoints, 10);
    assert.equal(points.flagged, false);
    assert.equal(points.error, null);
  });

  it("reports a null rank for a learner who is not on the board", async () => {
    const { points, streaks } = await loadBoards(fakeClient(), { day: DAY, userId: "nobody" });
    assert.equal(points.myRank, null);
    assert.equal(points.myPoints, null);
    assert.equal(streaks.myRank, null);
    assert.equal(points.rows.length, 4);
  });

  it("surfaces a flagged own row instead of hiding it", async () => {
    const flagged = [{ rank: null, user_id: "u9", username: "me", points: "500", flagged: true, is_me: true }];
    const { points } = await loadBoards(fakeClient({ points: flagged }), { day: DAY, userId: "u9" });
    assert.equal(points.flagged, true);
    assert.equal(points.myRank, null);
    assert.equal(points.myPoints, 500);
  });

  it("returns the error message rather than throwing", async () => {
    const { points, streaks } = await loadBoards(fakeClient({ error: "permission denied" }), {
      day: DAY,
      userId: "u9",
    });
    assert.equal(points.error, "permission denied");
    assert.equal(streaks.error, "permission denied");
    assert.deepEqual(points.rows, []);
  });

  it("accepts a row that arrives on its own, and an empty answer as an empty board", async () => {
    const client = {
      async rpc(name) {
        return { data: name === "leaderboard_points" ? POINTS[0] : null, error: null };
      },
    };
    const { points, streaks } = await loadBoards(client, { day: DAY, userId: "u1" });
    assert.equal(points.rows.length, 1);
    assert.equal(points.rows[0].username, "ada");
    assert.deepEqual(streaks.rows, [], "null is a board nobody has scored on");
  });
});

describe("cachedBoards", () => {
  it("serves a second call from memory inside the minute", async () => {
    const client = fakeClient();
    let at = 1_000;
    const now = () => at;
    await cachedBoards(client, { day: DAY, userId: "u9", now });
    at += LEADERBOARD_TTL - 1;
    await cachedBoards(client, { day: DAY, userId: "u9", now });
    assert.equal(client.calls.length, 2, 'two boards, asked for once');
  });

  it("asks again once the minute is up", async () => {
    const client = fakeClient();
    let at = 1_000;
    const now = () => at;
    await cachedBoards(client, { day: DAY, userId: "u9", now });
    at += LEADERBOARD_TTL;
    await cachedBoards(client, { day: DAY, userId: "u9", now });
    assert.equal(client.calls.length, 4);
  });

  it("never shares an entry between two learners", async () => {
    const client = fakeClient();
    const now = () => 1_000;
    await cachedBoards(client, { day: DAY, userId: "u1", now });
    await cachedBoards(client, { day: DAY, userId: "u2", now });
    assert.equal(client.calls.length, 4, "the own row differs, so the entry cannot be shared");
  });

  it("does not cache a failure", async () => {
    const broken = fakeClient({ error: "down" });
    await cachedBoards(broken, { day: DAY, userId: "u9", now: () => 1_000 });
    await cachedBoards(broken, { day: DAY, userId: "u9", now: () => 1_001 });
    assert.equal(broken.calls.length, 4);
  });

  it("can be forced past the cache", async () => {
    const client = fakeClient();
    const now = () => 1_000;
    await cachedBoards(client, { day: DAY, userId: "u9", now });
    await cachedBoards(client, { day: DAY, userId: "u9", now, force: true });
    assert.equal(client.calls.length, 4);
  });
});
