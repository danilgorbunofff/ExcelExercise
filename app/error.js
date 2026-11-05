"use client";

import { useEffect } from "react";

/**
 * The render-error boundary. A client component by requirement, so it cannot reuse the server
 * fragments: it renders the same chrome by class name instead, and offers the two things a reader
 * can act on — retry the render, or leave for the track.
 *
 * The brand name is written out rather than read from `siteConfig()` on purpose: a boundary that can
 * throw because configuration is broken is not a boundary.
 */
export default function Error({ error, reset }) {
  useEffect(() => {
    // Two records, on purpose. The console line is what a developer sees in the browser; the POST is
    // what survives it — `app/api/report-error` turns these fields into the same sanitized record the
    // server writes, and forwards it if a sink is configured. `keepalive` because the reader may hit
    // "Try again" or navigate before the request leaves. A failed report is swallowed: a boundary that
    // has to handle a failed report is a second bug.
    console.error("render error", error.digest ?? "", error);
    try {
      fetch("/api/report-error", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: typeof error.message === "string" ? error.message.slice(0, 200) : "",
          digest: typeof error.digest === "string" ? error.digest : undefined,
          path: window.location.pathname,
        }),
        keepalive: true,
      }).catch(() => {});
    } catch {
      // Nothing to do: the console line above is already the fallback.
    }
  }, [error]);

  return (
    <>
      <a className="skip" href="#main">
        Skip to the exercise
      </a>
      <header className="site">
        <a className="brand" href="/">
          <span className="brand-mark" aria-hidden="true">
            =
          </span>
          <span className="brand-name">Excel Supreme</span>
        </a>
        <div className="head-actions">
          <a className="head-link" href="/search">
            <svg
              className="icon icon-head"
              viewBox="0 0 256 256"
              width="16"
              height="16"
              fill="currentColor"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M229.66,218.34l-50.07-50.06a88.11,88.11,0,1,0-11.31,11.31l50.06,50.07a8,8,0,0,0,11.32-11.32ZM40,112a72,72,0,1,1,72,72A72.08,72.08,0,0,1,40,112Z" />
            </svg>
            Search
          </a>
        </div>
      </header>

      <main className="shell" id="main">
        <div className="page-head">
          <p className="eyebrow">Error</p>
          <h1>This page could not load</h1>
          <p className="lede">
            The page hit an error it could not recover from. Whatever you typed was graded in your own
            browser, so nothing was lost and nothing was sent anywhere.
          </p>
        </div>

        <p className="cta-row">
          <button className="btn btn-primary" type="button" onClick={() => reset()}>
            Try again
          </button>{" "}
          <a className="btn" href="/">
            Back to the track
          </a>
        </p>
        {error.digest ? <p className="gate-note">Reference: {error.digest}</p> : null}
      </main>

      <footer className="foot">
        <p>Excel Supreme grades formulas in the browser. Nothing you type is sent anywhere.</p>
        <p>
          <a href="/">All exercises</a> · <a href="/learn">Your progress</a>
        </p>
      </footer>
    </>
  );
}
