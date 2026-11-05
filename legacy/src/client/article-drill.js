/**
 * The note's exercise islands. The lesson client owns a whole track — screens, progress, rail, wall
 * gating — and none of that belongs on an article: a note links to its exercises and asks for one answer
 * per island. So this is a separate module with no fixed ids, and it borrows only the grader.
 *
 * Every island is its own form with its own payload, and each one is wired from its own form. A note
 * with five exercises has five answers; one shared handler reading one shared id would grade four of them
 * against the wrong screen and call the fifth correct whatever was typed.
 */

import { funnel } from "./funnel.js";
import { grade, gradeAnswer } from "../grader/index.js";

const ISLAND = "form.article-drill-form";

function payloadOf(form) {
  const data = form.closest("section.article-drill")?.querySelector('script[type="application/json"]');
  if (!data) return null;
  try {
    return JSON.parse(data.textContent);
  } catch {
    return null;
  }
}

function start(form) {
  const payload = payloadOf(form);
  const screen = payload?.screen;
  if (!screen) return;

  const island = form.closest("section.article-drill");
  const input = form.querySelector('input[name="answer"]');
  const submit = form.querySelector('button[type="submit"]');
  const feedback = island.querySelector(".article-drill-feedback");
  const hintButton = island.querySelector(".article-drill-actions button[type='button']");
  const hintText = island.querySelector(".article-hint");
  // From the third island on, the answer itself is withheld until the reader has missed twice: the
  // first two islands teach the shape of the formula, the rest are the practice.
  const withheld = island.querySelector(".article-drill-solution[data-reveal]");
  const revealAfter = Number(withheld?.dataset.reveal ?? 0);
  let attempts = 0;
  let solved = false;

  const say = (text, tone) => {
    feedback.textContent = text;
    feedback.dataset.tone = tone;
  };

  const announce = (verdict) => {
    document.dispatchEvent(
      new CustomEvent("article-drill:check", {
        detail: { ...verdict, drill: Number(form.dataset.drill ?? 1) },
      }),
    );
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
    if (attempts === 1) funnel("drill_started");
    const verdict =
      screen.type === "picture" || screen.type === "workbook" ? gradeAnswer(screen, raw) : grade(screen, raw);
    const message = String(verdict.message ?? "");

    if (verdict.ok) {
      funnel("drill_completed", { attempts });
      solved = true;
      input.readOnly = true;
      submit.disabled = true;
      if (withheld) withheld.hidden = false;
      say("Correct. The whole exercise has more screens: open it from the link below.", "ok");
    } else {
      say(message || "Not yet. Check the references and try again.", "err");
      // A syntax error names a position in the string; nothing useful to hint at beyond the message.
      if (attempts >= 2 && hintText) {
        hintText.hidden = false;
        hintButton?.setAttribute("aria-expanded", "true");
      }
      if (withheld && attempts >= revealAfter) withheld.hidden = false;
    }

    announce({ slug: payload.slug, path: payload.path, ok: Boolean(verdict.ok), rule: verdict.rule ?? null, attempts });
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
    if (attempts === 0) funnel("drill_started");
    if (feedback.dataset.tone === "err") say("", "idle");
  });
}

for (const form of document.querySelectorAll(ISLAND)) start(form);
