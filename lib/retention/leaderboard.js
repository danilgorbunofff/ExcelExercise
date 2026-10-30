/**
 * The leaderboards as the page sees them: two calls, one shape, and a minute of cache.
 *
 * The ordering, the day boundary and the cheat flag are all decided in `0010_leaderboards.sql`; this
 * module does not sort anything. What it does is the part that has to be true on the page rather than
 * in the database — that a row's rank is a number or `null` rather than a string, that the caller's own
 * row is pulled out of the list by `is_me` instead of being found by comparing ids in the view, and
 * that a learner's own board is not re-read on every request.
 *
 * The cache is per learner per day and lives for a minute, which is the interval the phase plan names.
 * It is deliberately not a per-day cache shared between learners: `is_me` and `my_rank` differ per
 * viewer, and a shared entry would be the one place where two learners could see each other's rank.
 */

/** How long a board is served from memory before it is asked for again. */
export const LEADERBOARD_TTL = 60_000;

/** Nothing on a board needs more than three, and the database clamps to 25 regardless. */
export const LEADERBOARD_SIZE = 3;

const cache = new Map();

/** Drop every cached board. Used by tests; also the honest thing to call from a deploy hook. */
export function clearLeaderboardCache() {
  cache.clear();
}

/**
 * One row of the points board, as the page renders it.
 *
 * `rank` is `null` only in one case: the learner's own row when it is flagged, because a flagged row
 * is not ranked at all. `isMe` is the flag the view uses to highlight it, and `flagged` is what lets
 * the page say "under review" rather than silently omitting them.
 */
function shapeRow(row) {
  return {
    rank: row.rank === null || row.rank === undefined ? null : Number(row.rank),
    username: String(row.username ?? ""),
    points: row.points === undefined ? null : Number(row.points),
    streak: row.streak === undefined ? null : Number(row.streak),
    flagged: row.flagged === true,
    isMe: row.is_me === true,
  };
}

/**
 * PostgREST answers a `returns table` RPC with a list, but a one-row answer is easy to get back as the
 * row itself depending on how the call is made. Neither shape is an error, and an empty answer is a
 * board nobody has scored on yet.
 */
function rows(data) {
  if (Array.isArray(data)) return data;
  return data && typeof data === "object" ? [data] : [];
}

/** The row the caller owns, whether it is in the top three or not. */
function ownRow(rows) {
  return rows.find((row) => row.isMe) ?? null;
}

/**
 * Ask both boards for a day.
 *
 * @returns {Promise<{points: {rows: object[], myRank: number|null, myPoints: number|null, flagged: boolean},
 *                    streaks: {rows: object[], myRank: number|null, myStreak: number|null}}>}
 */
export async function loadBoards(client, { day, userId, limit = LEADERBOARD_SIZE }) {
  const args = { p_day: day, p_user: userId, p_limit: limit };
  const [pointsResult, streaksResult] = await Promise.all([
    client.rpc("leaderboard_points", args),
    client.rpc("leaderboard_streaks", args),
  ]);

  const points = rows(pointsResult.data).map(shapeRow);
  const streaks = rows(streaksResult.data).map(shapeRow);
  const mine = ownRow(points);
  const streakMine = ownRow(streaks);

  return {
    points: {
      rows: points,
      myRank: mine?.rank ?? null,
      myPoints: mine?.points ?? null,
      flagged: mine?.flagged === true,
      error: pointsResult.error?.message ?? null,
    },
    streaks: {
      rows: streaks,
      myRank: streakMine?.rank ?? null,
      myStreak: streakMine?.streak ?? null,
      error: streaksResult.error?.message ?? null,
    },
  };
}

/**
 * `loadBoards`, at most once a minute per learner per day.
 *
 * An error is not cached: a board that failed to load must be retried on the next request, or a
 * transient database problem would show an empty leaderboard for a minute after it recovered.
 *
 * @param {{now?: () => number, force?: boolean}} [options]
 */
export async function cachedBoards(client, { day, userId, limit = LEADERBOARD_SIZE, now = Date.now, force = false }) {
  const key = `${day}:${userId}`;
  const hit = cache.get(key);
  const at = now();
  if (!force && hit && at - hit.at < LEADERBOARD_TTL) return hit.value;

  const value = await loadBoards(client, { day, userId, limit });
  if (!value.points.error && !value.streaks.error) cache.set(key, { at, value });
  return value;
}
