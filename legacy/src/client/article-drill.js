/**
 * The note's drill island. The lesson client owns a whole track — screens, progress, rail, trial
 * gating — and none of that belongs on an article: a note links to one exercise and asks for one
 * answer. So this is a separate module with its own ids, and it borrows only the grader.
 */

import { grade, gradeAnswer } from "../grader/index.js";

const form = document.getElementById("article-drill-form");
const data = document.getElementById("article-data");

if (form && data) {
  start();

  function start() {
    let payload;
    try {
      payload = JSON.parse(data.textContent);
    } catch {
      return;
    }
    const screen = payload?.screen;
    if (!screen) return;

    const input = form.querySelector("#article-answer");
    const feedback = document.getElementById("article-feedback");
    const hintButton = document.getElementById("article-hint");
    const hintText = document.getElementById("article-hint-text");
    let attempts = 0;
    let solved = false;

    const say = (text, tone) => {
      feedback.textContent = text;
      feedback.dataset.tone = tone;
    };

    const announce = (verdict) => {
      document.dispatchEvent(new CustomEvent("article-drill:check", { detail: verdict }));
    };

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (solved) return;
      const raw = input.value.trim();
      if (!raw) {
        say("Type a formula first.", "warn");
        input.focus();
        return;
      }

      attempts += 1;
      const verdict =
        screen.type === "picture" || screen.type === "workbook" ? gradeAnswer(screen, raw) : grade(screen, raw);
      const message = String(verdict.message ?? "");

      if (verdict.ok) {
        solved = true;
        input.readOnly = true;
        form.querySelector('button[type="submit"]').disabled = true;
        say("Correct. The whole drill has more screens: open it from the link below.", "ok");
      } else {
        say(message || "Not yet. Check the references and try again.", "err");
        // A syntax error names a position in the string; nothing useful to hint at beyond the message.
        if (attempts >= 2 && hintText) {
          hintText.hidden = false;
          hintButton?.setAttribute("aria-expanded", "true");
        }
      }

      announce({ slug: payload.slug, ok: Boolean(verdict.ok), rule: verdict.rule ?? null, attempts });
    });

    hintButton?.addEventListener("click", () => {
      if (!hintText) return;
      const open = hintText.hidden;
      hintText.hidden = !open;
      hintButton.setAttribute("aria-expanded", String(open));
      hintButton.textContent = open ? "Hide the hint" : "Show a hint";
      document.dispatchEvent(new CustomEvent("article-drill:hint", { detail: { slug: payload.slug, attempts } }));
    });

    input.addEventListener("input", () => {
      if (solved) return;
      if (feedback.dataset.tone === "err") say("", "idle");
    });
  }
}
