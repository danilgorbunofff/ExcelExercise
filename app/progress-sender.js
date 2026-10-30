"use client";

import { useEffect } from "react";

import { createCollector } from "../lib/progress/sender.js";

/**
 * Sends the drill's event buffer to `POST /api/progress`, once per lesson, when the lesson ends or the
 * page goes away. It renders nothing: the drill owns the DOM and the buffer, this only reads them.
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

    const onEvent = (event) => {
      const lessonId = collector.add(event);
      if (lessonId) send(lessonId, false);
    };

    // Whatever the drill emitted before hydration is still in its buffer; the hook covers the rest.
    collector.seed(globalThis.__esEvents);
    globalThis.__esOnEvent = onEvent;

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
