import { Suspense } from "react";

import { authConfig } from "../../lib/auth/config.js";
import { currentUser } from "../../lib/auth/server.js";
import { flagCopy, flagEnabled } from "../../lib/flags.js";
import { AuthShell } from "../auth/shell.js";
import { AuthCard, Links, Notice } from "../auth/ui.js";
import { Deck } from "./deck.js";
import "./flashcards.css";

export const metadata = {
  title: "Flashcards",
  description: "The screens you have finished, one card at a time: the question and sheet in front, the formula behind.",
  robots: { index: false, follow: false },
};

// The card list is per-learner, so the page cannot be prerendered with a body that means anything.
export const instant = false;

/** How many finished lessons an account can contribute; the deck caps the cards themselves. */
const MAX_LESSONS = 50;

/**
 * What the server knows is finished.
 *
 * `lesson_progress` is self-read under RLS, so this is the learner's own row and nothing else. A
 * deployment without accounts, or a signed-out browser, contributes nothing here — the deck then relies
 * on `es.progress`, which is where the drill records a finished lesson for anyone.
 */
async function finishedLessons() {
  if (!authConfig().enabled) return { ids: [], note: "Accounts are off here, so your cards come from this browser only." };
  const { supabase, user } = await currentUser();
  if (!user) return { ids: [], note: null };
  const { data, error } = await supabase
    .from("lesson_progress")
    .select("lesson_id")
    .eq("status", "complete")
    .limit(MAX_LESSONS);
  if (error) return { ids: [], note: "Finished lessons could not be read just now; your browser's own record still counts." };
  return { ids: (data ?? []).map((row) => row.lesson_id).filter((id) => typeof id === "string"), note: null };
}

async function FlashcardsScreen() {
  // A switched-off surface answers the same way signed in or out, and before any read: there is no
  // deck to build, so nothing is looked up.
  if (!flagEnabled("flashcards")) {
    return (
      <AuthCard title="Flashcards">
        <Notice>{flagCopy("flashcards")}</Notice>
        <Links items={[{ href: "/learn", label: "Your drills" }]} />
      </AuthCard>
    );
  }

  const { ids, note } = await finishedLessons();
  return (
    <AuthCard
      title="Flashcards"
      lede="One screen at a time, from the lessons you have finished. Space turns a card over; the arrow keys grade it."
    >
      {note ? <Notice>{note}</Notice> : null}
      <Deck serverIds={ids} />
      <p>
        A card you grade <em>again</em> comes back at the start of your next session. A card you know
        moves further out each time — a day, three days, then longer — and the schedule is kept in this
        browser.
      </p>
      <Links items={[{ href: "/learn", label: "Your drills" }]} />
    </AuthCard>
  );
}

export default function FlashcardsPage() {
  return (
    <AuthShell counter="Flashcards" skipLabel="flashcards">
      <Suspense fallback={<p className="auth-notice">Shuffling your cards…</p>}>
        <FlashcardsScreen />
      </Suspense>
    </AuthShell>
  );
}
