/**
 * The database's copy of a learner's progress, turned into the record the browser already keeps.
 *
 * Two stores, one shape. The dashboard island reads `es.progress` out of `localStorage` — that is what
 * makes the track work with no account and no network — and `GET /api/progress` answers the same shape
 * from `lesson_progress`, so a signed-in learner who opens the track on a second browser sees what they
 * actually finished instead of a fresh 0 of 88. The island then unions the two with `mergeProgress`
 * (`packages/progress`), which is why the shape here has to survive `parseProgress`: anything this
 * module cannot express as a valid record would be silently dropped on arrival.
 *
 * The mapping is deliberately lossy in both directions and says so: the server keeps screen visits,
 * accuracy and best times, and none of them have a slot in the roll-up. What survives is the four
 * things the dashboard draws — finished, when, whether help was used, and how many checks it took.
 */
export const RECORD_VERSION = 1;

/** A completion needs a parseable timestamp; the database's is one, and a malformed one is not guessed. */
function isoAt(value) {
  if (typeof value !== "string" || value === "") return null;
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
}

function positiveInt(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

/**
 * @param {Array<{lesson_id: string, status?: string, attempts?: number, helped?: boolean,
 *   completed_at?: string|null, last_seen_at?: string|null}>} rows
 * @returns {{v: number, done: Record<string, {at: string, tries: number, helped: boolean}>,
 *   tries: Record<string, number>, unlocked: boolean}}
 */
export function recordFrom(rows) {
  const record = { v: RECORD_VERSION, done: {}, tries: {}, unlocked: false };
  for (const row of Array.isArray(rows) ? rows : []) {
    const id = typeof row?.lesson_id === "string" ? row.lesson_id.trim() : "";
    if (id === "") continue;
    const attempts = positiveInt(row.attempts, 1);
    const at = isoAt(row.completed_at);
    if (row.status === "complete" && at) {
      record.done[id] = { at, tries: attempts, helped: row.helped === true };
      continue;
    }
    // Started and unfinished: the roll-up has no room for "in progress", only for a check count.
    record.tries[id] = attempts;
  }
  return record;
}
