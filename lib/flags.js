/**
 * The three kill switches phase 5 ships behind: `streaks`, `dailyChallenge`, `flashcards`.
 *
 * They exist for one situation — something in one retention surface misbehaves on launch day and the
 * other two should not have to wait for the fix. So the default is *on*, and turning one off is a
 * single environment variable rather than a deploy:
 *
 *   RETENTION_STREAKS=off            the streak rows, the streak board, and `touch_streak`
 *   RETENTION_DAILY_CHALLENGE=off    `/daily`, `/daily/run` and `/api/daily`
 *   RETENTION_FLASHCARDS=off         `/flashcards` and `/api/flashcards`
 *
 * Only an explicit off value switches a surface off. Anything else — unset, empty, `on`, or a value
 * nobody recognises like `disable` — leaves it on, because the failure mode of guessing wrong in that
 * direction is a feature that stays visible (someone notices immediately) rather than one that
 * disappears during an incident and takes a second deploy to bring back.
 *
 * Every flag is read on the server: pages are server components and the API routes run in Node, so a
 * flag never has to reach the browser. That is deliberate — a kill switch that ships in the client
 * bundle is advice, not a switch, and the two pages that would need it are already `instant = false`.
 * A switch turned off mid-session therefore takes effect on the next request, which is the behaviour a
 * person pulling it wants.
 */

/** Flag name → the environment variable that controls it. */
export const FLAG_VARIABLES = {
  streaks: "RETENTION_STREAKS",
  dailyChallenge: "RETENTION_DAILY_CHALLENGE",
  flashcards: "RETENTION_FLASHCARDS",
};

/** The spellings that mean "off". `NO` is here because a value copied out of a form often is. */
const OFF = new Set(["off", "0", "false", "no"]);

/**
 * What a switched-off surface says when a reader reaches it anyway.
 *
 * One sentence per flag, in the same shape as `NOT_CONFIGURED`: the reader is told what is off and
 * what still works, never why — the reason is an operator's business, and a stale explanation in the
 * UI is worse than none.
 */
export const FLAG_COPY = {
  streaks:
    "Streaks are switched off on this deployment. Finished lessons are still recorded and points are still paid.",
  dailyChallenge: "The daily challenge is switched off on this deployment. The drills are unaffected.",
  flashcards: "Flashcards are switched off on this deployment. Your finished lessons are still recorded.",
};

const NAMES = Object.keys(FLAG_VARIABLES);

/**
 * One flag, defaulting to on.
 *
 * An unknown name throws rather than answering `true`: every caller is source code, a typo here means
 * a surface that is not actually switchable, and that is worth failing a test over rather than
 * discovering during an incident.
 */
export function flagEnabled(name, env = process.env) {
  const variable = FLAG_VARIABLES[name];
  if (!variable) throw new TypeError(`unknown feature flag: ${name} (known: ${NAMES.join(", ")})`);
  const value = String(env?.[variable] ?? "").trim().toLowerCase();
  return !OFF.has(value);
}

/** All three at once, for a page that asks more than one question. */
export function retentionFlags(env = process.env) {
  const flags = {};
  for (const name of NAMES) flags[name] = flagEnabled(name, env);
  return flags;
}

/** The sentence a switched-off surface shows. Throws for an unknown name, like `flagEnabled`. */
export function flagCopy(name) {
  const copy = FLAG_COPY[name];
  if (!copy) throw new TypeError(`unknown feature flag: ${name} (known: ${NAMES.join(", ")})`);
  return copy;
}
