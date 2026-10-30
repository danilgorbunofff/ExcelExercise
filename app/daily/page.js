import { Suspense } from "react";

import { authConfig } from "../../lib/auth/config.js";
import { currentUser } from "../../lib/auth/server.js";
import { flagCopy, flagEnabled } from "../../lib/flags.js";
import { progressClient } from "../../lib/progress/write.js";
import {
  ACTIVITY_WINDOW_DAYS,
  CHALLENGE_CAP_SECONDS,
  CHALLENGE_SIZE,
  ensureChallenge,
  loadActivity,
  loadRank,
  msLeft,
  shapeAttempt,
} from "../../lib/retention/challenge.js";
import { FALLBACK_TIMEZONE } from "../../lib/retention/points.js";
import { batchDay, learnerTimezone } from "../../lib/retention/write.js";
import { loadSite } from "../../lib/site.js";
import { AuthShell } from "../auth/shell.js";
import { AuthCard, Links, Notice } from "../auth/ui.js";

export const metadata = {
  title: "Daily challenge",
  description: "Five topics, ten screens, fifteen minutes. One run a day, ranked on accuracy then time.",
  robots: { index: false, follow: false },
};

// Same reason as `/account` and `/leaderboard`: without accounts configured the proxy skips the gate,
// so the page checks for itself and says what is missing.
export const instant = false;

const DAY_LABEL = new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeZone: "UTC" });

function seconds(ms) {
  const total = Math.max(0, Math.round(Number(ms ?? 0) / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** The board, as a table: rank, learner, accuracy, time. */
function Board({ rows, mine }) {
  if (rows.length === 0) {
    return <p>Nobody has finished today's run yet. The first score takes the top of the board.</p>;
  }
  return (
    <>
      <table className="auth-table">
        <caption>{`Today's fastest accurate runs`}</caption>
        <thead>
          <tr>
            <th scope="col">Rank</th>
            <th scope="col">Learner</th>
            <th scope="col">Correct</th>
            <th scope="col">Time</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr aria-current={row.isMe ? "true" : undefined} key={`${row.rank}-${row.username}`}>
              <td>{row.rank}</td>
              <td>{row.username}</td>
              <td>{`${Math.round(row.accuracy * 100)}%`}</td>
              <td>{seconds(row.ms)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>{mine === null ? "You are not on today's board yet." : `You are number ${mine} today.`}</p>
    </>
  );
}

/** What this learner has done today, in one sentence. */
function Attempt({ run, rank }) {
  if (!run) {
    return (
      <p>
        You have not started today&apos;s run. It is {CHALLENGE_SIZE} screens, no hints, and the clock
        starts the moment you do — one attempt, and the first answer for a screen is the answer that
        counts.
      </p>
    );
  }
  if (run.finishedAt) {
    return (
      <>
        <p>
          {`You finished today's run with ${run.correct} of ${CHALLENGE_SIZE} correct (${Math.round(
            (run.accuracy ?? 0) * 100,
          )}%) in ${seconds(run.ms)}.`}
        </p>
        <p>{rank === null ? "Your run is not on the board." : `You are number ${rank} today.`}</p>
      </>
    );
  }
  return (
    <p>
      {`You have a run open: ${run.answered} of ${CHALLENGE_SIZE} answered, ${seconds(
        msLeft(run.startedAt),
      )} left. There is no second attempt today, so finishing it is the only way onto the board.`}
    </p>
  );
}

async function ChallengeScreen() {
  if (!flagEnabled("dailyChallenge")) {
    return (
      <AuthCard title="Daily challenge">
        <Notice>{flagCopy("dailyChallenge")}</Notice>
        <Links items={[{ href: "/learn", label: "Your drills" }]} />
      </AuthCard>
    );
  }

  const config = authConfig();
  if (!config.enabled) {
    return (
      <AuthCard title="Daily challenge">
        <Notice>{config.reason}</Notice>
        <Links items={[{ href: "/learn", label: "Your drills" }]} />
      </AuthCard>
    );
  }

  const { user } = await currentUser();
  if (!user) {
    return (
      <AuthCard title="Daily challenge">
        <Notice>You are signed out.</Notice>
        <Links items={[{ href: "/login?next=%2Fdaily", label: "Sign in" }]} />
      </AuthCard>
    );
  }

  const client = progressClient();
  if (!client) {
    return (
      <AuthCard title="Daily challenge">
        <Notice>The challenge is unavailable on this deployment.</Notice>
        <Links items={[{ href: "/learn", label: "Your drills" }]} />
      </AuthCard>
    );
  }

  const { index, track } = loadSite();
  const zone = await learnerTimezone(client, user.id);
  const day = batchDay(new Date(), zone || FALLBACK_TIMEZONE);
  const activity = await loadActivity(client, { since: new Date(Date.now() - ACTIVITY_WINDOW_DAYS * 86_400_000) });
  // Reading the page creates the day's challenge but never starts the run: the clock is `started_at`,
  // and a learner who only wanted to read the rules has not started anything.
  const challenge = await ensureChallenge(client, { day, index, activity });
  const { data: attemptRow } = await client
    .from("challenge_attempts")
    .select("id, started_at, finished_at, answered, correct, accuracy, ms")
    .eq("day", day)
    .eq("user_id", user.id)
    .maybeSingle();
  const run = attemptRow ? shapeAttempt(attemptRow) : null;
  const board = await loadRank(client, { day, userId: user.id, limit: 10 });

  const titles = new Map(track.groups.map((group) => [group.id, group.title]));
  const topics = challenge.topics.map((id) => titles.get(id) ?? id);
  const open = run && !run.finishedAt;

  return (
    <AuthCard
      title="Daily challenge"
      lede={`${DAY_LABEL.format(new Date(`${day}T00:00:00Z`))} — the same ten screens for everyone, on your own clock.`}
    >
      {challenge.error ? <Notice>The challenge could not be drawn just now. Try again in a moment.</Notice> : null}
      {topics.length > 0 ? <p>{`Today's topics: ${topics.join(", ")}.`}</p> : null}
      <Attempt run={run} rank={board.myRank} />
      <Links
        items={
          run?.finishedAt
            ? [
                { href: "/leaderboard", label: "Today's board" },
                { href: "/learn", label: "Your drills" },
              ]
            : [{ href: "/daily/run", label: open ? "Finish today's run" : "Start today's run" }]
        }
      />
      <section className="auth-billing" aria-labelledby="board-challenge">
        <h2 id="board-challenge">Today&apos;s board</h2>
        {board.error ? <Notice>The board could not be loaded just now.</Notice> : null}
        <Board rows={board.rows} mine={board.myRank} />
      </section>
      <p>
        {`Fifteen minutes, no hints, one attempt. Ranked on accuracy first and time second, so a careful
        run beats a fast one that misses. The clock is the server's, and a screen's first answer is the
        one that counts — going back does not replace it.`}
      </p>
    </AuthCard>
  );
}

export default function DailyPage() {
  return (
    <AuthShell counter="Daily challenge" skipLabel="daily challenge">
      <Suspense fallback={<p className="auth-notice">Loading today&apos;s challenge…</p>}>
        <ChallengeScreen />
      </Suspense>
    </AuthShell>
  );
}
