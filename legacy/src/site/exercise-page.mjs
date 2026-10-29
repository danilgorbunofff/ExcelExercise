/**
 * One lesson page. Server-rendered end to end: the sheet, the formula bar, the docs,
 * the rail and the pager all exist in the HTML. `#exercise-data` is the one thing the
 * phase-5 client reads, and it is a trimmed copy of the same exercise object.
 */

import { esc, inlineIcon, jsonScript } from "./html.mjs";
import { revealOf, screenAt } from "./packages.mjs";
import { renderByline, renderDocument, renderRail } from "./shell.mjs";
import { renderDocs, renderFeedback, renderFormulaBar, renderHint, renderKeys, renderPicture, renderSheet } from "./sheet.mjs";

/** One screen's share of the payload: exactly what the client grades and teaches with. */
function screenPayload(exercise, screen, position) {
  const common = {
    position,
    id: screen.id,
    type: screen.type,
    prompt: screen.prompt,
    reference: revealOf(exercise, screen),
    hints: screen.hints,
  };

  if (screen.type === "picture") {
    return { ...common, image: screen.image, alt: screen.alt, answers: screen.answers, expect: screen.expect };
  }

  if (screen.type === "chord" || screen.type === "sequence") {
    // The keys travel as written, so the client can grade a press against them and print the labels
    // this keyboard uses — `reference` is the same shortcut already spoken in words.
    const field = screen.type === "chord" ? "keys" : "steps";
    return { ...common, [field]: screen[field], expect: screen.expect };
  }

  return {
    ...common,
    answerCell: screen.answerCell,
    grid: screen.grid,
    expect: screen.expect,
    require: screen.require,
    forbid: screen.forbid,
    requireRef: screen.requireRef,
    rules: screen.rules,
  };
}

/** What the client needs to grade and teach, and nothing it would only duplicate. */
function exercisePayload({ config, track, index, entry }) {
  const { exercise } = entry;
  return {
    id: exercise.id,
    slug: exercise.slug,
    level: exercise.level,
    title: exercise.title,
    screens: exercise.screens.map(screenPayload.bind(null, exercise)),
    docs: {
      syntax: exercise.docs.syntax,
      reference: exercise.docs.reference,
      teaches: exercise.docs.teaches,
      dataset: exercise.docs.dataset,
      outcome: exercise.docs.outcome,
    },
    track: {
      name: config.name,
      title: track.title,
      total: index.length,
      number: entry.number,
      free: entry.free,
      freeLessonCount: track.freeLessonCount,
      nextPath: entry.nextPath,
      nextTitle: entry.next ? entry.next.title : null,
    },
  };
}

function lessonJsonLd({ config, track, entry }) {
  const { exercise } = entry;
  return {
    "@context": "https://schema.org",
    "@type": "LearningResource",
    "@id": `${config.baseUrl}${entry.path}#drill`,
    name: exercise.title,
    description: exercise.docs.outcome,
    teaches: exercise.docs.teaches,
    learningResourceType: "exercise",
    educationalLevel: entry.level,
    inLanguage: config.inLanguage,
    isAccessibleForFree: entry.free,
    url: `${config.baseUrl}${entry.path}`,
    position: entry.number,
    isPartOf: {
      "@type": "Course",
      "@id": `${config.baseUrl}/#${track.id}`,
      name: track.title,
    },
  };
}

/**
 * Every screen of the lesson, server-rendered. Only the first is visible, so the page is complete
 * without JavaScript — a reader without it can still see what the whole lesson asks — and the client
 * only toggles `hidden` as the score loop moves.
 */
function renderScreens(exercise, { icons }) {
  return `<div id="drill-screens">${exercise.screens
    .map((screen, position) => {
      const body =
        screen.type === "picture"
          ? renderPicture(screen, { position })
          : screen.type === "chord" || screen.type === "sequence"
            ? renderKeys(screen, { position })
            : renderSheet(exercise, screen, { icons, id: `sheet-grid-${position}` });
      const shell = screen.type === "picture" ? "picture-body" : screen.type === "formula" ? "sheet" : "keys-body";
      return `
              <div data-screen="${position + 1}"${position === 0 ? "" : " hidden"}>
                <p class="task">${esc(screen.prompt)}</p>
                <div class="${shell}" id="sheet-${position}">
                  ${body}
                </div>
              </div>`;
    })
    .join("")}
            </div>`;
}

/**
 * The line under the sheet's name: what the screen is, and where its answer goes. A formula screen
 * owns a cell, a picture screen answers in words, and a shortcut screen in keys — with the bar kept
 * for the learner who would rather type the shortcut than press it.
 */
function answerNote(screen, count) {
  const position = count > 1 ? `<span id="screen-position">screen 1 of ${count} · </span>` : "";
  const target = `<code id="screen-answer-cell">${esc(screen.answerCell ?? "the bar")}</code>`;
  if (screen.type === "formula") return `Read-only data · ${position}answer in ${target}`;
  if (screen.type === "picture") return `${position}answer in ${target}`;
  return `${position}answer with <code id="screen-answer-cell">the keys</code>, or type it in the bar`;
}

function renderPager({ entry, icons }) {
  const back = `<a class="pager-link pager-prev" href="${esc(entry.prevPath)}" rel="prev">
            ${inlineIcon(icons["arrow-right"], { size: 14, className: "icon flip" })}<span class="pager-label">${
              entry.prev ? "Previous" : "Back to"
            }</span><span class="pager-title">${esc(entry.prevLabel)}</span>
          </a>`;
  const forward = entry.next
    ? `<a class="pager-link pager-next" href="${esc(entry.nextPath)}" rel="next">
            <span class="pager-label">Next</span><span class="pager-title">${esc(
              entry.next.title,
            )}</span>${inlineIcon(icons["arrow-right"], { size: 14 })}
          </a>`
    : `<a class="pager-link pager-next" href="/">
            <span class="pager-label">End of the track</span><span class="pager-title">Back to all drills</span>${inlineIcon(
              icons["arrow-right"],
              { size: 14 },
            )}
          </a>`;

  return `<nav class="pager" aria-label="Lesson navigation">
          ${back}
          ${forward}
        </nav>`;
}

/**
 * The page as two pieces — `<main>` markup and the head metadata for it — so a host that renders its
 * own `<head>` can reuse both. `renderExercisePage` below wraps them in a full document.
 */
export function prepareExercisePage({ config, track, index, entry, icons = {}, clientAvailable = false }) {
  const { exercise } = entry;
  const screen = screenAt(exercise);
  const screens = exercise.screens;
  const counter = `Drill ${entry.number} of ${index.length}`;
  const description =
    exercise.docs.outcome.length <= 155 ? exercise.docs.outcome : `${exercise.docs.outcome.slice(0, 152)}…`;

  const body = `<main class="shell" id="main">
      <div class="page-head">
        <p class="eyebrow">Excel track · ${esc(counter)}${
          entry.free ? "" : ' <span class="chip chip-trial">Trial</span>'
        }</p>
        <h1>${esc(exercise.title)}</h1>
        <p class="lede">${esc(exercise.docs.outcome)}</p>
        ${renderByline({ config, index, extra: `<span class="chip chip-level">${esc(entry.level)}</span>` })}
      </div>

      <div class="layout">
        <div class="col-main">
          <section class="sheet-card" id="drill" aria-labelledby="drill-heading">
            <div class="sheet-head">
              <h2 class="sheet-name" id="drill-heading">${esc(exercise.docs.dataset)}</h2>
              <p class="sheet-note">${answerNote(screen, screens.length)}</p>
            </div>
            ${renderScreens(exercise, { icons })}
            ${renderFormulaBar(screen, { icons })}
            ${renderFeedback()}
            ${renderHint({ icons })}
            <noscript>
              <p class="noscript-note">Checking needs JavaScript. The sheet and the notes are readable without it.</p>
            </noscript>
            <script type="application/json" id="exercise-data">${jsonScript(
              exercisePayload({ config, track, index, entry }),
            )}</script>
          </section>

          ${renderDocs(exercise, screen)}

          ${renderPager({ entry, icons })}
        </div>

        ${renderRail({ index, currentSlug: entry.slug, icons })}
      </div>
    </main>${clientAvailable ? '\n  <script type="module" src="/assets/client/drill.js"></script>' : ""}`;

  return {
    body,
    page: {
      path: entry.path,
      title: exercise.title,
      description,
      counter,
      isHome: false,
      bodyClass: "lesson",
      jsonLd: jsonScript(lessonJsonLd({ config, track, entry })),
    },
  };
}

export function renderExercisePage(args) {
  const { body, page } = prepareExercisePage(args);
  return renderDocument({ config: args.config, page, body, icons: args.icons });
}
