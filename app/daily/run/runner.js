"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The run itself: start, answer, verdict, next.
 *
 * Every question goes to `/api/daily`. The page holds no answer key, no expected value and no score of
 * its own — it receives a verdict and a reveal *after* the server has stored the answer for that screen,
 * which is the only reason a resubmitted screen cannot improve a run. The clock it shows is counting
 * down from the server's `leftMs`, so a laptop that slept for an hour does not buy an hour.
 *
 * A run with an open attempt resumes at the first unanswered screen; the server ignores a screen it has
 * already graded and answers with the verdict it kept, so a resumed run cannot be replayed for a better
 * score.
 */
function millis(ms) {
  const total = Math.max(0, Math.round(Number(ms ?? 0) / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

async function post(body) {
  const response = await fetch("/api/daily", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const reason = payload?.error ?? `request failed (${response.status})`;
    throw new Error(reason);
  }
  return payload;
}

function Grid({ grid }) {
  if (!grid || !Array.isArray(grid.rows)) return null;
  return (
    <table className="auth-table">
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

export function Runner() {
  const [state, setState] = useState({ phase: "loading", error: null });
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [verdict, setVerdict] = useState(null);
  const [pending, setPending] = useState(false);
  const [leftMs, setLeftMs] = useState(0);
  const deadline = useRef(0);
  const input = useRef(null);

  const start = useCallback(async () => {
    setPending(true);
    try {
      const payload = await post({ action: "start" });
      setLeftMs(payload.leftMs ?? 0);
      deadline.current = Date.now() + (payload.leftMs ?? 0);
      if (payload.finished) {
        setState({ phase: "done", score: payload, error: null });
        return;
      }
      setIndex(Math.min(payload.answered ?? 0, Math.max((payload.size ?? 1) - 1, 0)));
      setState({ phase: "run", payload, error: null });
    } catch (error) {
      setState({ phase: "error", error: error.message });
    } finally {
      setPending(false);
    }
  }, []);

  useEffect(() => {
    start();
  }, [start]);

  // One interval for the whole run, reading the deadline rather than decrementing a counter: a tab that
  // was throttled in the background still shows the truth when it wakes up.
  useEffect(() => {
    if (state.phase !== "run") return undefined;
    const tick = setInterval(() => {
      const remaining = Math.max(0, deadline.current - Date.now());
      setLeftMs(remaining);
      if (remaining === 0) clearInterval(tick);
    }, 1000);
    return () => clearInterval(tick);
  }, [state.phase]);

  useEffect(() => {
    if (state.phase === "run" && verdict === null) input.current?.focus();
  }, [state.phase, verdict, index]);

  const submit = useCallback(
    async (event) => {
      event?.preventDefault();
      if (state.phase !== "run" || verdict !== null || pending) return;
      const screen = state.payload.screens[index];
      if (!screen) return;
      setPending(true);
      try {
        const payload = await post({ action: "answer", screenId: screen.key, value: answer });
        setVerdict(payload);
        setLeftMs(payload.leftMs ?? 0);
        deadline.current = Date.now() + (payload.leftMs ?? 0);
      } catch (error) {
        setState({ ...state, phase: "error", error: error.message });
      } finally {
        setPending(false);
      }
    },
    [answer, index, pending, state, verdict],
  );

  const advance = useCallback(() => {
    if (!verdict) return;
    if (verdict.finished) {
      setState({ phase: "done", score: verdict, error: null });
      return;
    }
    setVerdict(null);
    setAnswer("");
    setIndex((current) => current + 1);
  }, [verdict]);

  if (state.phase === "loading") {
    return (
      <p className="auth-loading" role="status">
        Starting today&apos;s run…
      </p>
    );
  }

  if (state.phase === "error") {
    return (
      <>
        <p className="auth-error" role="alert">
          {`The run could not continue: ${state.error}.`}
        </p>
        <p>
          Nothing that was already answered has been lost — a screen&apos;s first answer stands whether
          or not the page survived.
        </p>
        <ul className="auth-links">
          <li>
            <a href="/daily">Back to today&apos;s challenge</a>
          </li>
        </ul>
      </>
    );
  }

  if (state.phase === "done") {
    const score = state.score ?? {};
    const percent = Math.round(Number(score.accuracy ?? 0) * 100);
    return (
      <>
        <p className="auth-ok" role="status">
          {`Finished: ${score.correct ?? 0} of ${score.size ?? 0} correct (${percent}%) in ${millis(score.ms ?? 0)}.`}
        </p>
        {score.timeUp ? <p>The clock ran out, so the run closed with the answers it had.</p> : null}
        <ul className="auth-links">
          <li>
            <a href="/daily">Today&apos;s board</a>
          </li>
        </ul>
      </>
    );
  }

  const screen = state.payload.screens[index];
  if (!screen) {
    return <p className="auth-notice">There is no screen left in this run.</p>;
  }

  const timeUp = leftMs === 0;

  return (
    <>
      <p className="auth-lede">
        {`Screen ${index + 1} of ${state.payload.size} · ${millis(leftMs)} left`}
      </p>
      <section className="auth-billing" aria-labelledby="daily-prompt">
        <h2 id="daily-prompt">{screen.lessonTitle}</h2>
        <p>{screen.prompt}</p>
        {screen.image ? <img src={screen.image} alt={screen.alt ?? ""} width={480} /> : null}
        <Grid grid={screen.grid} />
        {screen.answerCell ? <p>{`Answer in ${screen.answerCell}.`}</p> : null}
      </section>

      {verdict === null ? (
        <form className="auth-form" onSubmit={submit}>
          <label className="auth-field">
            <span>Your answer</span>
            <input
              ref={input}
              name="answer"
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              disabled={pending || timeUp}
            />
          </label>
          <button className="auth-submit" type="submit" disabled={pending || timeUp || answer.trim() === ""}>
            {pending ? "Checking…" : "Lock in"}
          </button>
        </form>
      ) : (
        <div className="auth-billing">
          <p className={verdict.verdict ? "auth-ok" : "auth-error"} role="status">
            {verdict.verdict ? "Correct." : verdict.message || "Not this time."}
          </p>
          {verdict.expected ? <p>{`The reference answer: ${verdict.expected}`}</p> : null}
          <p>
            {verdict.verdict
              ? "That screen is closed and counted."
              : "That answer is recorded — a screen's first answer is the one that counts."}
          </p>
          <button className="auth-submit" type="button" onClick={advance} autoFocus>
            {verdict.finished ? "See the score" : "Next screen"}
          </button>
        </div>
      )}

      {timeUp && verdict === null ? (
        <>
          <p className="auth-notice">Time is up. The run closes with the answers it already has.</p>
          <button className="auth-submit" type="button" onClick={start} disabled={pending}>
            See the score
          </button>
        </>
      ) : null}
    </>
  );
}
