/**
 * The dashboard's read model. It answers three questions about a progress record and a plan of
 * lessons: what badge does each lesson wear, how far along is the track, and what should this learner
 * open next. Pure — no DOM, no storage, no clock of its own: the caller passes `now`, so a test can pin
 * it and the answer never depends on when the page happened to load.
 *
 * The order of `BADGES` is the precedence the dashboard uses, strongest first. A lesson that was solved
 * and then went cold is `stale` even though it is also complete, because the useful thing to say about
 * it is "look again", not "well done".
 */

export const STALE_AFTER_DAYS = 14;
export const PRACTICE_AFTER_TRIES = 2;
export const RECENT_LIMIT = 5;

/** Strongest first: the first badge a lesson earns is the one it shows. */
export const BADGES = ["stale", "needs_practice", "complete", "in_progress", "not_started"];

export const BADGE_LABELS = {
  stale: "Stale",
  needs_practice: "Needs practice",
  complete: "Complete",
  in_progress: "In progress",
  not_started: "Not started",
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function badgeLabel(badge) {
  return BADGE_LABELS[badge] ?? BADGE_LABELS.not_started;
}

/**
 * What one lesson earned. `tries` counts failed checks, and a completion freezes the count it was solved
 * with, so `done.tries >= PRACTICE_AFTER_TRIES` means "solved, but not first time".
 */
export function badgeFor(progress, id, now = Date.now()) {
  const done = progress?.done?.[id];
  if (done) {
    const at = Date.parse(done.at ?? "");
    if (Number.isFinite(at) && now - at >= STALE_AFTER_DAYS * DAY_MS) return "stale";
    const tries = Number.isInteger(done.tries) ? done.tries : 0;
    if (done.helped === true || tries >= PRACTICE_AFTER_TRIES) return "needs_practice";
    return "complete";
  }
  if ((progress?.tries?.[id] ?? 0) > 0) return "in_progress";
  return "not_started";
}

/**
 * The one sentence beside the counts. Shared so the server-rendered page and the island cannot drift
 * into describing the same state two different ways.
 */
export function summaryLine({ completed, total, stale = 0, needsPractice = 0 }) {
  if (total === 0) return "No drills are published yet.";
  if (completed === 0) return "Nothing started yet. The first drill is one formula and about two minutes.";
  const remaining = Math.max(0, total - completed);
  const parts = [remaining === 0 ? "Every drill is finished." : `${remaining} drill${remaining === 1 ? "" : "s"} to go.`];
  if (stale > 0 && needsPractice > 0) parts.push(`${stale} going stale, ${needsPractice} wanting practice.`);
  else if (stale > 0) parts.push(`${stale} going stale.`);
  else if (needsPractice > 0) parts.push(`${needsPractice} wanting another look.`);
  return parts.join(" ");
}

/**
 * The label and the reason on the up-next button. `finished` is the honest end of the track: there is no
 * button, no daily challenge and no certificate, because this site has neither yet.
 */
export function nextCopy({ next, nextReason }) {
  if (!next) {
    return {
      label: "You have finished the track",
      why: "Nothing is stale and nothing wants practice. Come back in a couple of weeks and this page will say what has gone cold.",
    };
  }
  const verb = nextReason === "resume" ? "Resume" : nextReason === "practice" ? "Revisit" : "Start";
  const why = {
    start: "The first drill you have not finished.",
    resume: "You have already had a go at this one, so it is the next thing to finish.",
    practice: "Every drill is finished, and this is the one that has gone the coldest.",
  };
  return { label: `${verb} drill ${next.number} · ${next.title}`, why: why[nextReason] ?? "" };
}

/**
 * Whether a drill is open yet. The track is in order: a lesson opens when every lesson before it is
 * finished, which makes the frontier the one that always is. A lesson already finished stays open
 * however far past the frontier it sits, because a learner who solved it has earned the revisit.
 *
 * `unlocked` is the local escape hatch: the whole track is in this browser's storage, so clearing the
 * browser would otherwise wall a returning learner behind drill 1 forever. One click on the gate sets
 * it, and it never leaves the browser.
 *
 * An id the plan does not contain is open. Gating something the plan cannot see would turn a stale
 * bookmark or a renamed lesson into a wall.
 */
export function canStart({ plan, progress = null, id, unlocked = false }) {
  if (unlocked === true) return { open: true, reason: "unlocked", after: null };
  const index = plan.findIndex((entry) => entry.id === id);
  if (index === -1) return { open: true, reason: "unknown", after: null };
  if (progress?.done?.[id]) return { open: true, reason: "complete", after: null };
  const frontier = plan.findIndex((entry) => !progress?.done?.[entry.id]);
  if (frontier === -1 || index <= frontier) {
    return { open: true, reason: index === frontier ? "next" : "open", after: null };
  }
  const blocking = plan[frontier];
  return {
    open: false,
    reason: "ahead",
    after: { id: blocking.id, number: blocking.number, title: blocking.title, path: blocking.path },
  };
}

/** "just now", "4 minutes ago", "2 days ago", "3 weeks ago" — for the recent list. */
export function ago(at, now = Date.now()) {
  const then = typeof at === "number" ? at : Date.parse(at ?? "");
  if (!Number.isFinite(then)) return "";
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  const weeks = Math.round(days / 7);
  return `${weeks} week${weeks === 1 ? "" : "s"} ago`;
}

/**
 * The whole dashboard in one call. `plan` is the published lessons in order, each
 * `{ id, number, title, path, group }`. `nextReason` is `resume` when the up-next lesson already has a
 * failed check against it, `start` when it is untouched, `practice` when everything is complete but
 * something wants a second look, and `finished` when there is nothing left to suggest.
 *
 * `practice` picks the coldest lesson that wants attention — oldest completion first, across both
 * `needs_practice` and `stale` — because with the track behind them the useful question stops being
 * "what is next" and becomes "what will I have forgotten".
 */
export function summarise({ plan, progress = null, now = Date.now() }) {
  const rows = plan.map((entry) => ({ ...entry, badge: badgeFor(progress, entry.id, now) }));
  const solved = (row) => Boolean(progress?.done?.[row.id]);

  const completed = rows.filter(solved).length;
  const stale = rows.filter((row) => row.badge === "stale").length;
  const needsPractice = rows.filter((row) => row.badge === "needs_practice").length;

  const groups = [];
  const byGroup = new Map();
  for (const row of rows) {
    if (!row.group) continue;
    let group = byGroup.get(row.group);
    if (!group) {
      group = { id: row.group, completed: 0, total: 0 };
      byGroup.set(row.group, group);
      groups.push(group);
    }
    group.total += 1;
    if (solved(row)) group.completed += 1;
  }

  const unfinished = rows.find((row) => !solved(row));
  let next = null;
  let nextReason = "finished";
  if (unfinished) {
    next = unfinished;
    nextReason = unfinished.badge === "in_progress" ? "resume" : "start";
  } else {
    const coldest = rows
      .filter((row) => row.badge === "needs_practice" || row.badge === "stale")
      .map((row) => ({ row, at: Date.parse(progress.done[row.id]?.at ?? "") || 0 }))
      .sort((a, b) => a.at - b.at)[0];
    if (coldest) {
      next = coldest.row;
      nextReason = "practice";
    }
  }

  const recent = rows
    .filter(solved)
    .map((row) => ({ ...row, at: progress.done[row.id].at ?? null }))
    .sort((a, b) => (Date.parse(b.at ?? "") || 0) - (Date.parse(a.at ?? "") || 0))
    .slice(0, RECENT_LIMIT);

  return {
    total: rows.length,
    completed,
    remaining: rows.length - completed,
    stale,
    needsPractice,
    next,
    nextReason,
    groups,
    recent,
    rows,
  };
}

/**
 * Union of what this browser kept and what the server holds, for the signed-in reader.
 *
 * The server wins on conflict: it is the only store that saw every device, and a browser that finished
 * a drill before signing in has already been migrated into it. A row that exists only locally is kept
 * — a drill finished while signed out on this device is still a drill finished, and dropping it would
 * make the page disagree with the learner's memory. `changed` is what tells the island whether a
 * repaint is worth it, so a second browser does not flicker an identical record.
 *
 * @param {{done: Record<string, object>, tries: Record<string, number>, unlocked?: boolean}} local
 * @param {{done?: Record<string, object>, tries?: Record<string, number>}} remote
 * @returns {{progress: typeof local, changed: boolean}}
 */
export function mergeProgress(local, remote) {
  const merged = {
    ...local,
    done: { ...local.done },
    tries: { ...local.tries },
    unlocked: local.unlocked === true,
  };
  let changed = false;

  for (const [id, entry] of Object.entries(remote?.done ?? {})) {
    const mine = merged.done[id];
    const same = Boolean(mine) && mine.at === entry.at && mine.tries === entry.tries && mine.helped === entry.helped;
    if (!same) changed = true;
    merged.done[id] = { at: entry.at, tries: entry.tries, helped: entry.helped };
    delete merged.tries[id];
  }

  for (const [id, tries] of Object.entries(remote?.tries ?? {})) {
    if (merged.done[id]) continue;
    if (tries > (merged.tries[id] ?? 0)) {
      merged.tries[id] = tries;
      changed = true;
    }
  }

  return { progress: merged, changed };
}
