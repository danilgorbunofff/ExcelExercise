/**
 * One lesson page. Server-rendered end to end: the sheet, the formula bar, the docs,
 * the rail and the pager all exist in the HTML. `#exercise-data` is the one thing the
 * phase-5 client reads, and it is a trimmed copy of the same exercise object.
 */

import { esc, inlineIcon, jsonScript } from "./html.mjs";
import { revealOf, screenAt } from "./packages.mjs";
import { breadcrumbJsonLd, clampDescription, groupPath, jsonLd, lessonTrail } from "./seo.mjs";
import { renderByline, renderDocument, renderRail } from "./shell.mjs";
import {
  renderDocs,
  renderFeedback,
  renderFormulaBar,
  renderHint,
  renderKeys,
  renderPicture,
  renderScreenDocs,
  renderSheet,
  renderWorkbook,
} from "./sheet.mjs";

/** One screen's share of the payload: exactly what the client grades and teaches with. */
export function screenPayload(exercise, screen, position) {
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

  if (screen.type === "workbook") {
    // The rows stay on the page: the learner reads the sheet in the preview or in the file, and the
    // client only ever grades the answers.
    return { ...common, answers: screen.answers, expect: screen.expect };
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
      // The order gate needs the whole order, not just where this drill sits in it: "the first drill you
      // have not finished" is a fact about the plan. Ids and titles only — the gate links by path.
      plan: index.map((item) => ({
        id: item.exercise.id,
        number: item.number,
        title: item.exercise.title,
        path: item.path,
      })),
      freeLessonCount: track.freeLessonCount,
      // The gate copy below names the shelf it is gating. A drill says "drill"; a project says
      // "project" rather than offering to unlock a drill that does not exist.
      noun: track.lessonNoun ?? "Drill",
      paidHalf: track.paidHalf,
      showAnswerAfter: track.showAnswerAfter,
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
    description: exercise.seo?.description ?? exercise.docs.outcome,
    teaches: exercise.docs.teaches,
    learningResourceType: "exercise",
    educationalLevel: entry.level,
    inLanguage: config.inLanguage,
    isAccessibleForFree: entry.free,
    url: `${config.baseUrl}${entry.path}`,
    dateModified: exercise.updated ?? config.builtAt,
    position: entry.number,
    isPartOf: {
      "@type": "Course",
      "@id": `${config.baseUrl}/#${track.id}`,
      name: track.title,
    },
  };
}

/**
 * Three drills that teach the same skill as this one, plus the first drill of the next group, so a
 * reader who finished has somewhere to go that is not "forward one". Picked by distance in the track,
 * which keeps a page's links to its neighbours instead of linking every lesson to every other one.
 */
function renderRelated({ entry, index, track }) {
  const others = index.filter((item) => item.group === entry.group && item.exercise.id !== entry.exercise.id);
  const near = others
    .slice()
    .sort((a, b) => Math.abs(a.number - entry.number) - Math.abs(b.number - entry.number))
    .slice(0, 3);

  const groups = track.groups ?? [];
  const nextGroup = groups[groups.findIndex((group) => group.id === entry.group) + 1] ?? null;
  const opener = nextGroup ? index.find((item) => item.group === nextGroup.id) ?? null : null;

  const links = [...near, opener].filter(Boolean);
  if (links.length === 0) return "";
  const groupName = (id) => groups.find((group) => group.id === id)?.title ?? "";

  return `<nav class="ways" aria-labelledby="related-heading">
          <h2 class="ways-title" id="related-heading">Related exercises</h2>
          <ul class="ways-list ways-list-links">
${links
  .map(
    (item) =>
      `            <li><a href="${esc(item.path)}">${esc(item.exercise.title)}</a> <span class="ways-note">${esc(
        groupName(item.group),
      )}</span></li>`,
  )
  .join("\n")}
          </ul>
        </nav>`;
}

/**
 * The way out of a lesson that is not "next": the group it belongs to. The pager walks the track; this
 * links the hub, which is the page that ranks for the skill and the page a reader who is done with one
 * VLOOKUP drill actually wants. Two links, at the end of the page, where the decision is.
 */
function renderGroupMore({ group, count }) {
  if (!group) return "";
  return `<nav class="ways" aria-labelledby="lesson-group-heading">
          <h2 class="ways-title" id="lesson-group-heading">More in ${esc(group.title)}</h2>
          <ul class="ways-list">
            <li><a href="${groupPath(group.id)}">All ${count} in this group</a></li>
            <li><a href="/excel-exercises">Every Excel exercise</a></li>
          </ul>
        </nav>`;
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
          : screen.type === "workbook"
            ? renderWorkbook(exercise, screen, { position })
            : screen.type === "chord" || screen.type === "sequence"
              ? renderKeys(screen, { position })
              : renderSheet(exercise, screen, { icons, id: `sheet-grid-${position}` });
      const shell =
        screen.type === "picture"
          ? "picture-body"
          : screen.type === "workbook"
            ? "workbook-body"
            : screen.type === "formula"
              ? "sheet"
              : "keys-body";
      return `
              <div data-screen="${position + 1}"${position === 0 ? "" : " hidden"}>
                <p class="task">${esc(screen.prompt)}</p>${renderScreenDocs(screen)}
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
 * owns a cell, a picture or workbook screen answers in words, and a shortcut screen in keys — with the
 * bar kept for the learner who would rather type the shortcut than press it.
 */
function answerNote(screen, count) {
  const position = count > 1 ? `<span id="screen-position">screen 1 of ${count} · </span>` : "";
  const target = `<code id="screen-answer-cell">${esc(screen.answerCell ?? "the bar")}</code>`;
  if (screen.type === "formula") return `Read-only data · ${position}answer in ${target}`;
  if (screen.type === "picture" || screen.type === "workbook") return `${position}answer in ${target}`;
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
 * The brief a project opens with. A drill is one task with its notes; a project is a sequence of tasks
 * over one file, so it needs the reading that says what the file is and what the work is before the
 * first task asks for a number. Authored as ordered sections, rendered as they were written.
 */
function renderBrief(brief) {
  if (!Array.isArray(brief) || brief.length === 0) return "";
  const items = brief
    .map(
      ({ heading, body }) => `
            <li><h3 class="brief-heading">${esc(heading)}</h3><p class="brief-body">${esc(body)}</p></li>`,
    )
    .join("");
  return `
          <section class="project-brief" aria-labelledby="brief-title">
            <h2 class="brief-title" id="brief-title">The brief</h2>
            <ol class="brief-steps">${items}</ol>
          </section>`;
}

/**
 * The page as two pieces — `<main>` markup and the head metadata for it — so a host that renders its
 * own `<head>` can reuse both. `renderExercisePage` below wraps them in a full document.
 */
export function prepareExercisePage({ config, track, index, entry, icons = {}, clientAvailable = false }) {
  const { exercise } = entry;
  const screen = screenAt(exercise);
  const screens = exercise.screens;
  // A project is the same player on a different shelf: what changes is the noun in the counter and the
  // name of the track above it. Both default to the drill's words, so lesson markup is byte-identical.
  const counter = `${track.lessonNoun ?? "Drill"} ${entry.number} of ${index.length}`;
  // The description is authored per lesson (`seo.description`) because a search result is a different
  // sentence from the lede; the outcome is the fallback, clamped so a long one cannot get cut mid-word.
  const description = clampDescription(exercise.seo?.description ?? exercise.docs.outcome);
  const group = entry.group ? track.groups.find((candidate) => candidate.id === entry.group) ?? null : null;
  const groupCount = group ? index.filter((item) => item.group === group.id).length : 0;

  const body = `<main class="shell" id="main">
      <div class="page-head">
        <p class="eyebrow">${esc(track.eyebrow ?? "Excel track")} · ${esc(counter)}${
          entry.free ? "" : ' <span class="chip chip-trial">Trial</span>'
        }</p>
        <h1>${esc(exercise.title)}</h1>
        <p class="lede">${esc(exercise.docs.outcome)}</p>
        ${renderByline({
          config,
          index,
          updated: exercise.updated ?? config.builtAt,
          extra: `<span class="chip chip-level">${esc(entry.level)}</span>`,
          noun: track.lessonNoun ? `${track.lessonNoun.toLowerCase()}s` : undefined,
        })}
      </div>

      <div class="layout">
        <div class="col-main">${renderBrief(entry.brief)}
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

          ${renderRelated({ entry, index, track })}

          ${renderGroupMore({ group, count: groupCount })}
        </div>

        ${renderRail({ index, currentSlug: entry.slug, icons })}
      </div>
    </main>${clientAvailable ? '\n  <script type="module" src="/assets/client/drill.js"></script>' : ""}`;

  return {
    body,
    page: {
      path: entry.path,
      title: exercise.seo?.title ?? exercise.title,
      description,
      counter,
      isHome: false,
      bodyClass: "lesson",
      updated: exercise.updated ?? config.builtAt,
      jsonLd: jsonLd(
        lessonJsonLd({ config, track, entry }),
        breadcrumbJsonLd({ config, trail: lessonTrail({ entry, group }) }),
      ),
    },
  };
}

export function renderExercisePage(args) {
  const { body, page } = prepareExercisePage(args);
  return renderDocument({ config: args.config, page, body, icons: args.icons });
}
