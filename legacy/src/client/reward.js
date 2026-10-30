/**
 * The reward line a finished lesson earns, and nothing else.
 *
 * Points are the server's: the browser is never told what a correct answer is worth until the batch
 * lands, so the number shown is a report of what was credited, not a promise made in advance. A
 * deployment without accounts answers `503` and pays nothing, which is why there is a line here to
 * show or nothing at all — never a zero.
 *
 * `POST /api/progress` pays a batch at most once, so a replay (`409`) reports nothing: the award was
 * already made on the batch it repeats.
 */

const number = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * What a `POST /api/progress` body says was earned, or null when it earned nothing.
 *
 * @param {unknown} body the parsed response
 * @returns {{points: {awarded: number} | null, streak: {current: number} | null} | null}
 */
export function rewardFrom(body) {
  if (!body || typeof body !== "object" || body.ok !== true) return null;
  const awarded = number(body.points?.awarded);
  const current = number(body.streak?.current);
  const points = awarded !== null && awarded > 0 ? { awarded } : null;
  const streak = current !== null && current > 0 ? { current } : null;
  return points || streak ? { points, streak } : null;
}

/**
 * `+12 points · 3-day streak`, or "" when there is nothing to report. The streak is the count the
 * server reports, not a delta: it moves once a day, so a second lesson on the same day repeats it
 * rather than claiming another day.
 *
 * @param {{points?: {awarded: number} | null, streak?: {current: number} | null} | null} reward
 * @returns {string}
 */
export function rewardLine(reward) {
  if (!reward) return "";
  const parts = [];
  const awarded = number(reward.points?.awarded);
  const current = number(reward.streak?.current);
  if (awarded !== null && awarded > 0) parts.push(`+${awarded} ${awarded === 1 ? "point" : "points"}`);
  if (current !== null && current > 0) parts.push(`${current}-day streak`);
  return parts.join(" · ");
}
