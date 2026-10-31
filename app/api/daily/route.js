/**
 * `POST /api/daily` — the only way a run's verdict is decided.
 *
 * Two actions, and both are server work:
 *
 *   * `{ action: "start" }` — creates (or resumes) the learner's run for their local day and returns the
 *     ten screens with every answer stripped. The run page never holds the key.
 *   * `{ action: "answer", screenId, value }` — grades one answer with the same grader the drills use,
 *     stores the verdict, and closes the run when the ten screens are done or the fifteen minutes are.
 *
 * The screen id is checked against the day's stored challenge before it is looked up, so a request
 * cannot ask about a screen the run did not include, and the answer is graded against content rather
 * than against anything the client sent.
 *
 * A run is one per learner per day (`challenge_attempts` is unique on `(day, user_id)`), so "start"
 * twice resumes rather than restarts. A screen's first verdict is final: a resubmitted answer returns
 * that verdict instead of replacing it, which is what makes the ranking mean something.
 */
import { authConfig } from "../../../lib/auth/config.js";
import { currentUser } from "../../../lib/auth/server.js";
import { flagEnabled } from "../../../lib/flags.js";
import { progressClient } from "../../../lib/progress/write.js";
import {
  ACTIVITY_WINDOW_DAYS,
  CHALLENGE_CAP_MS,
  CHALLENGE_SIZE,
  beginRun,
  ensureChallenge,
  finishRun,
  gradeScreen,
  loadActivity,
  msLeft,
  recordAnswer,
  screenKey,
  screenPayload,
} from "../../../lib/retention/challenge.js";
import { FALLBACK_TIMEZONE } from "../../../lib/retention/points.js";
import { batchDay, learnerTimezone } from "../../../lib/retention/write.js";
import { loadSite } from "../../../lib/site.js";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

/** The day's challenge and this learner's run, which every action needs. */
async function context({ client, user }) {
  const { index } = loadSite();
  const zone = await learnerTimezone(client, user.id);
  const day = batchDay(new Date(), zone || FALLBACK_TIMEZONE);
  const since = new Date(Date.now() - ACTIVITY_WINDOW_DAYS * 86_400_000);
  const activity = await loadActivity(client, { since });
  const challenge = await ensureChallenge(client, { day, index, activity });
  if (challenge.error) return { error: challenge.error, status: 502 };
  const run = await beginRun(client, { day, userId: user.id });
  if (!run.ok) return { error: run.error, status: 502 };
  return { day, zone, index, challenge, attempt: run.attempt };
}

export async function POST(request) {
  // The kill switch answers before the session question: a surface that is switched off is off for
  // everyone, and saying so costs no database round trip.
  if (!flagEnabled("dailyChallenge")) {
    return json({ ok: false, error: "daily_disabled" }, 404);
  }

  if (!authConfig().enabled) {
    return json({ ok: false, error: "daily_unconfigured" }, 503);
  }

  const { user } = await currentUser();
  if (!user) return json({ ok: false, error: "sign_in_required" }, 401);

  const client = progressClient();
  if (!client) {
    console.error("api/daily: SUPABASE_SERVICE_ROLE_KEY is unset, cannot run a challenge");
    return json({ ok: false, error: "daily_unconfigured" }, 503);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "body is not JSON" }, 400);
  }

  const state = await context({ client, user });
  if (state.error) return json({ ok: false, error: state.error }, state.status);

  const { day, challenge, attempt } = state;
  const screens = challenge.screens;

  // A finished run answers every action with the score: the page may be reloaded, the tab may be
  // restored, and the score is the same in all of those. It is never re-graded.
  if (attempt.finishedAt) {
    return json({
      ok: true,
      day,
      action: "finished",
      finished: true,
      size: screens.length,
      answered: attempt.answered,
      correct: attempt.correct,
      accuracy: attempt.accuracy,
      ms: attempt.ms,
    });
  }

  const action = body?.action === "answer" ? "answer" : body?.action === "start" ? "start" : null;
  if (!action) return json({ ok: false, error: "unknown_action" }, 400);

  const left = msLeft(attempt.startedAt);
  if (left === 0) {
    // Time ran out while the tab was closed. The run closes with what it has: a learner who answered
    // six screens is scored six out of ten, not six out of six.
    const score = await finishRun(client, { day, userId: user.id, size: screens.length || CHALLENGE_SIZE });
    return json({ ok: true, day, action: "finished", timeUp: true, finished: true, size: screens.length, ...score });
  }

  if (action === "start") {
    return json({
      ok: true,
      day,
      action: "start",
      finished: false,
      size: screens.length,
      answered: attempt.answered,
      startedAt: attempt.startedAt,
      capMs: CHALLENGE_CAP_MS,
      leftMs: left,
      screens: screens.map(screenPayload),
    });
  }

  const key = typeof body?.screenId === "string" ? body.screenId : "";
  const chosen = screens.find((candidate) => screenKey(candidate.lessonId, candidate.screen.id) === key);
  if (!chosen) return json({ ok: false, error: "unknown_screen" }, 400);

  const verdict = gradeScreen(chosen.lesson, chosen.screen, body?.value);
  const stored = await recordAnswer(client, { day, userId: user.id, screenId: key, ok: verdict.ok });
  if (!stored.ok) return json({ ok: false, error: stored.error ?? "answer_refused" }, 502);

  // The stored verdict, not the one just computed: a resubmitted screen keeps the answer it was first
  // graded with, so the page is told the same thing the ranking believes.
  const answered = Number(stored.answered ?? attempt.answered + 1);
  const done = answered >= screens.length;
  const score = done ? await finishRun(client, { day, userId: user.id, size: screens.length }) : null;

  return json({
    ok: true,
    action: "answer",
    screenId: key,
    verdict: stored.verdict === true,
    first: stored.first === true,
    rule: verdict.rule,
    message: verdict.message,
    expected: verdict.expected,
    answered,
    correct: Number(stored.correct ?? 0),
    size: screens.length,
    leftMs: msLeft(attempt.startedAt),
    finished: done,
    accuracy: score?.accuracy ?? null,
    ms: score?.ms ?? null,
  });
}
