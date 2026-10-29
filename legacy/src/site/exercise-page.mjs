/**
 * One lesson page. Server-rendered end to end: the sheet, the formula bar, the docs,
 * the rail and the pager all exist in the HTML. `#exercise-data` is the one thing the
 * phase-5 client reads, and it is a trimmed copy of the same exercise object.
 */

import { esc, inlineIcon, jsonScript } from "./html.mjs";
import { renderByline, renderDocument, renderRail } from "./shell.mjs";
import { renderDocs, renderFeedback, renderFormulaBar, renderHint, renderSheet } from "./sheet.mjs";

/** What the client needs to grade and teach, and nothing it would only duplicate. */
function exercisePayload({ config, track, index, entry }) {
  const { exercise } = entry;
  return {
    id: exercise.id,
    slug: exercise.slug,
    level: exercise.level,
    title: exercise.title,
    prompt: exercise.prompt,
    answerCell: exercise.answerCell,
    grid: exercise.grid,
    expect: exercise.expect,
    require: exercise.require,
    forbid: exercise.forbid,
    requireRef: exercise.requireRef,
    rules: exercise.rules,
    hints: exercise.hints,
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

export function renderExercisePage({ config, track, index, entry, icons = {}, clientAvailable = false }) {
  const { exercise } = entry;
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
              <p class="sheet-note">Read-only data · answer in <code>${esc(exercise.answerCell)}</code></p>
            </div>
            <p class="task">${esc(exercise.prompt)}</p>
            <div class="sheet" id="sheet">
              ${renderSheet(exercise, { icons })}
            </div>
            ${renderFormulaBar(exercise, { icons })}
            ${renderFeedback()}
            ${renderHint({ icons })}
            <noscript>
              <p class="noscript-note">Checking needs JavaScript. The sheet and the notes are readable without it.</p>
            </noscript>
            <script type="application/json" id="exercise-data">${jsonScript(
              exercisePayload({ config, track, index, entry }),
            )}</script>
          </section>

          ${renderDocs(exercise)}

          ${renderPager({ entry, icons })}
        </div>

        ${renderRail({ index, currentSlug: entry.slug, icons })}
      </div>
    </main>${clientAvailable ? '\n  <script type="module" src="/assets/client/drill.js"></script>' : ""}`;

  return renderDocument({
    config,
    icons,
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
  });
}
