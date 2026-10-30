import { Suspense } from "react";

import { authConfig } from "../../lib/auth/config.js";
import { currentUser } from "../../lib/auth/server.js";
import { retentionFlags } from "../../lib/flags.js";
import { cachedBoards } from "../../lib/retention/leaderboard.js";
import { FALLBACK_TIMEZONE } from "../../lib/retention/points.js";
import { batchDay } from "../../lib/retention/write.js";
import { AuthCard, Links, Notice } from "../auth/ui.js";
import { AuthShell } from "../auth/shell.js";

export const metadata = {
  title: "Today's board",
  description: "The top three by points and by streak today, and where you are.",
  robots: { index: false, follow: false },
};

// Same reason as `/account`: a deployment without accounts configured skips the proxy, so the page
// checks for itself and says what is missing rather than rendering an empty board.
export const instant = false;

const DAY_LABEL = new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeZone: "UTC" });

/**
 * One board.
 *
 * It is a table because the two things a learner comes here for are a rank and a score, and a table is
 * what makes two columns of them comparable down the page. The own row is marked in the markup
 * (`aria-current`) as well as in colour, so "this is you" is not carried by colour alone. A flagged own
 * row has no rank and is filtered out of the table; the notice above says so instead.
 */
function Board({ id, title, unit, rows, mine }) {
  return (
    <section className="auth-billing" aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      {rows.length === 0 ? (
        <p>Nobody is on this board today yet. The first lesson of the day takes the top of it.</p>
      ) : (
        <table className="auth-table">
          <caption>{`Today's top ${rows.length} by ${unit}`}</caption>
          <thead>
            <tr>
              <th scope="col">Rank</th>
              <th scope="col">Learner</th>
              <th scope="col">{unit === "points" ? "Points" : "Streak"}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr aria-current={row.isMe ? "true" : undefined} key={`${row.rank}-${row.username}`}>
                <td>{row.rank}</td>
                <td>{row.username}</td>
                <td>{unit === "points" ? row.points : row.streak}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p>{mine === null ? "You are not on this board today." : `You are number ${mine} today.`}</p>
    </section>
  );
}

async function LeaderboardScreen() {
  // Points always; the streak board only while streaks are switched on. `cachedBoards` reads both in
  // one round trip either way — one query saved is not worth a second code path through the cache.
  const flags = retentionFlags();
  const config = authConfig();
  if (!config.enabled) {
    return (
      <AuthCard title="Today's board">
        <Notice>{config.reason}</Notice>
        <Links items={[{ href: "/learn", label: "Your drills" }]} />
      </AuthCard>
    );
  }

  const { supabase, user } = await currentUser();
  if (!user) {
    return (
      <AuthCard title="Today's board">
        <Notice>You are signed out.</Notice>
        <Links items={[{ href: "/login?next=%2Fleaderboard", label: "Sign in" }]} />
      </AuthCard>
    );
  }

  // The board is a calendar day, and whose calendar is the whole question: a learner in Auckland at
  // 11pm is still on their own day. `profiles` is self-read, so this is the same row the write path
  // reads — just through the session rather than the service key.
  const { data: profile } = await supabase.from("profiles").select("timezone").eq("id", user.id).maybeSingle();
  const day = batchDay(new Date(), profile?.timezone || FALLBACK_TIMEZONE);
  const boards = await cachedBoards(supabase, { day, userId: user.id });

  return (
    <AuthCard
      title="Today's board"
      lede={`${DAY_LABEL.format(new Date(`${day}T00:00:00Z`))}, counted on your own clock.`}
    >
      {boards.points.error || (flags.streaks && boards.streaks.error) ? (
        <Notice>The board could not be loaded just now. Try again in a moment.</Notice>
      ) : null}
      {boards.points.flagged ? (
        <Notice>
          Your points for today are held for review, so you are not ranked. Nothing has been deleted; a
          person will look at it.
        </Notice>
      ) : null}
      <Board
        id="board-points"
        mine={boards.points.myRank}
        rows={boards.points.rows.filter((row) => row.rank !== null)}
        title="Points today"
        unit="points"
      />
      {flags.streaks ? (
        <Board
          id="board-streaks"
          mine={boards.streaks.myRank}
          rows={boards.streaks.rows}
          title="Streaks"
          unit="streak"
        />
      ) : null}
      <p>
        A screen pays once a day and a day stops at 500 points.
        {flags.streaks
          ? " A streak counts a day on which you finished at least one lesson, and it survives a day off in your timezone."
          : null}
      </p>
      <Links
        items={[
          { href: "/learn", label: "Your drills" },
          { href: "/account", label: "Your account" },
        ]}
      />
    </AuthCard>
  );
}

export default function LeaderboardPage() {
  return (
    <AuthShell counter="Today's board">
      <Suspense fallback={<p className="auth-notice">Loading the board…</p>}>
        <LeaderboardScreen />
      </Suspense>
    </AuthShell>
  );
}
