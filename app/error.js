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
    // Next already reports the error in development; in production this is the only record until
    // logging lands (phase 9). The digest is the value a deploy log can be searched by.
    console.error("render error", error.digest ?? "", error);
  }, [error]);

  return (
    <>
      <a className="skip" href="#main">
        Skip to the drill
      </a>
      <header className="site">
        <a className="brand" href="/">
          <span className="brand-mark" aria-hidden="true">
            =
          </span>
          <span className="brand-name">Excel Supreme</span>
        </a>
        <p className="drill-count">Something broke</p>
        <p className="badge">Free · no signup</p>
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
          <a href="/">All drills</a> · <a href="/learn">Your progress</a>
        </p>
      </footer>
    </>
  );
}
