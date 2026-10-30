"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { PROGRESS_KEY, parseProgress } from "../../legacy/src/client/state.js";
import {
  DECK_KEY,
  GRADES,
  completedLessons,
  deckStatus,
  gradeCard,
  parseDeck,
  previewDays,
  queue,
  serializeDeck,
} from "../../lib/retention/flashcards.js";

/**
 * The study loop.
 *
 * Nothing here decides what is complete. The lesson ids come from `es.progress` — the same store the
 * drill writes — plus, for an account, the lessons the server already knows are finished. Everything
 * else is presentation: flip, grade, persist, advance.
 *
 * The schedule lives in `es.flashcards`. It is read once on mount and written after every grade, so a
 * closed tab costs a card's schedule at most, and a browser in private mode (where the write throws)
 * still works — the session is just not remembered.
 */

/** Grades in the order the arrow keys run: left is the worst, right the best. */
const KEYS = { ArrowLeft: "again", ArrowDown: "hard", ArrowRight: "good", ArrowUp: "easy" };
const LABELS = { again: "Again", hard: "Hard", good: "Good", easy: "Easy" };
const HINTS = { again: "←", hard: "↓", good: "→", easy: "↑" };

function store() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function read(key) {
  try {
    return store()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    store()?.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function Grid({ grid }) {
  if (!grid || !Array.isArray(grid.rows)) return null;
  return (
    <table className="auth-table flashcard-grid">
      <caption>Sheet</caption>
      <tbody>
        {grid.rows.map((row, rowIndex) => (
          <tr key={rowIndex}>
            {row.map((cell, column) => (
              <td key={column}>{cell === null || cell === undefined ? "" : String(cell)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const lessonLabel = (card) =>
  card.lessonNumber === null || card.lessonNumber === undefined
    ? card.lessonTitle
    : `Lesson ${card.lessonNumber} · ${card.lessonTitle}`;

/** The days a grade would schedule, in words. `0` is "again this session", which reads better said. */
const daysLabel = (days) => (days === 0 ? "again" : days === 1 ? "1 day" : `${days} days`);

export function Deck({ serverIds = [] }) {
  const [state, setState] = useState({ phase: "loading", error: null });
  const [cards, setCards] = useState([]);
  const [schedules, setSchedules] = useState({});
  const [session, setSession] = useState([]);
  const [at, setAt] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const graders = useRef(null);

  const nextSession = useCallback((list, saved) => {
    const drawn = queue(list, saved, Date.now());
    setSession(drawn);
    setAt(0);
    setFlipped(false);
    setState({ phase: drawn.length > 0 ? "study" : "done", error: null });
    return drawn;
  }, []);

  useEffect(() => {
    let live = true;
    const local = completedLessons(parseProgress(read(PROGRESS_KEY)));
    const ids = [...new Set([...serverIds, ...local])];
    if (ids.length === 0) {
      setState({ phase: "empty", error: null });
      return () => {
        live = false;
      };
    }

    const saved = parseDeck(read(DECK_KEY)).cards;
    setSchedules(saved);

    const params = new URLSearchParams();
    for (const id of ids) params.append("id", id);
    fetch(`/api/flashcards?${params}`, { headers: { accept: "application/json" } })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!live) return;
        if (!response.ok || !payload?.ok) {
          setState({ phase: "error", error: payload?.error ?? `request failed (${response.status})` });
          return;
        }
        const drawn = Array.isArray(payload.cards) ? payload.cards : [];
        setCards(drawn);
        nextSession(drawn, saved);
      })
      .catch((error) => {
        if (live) setState({ phase: "error", error: String(error?.message ?? error) });
      });

    return () => {
      live = false;
    };
  }, [nextSession, serverIds]);

  const grade = useCallback(
    (what) => {
      const card = session[at];
      if (!card || !flipped) return;
      const updated = { ...schedules, [card.key]: gradeCard(schedules[card.key], what) };
      setSchedules(updated);
      write(DECK_KEY, serializeDeck({ cards: updated }));
      if (at + 1 >= session.length) {
        setFlipped(false);
        setAt(session.length);
        setState({ phase: "done", error: null });
        return;
      }
      setAt(at + 1);
      setFlipped(false);
    },
    [at, flipped, schedules, session],
  );

  useEffect(() => {
    const onKey = (event) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const tag = event.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (event.key === " " || event.key === "Enter") {
        if (state.phase !== "study") return;
        event.preventDefault();
        if (!flipped) setFlipped(true);
        return;
      }
      const what = KEYS[event.key];
      if (!what) return;
      if (state.phase !== "study" || !flipped) return;
      event.preventDefault();
      grade(what);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [flipped, grade, state.phase]);

  // Moving to the next card moves focus with it, so a keyboard learner is never left on a button that
  // has just been re-rendered away from.
  useEffect(() => {
    if (state.phase === "study") graders.current?.focus();
  }, [at, state.phase]);

  const status = deckStatus(cards, schedules, Date.now());
  const card = state.phase === "study" ? session[at] : null;

  if (state.phase === "loading") {
    return <p className="auth-notice">Shuffling your cards…</p>;
  }

  if (state.phase === "empty") {
    return (
      <>
        <p className="auth-notice">
          Flashcards come from lessons you have finished, and there are none in this browser yet.
        </p>
        <p>
          Finish a drill and its screens become cards: the question and the sheet on the front, the
          formula and one line of the lesson on the back.
        </p>
      </>
    );
  }

  if (state.phase === "error") {
    return (
      <p className="auth-error">{`Your cards could not be loaded just now (${state.error}). Try again in a moment.`}</p>
    );
  }

  if (state.phase === "done") {
    // A reload with nothing due is a valid done state with no session behind it, so it must not claim
    // to have gone through zero cards.
    const when =
      status.nextDue === null
        ? "Nothing is scheduled yet — finish a drill to add cards."
        : `The next card is due on ${new Date(status.nextDue).toLocaleDateString("en-GB", { dateStyle: "long" })}.`;
    return (
      <>
        <p className="auth-ok">
          {session.length === 0
            ? "Nothing is due right now."
            : `You went through ${session.length} ${session.length === 1 ? "card" : "cards"} this session.`}
        </p>
        <p>{when}</p>
        <div className="flashcard-actions">
          <button
            className="auth-submit"
            onClick={() => {
              nextSession(cards, schedules);
            }}
            type="button"
          >
            Check what is due
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <p className="auth-lede" aria-live="polite">
        {`Card ${at + 1} of ${session.length} · ${status.due} due · ${status.fresh} new · ${status.total} in the deck`}
      </p>
      <section className="flashcard" aria-labelledby="flashcard-front">
        <p className="flashcard-lesson">{lessonLabel(card)}</p>
        <h2 className="flashcard-prompt" id="flashcard-front">
          {card.prompt}
        </h2>
        <Grid grid={card.grid} />
        {card.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img alt={card.alt} className="flashcard-image" src={card.image} />
        ) : null}
        {flipped ? (
          <div className="flashcard-back">
            <h3>Answer</h3>
            <p>
              <code className="flashcard-answer">{card.answer}</code>
            </p>
            {card.explain ? <p>{card.explain}</p> : null}
          </div>
        ) : (
          <p className="flashcard-hint">Press space to turn the card over.</p>
        )}
      </section>
      <div className="flashcard-actions">
        {flipped ? (
          <>
            <p className="flashcard-hint" id="flashcard-grades">
              How did that feel? Left is the worse grade, right the better.
            </p>
            <div aria-labelledby="flashcard-grades" className="flashcard-grades" ref={graders} tabIndex={-1}>
              {GRADES.map((what) => (
                <button
                  className={what === "again" ? "flashcard-grade flashcard-grade-bad" : "flashcard-grade"}
                  key={what}
                  onClick={() => grade(what)}
                  type="button"
                >
                  {`${LABELS[what]} ${HINTS[what]}`}
                  <span>{daysLabel(previewDays(schedules[card.key], what))}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <button className="auth-submit" onClick={() => setFlipped(true)} type="button">
            Turn over
          </button>
        )}
      </div>
    </>
  );
}
