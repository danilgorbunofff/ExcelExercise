"use client";

import { useEffect } from "react";

import { PROGRESS_KEY } from "../legacy/src/client/state.js";
import { localLessons } from "../lib/progress/migrate.js";
import { createCollector } from "../lib/progress/sender.js";

/**
 * Sends the drill's event buffer to `POST /api/progress`, once per lesson, when the lesson ends or the
 * page goes away, and hands over whatever a signed-out browser had kept in `es.progress`. It renders
 * nothing: the drill owns the DOM and the buffer, this only reads them.
 *
 * A deployment without accounts answers `503 progress_sync_unconfigured`; that is a configuration, not
 * a failure to retry, so the first refusal stops the sender for the life of the page.
 */
export default function ProgressSender() {
  useEffect(() => {
    const crypto = globalThis.crypto;
    if (typeof crypto?.randomUUID !== "function") return; // no idempotency key, so no batch
    if (typeof globalThis.fetch !== "function") return;

    const collector = createCollector();
    let stopped = false;
    // One owner per page: a second mount would seed from the same buffer and re-send what the first
    // already sent, under a fresh batch id — a replay the server cannot recognise as one.
    if (typeof globalThis.__esOnEvent === "function") return;

    const send = (lessonId, keepalive) => {
      if (stopped) return;
      const events = collector.take(lessonId);
      if (events.length === 0) return;
      fetch("/api/progress", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        keepalive,
        body: JSON.stringify({ batch_id: crypto.randomUUID(), events }),
      })
        .then((response) => {
          if (response.ok || response.status === 409) return; // written, or a batch id already used
          if (response.status === 401 || response.status === 403 || response.status === 503) {
            stopped = true;
            return;
          }
          collector.restore(lessonId, events); // 400/500: the events stay for the next flush
        })
        .catch(() => collector.restore(lessonId, events));
    };

    // The signed-out roll-up: one attempt per page load, and only while the marker says it is unsent.
    // A refusal leaves the marker alone, so the next page load asks again; a success is final.
    const migrate = () => {
      let record = null;
      let sent = false;
      try {
        record = globalThis.localStorage?.getItem(PROGRESS_KEY) ?? null;
        sent = globalThis.localStorage?.getItem(`${PROGRESS_KEY}.migrated`) === "1";
      } catch {
        return; // storage blocked in this browser: nothing was kept, so nothing to migrate
      }
      if (!record || sent) return;
      let parsed;
      try {
        parsed = JSON.parse(record);
      } catch {
        return; // a corrupt record is not a migration, and rewriting it would destroy evidence
      }
      const local = localLessons(parsed);
      if (!local.ok || local.lessons.length === 0) return;
      fetch("/api/progress", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ batch_id: crypto.randomUUID(), lessons: local.lessons }),
      })
        .then((response) => {
          if (!response.ok) return; // signed out or unconfigured: try again on the next page load
          try {
            globalThis.localStorage?.setItem(`${PROGRESS_KEY}.migrated`, "1");
          } catch {
            // storage is read-only here; the server has the data, and the merge is idempotent anyway
          }
        })
        .catch(() => {});
    };

    const onEvent = (event) => {
      const lessonId = collector.add(event);
      if (lessonId) send(lessonId, false);
    };

    // Whatever the drill emitted before hydration is still in its buffer; the hook covers the rest.
    collector.seed(globalThis.__esEvents);
    globalThis.__esOnEvent = onEvent;
    migrate();

    const flushAll = (keepalive) => {
      for (const lessonId of collector.lessons()) send(lessonId, keepalive);
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") flushAll(true);
    };
    const onPageHide = () => flushAll(true);

    document.addEventListener("visibilitychange", onHide);
    globalThis.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      globalThis.removeEventListener("pagehide", onPageHide);
      if (globalThis.__esOnEvent === onEvent) delete globalThis.__esOnEvent;
    };
  }, []);

  return null;
}
