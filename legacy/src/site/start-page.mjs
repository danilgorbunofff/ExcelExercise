/**
 * `/start` — the ten free exercises, together, in the order they are meant to be worked through.
 *
 * The free set is curated and scattered through the track on purpose: a reader who can only see the
 * first three lessons of a catalogue can judge the beginning of a product, not the product. The cost of
 * that choice is that the free ten are not adjacent in the catalogue, and a new reader should not have
 * to hunt for them — so this page is the one place they are listed as a sequence, with a start button
 * on every row and nothing to sign up for. It is the page the pricing page calls "start with the free
 * ten", and the page the wall links to when a reader has run out of open exercises.
 *
 * Like `/pricing`, it is a singular page rather than a hub: one `<main>`, one list, one exit. It is
 * indexed, because "free Excel exercises" is a query this page genuinely answers.
 */

import { attrs, esc, inlineIcon } from "./html.mjs";
import { LEVELS } from "./content.mjs";
import { breadcrumbJsonLd, jsonLd } from "./seo.mjs";
import { renderDocument } from "./shell.mjs";

/** One row per free exercise: number, title, level, what it teaches, and the way in. */
function renderStartRow({ entry, icons }) {
  const number = String(entry.number).padStart(2, "0");
  const level = LEVELS[entry.exercise.level] ?? `Level ${entry.exercise.level}`;
  return `            <li class="lesson-row"${attrs({ "data-lesson": entry.exercise.id })}>
              <a class="lesson-link" href="${esc(entry.path)}">
                <span class="row-num" aria-hidden="true">${number}</span>
                <span class="row-body">
                  <span class="row-title">${esc(entry.exercise.title)}</span>
                  <span class="row-outcome">${esc(entry.exercise.docs.outcome)}</span>
                </span>
                <span class="row-meta">${esc(level)}${inlineIcon(icons["arrow-right"], { size: 14 })}</span>
              </a>
            </li>`;
}

/**
 * The order a reader should take the free ten in, which is `track.freeLessons`'s order rather than the
 * catalogue's: the list is authored from the easy ones outward, so a beginner meets six level-1
 * exercises before a level-3 closer, and someone who already knows SUM can skip straight down.
 */
function freeInTourOrder({ track, index }) {
  const byId = new Map(index.map((entry) => [entry.exercise.id, entry]));
  const ordered = track.freeLessons.map((id) => byId.get(id)).filter(Boolean);
  // A lesson listed as free but missing from the catalogue would be a content error the schema already
  // refuses; the fallback keeps this page from rendering a shorter promise than the one it makes.
  return ordered.length === track.freeLessons.length ? ordered : index.filter((entry) => entry.free);
}

/** The page as `<main>` plus its head metadata; see `preparePricingPage` for why the split exists. */
export function prepareStartPage({
  config,
  track,
  index,
  icons = {},
  projectsAvailable = false,
  appPagesAvailable = false,
}) {
  const free = freeInTourOrder({ track, index });
  const first = free[0] ?? index[0];
  const paid = index.length - free.length;
  const trail = [
    { href: "/", label: "Excel exercises" },
    { href: "/start", label: "Start here" },
  ];

  const body = `<main class="shell hub start" id="main">
      <div class="page-head">
        <p class="eyebrow">Free exercises</p>
        <h1>Start with these ten</h1>
        <p class="lede">Ten exercises from the track, free, in the order they are meant to be taken. Type a formula, press Check, and the page names the rule you missed. What you finish is kept in this browser, and signing in carries it to the others.</p>
        <p class="cta-row">
          <a class="btn btn-primary" href="${esc(first.path)}">Start exercise ${first.number}: ${esc(
            first.exercise.title,
          )}${inlineIcon(icons["arrow-right"], { size: 16 })}</a>
          <a class="btn" href="/pricing">Get full access</a>
        </p>
      </div>

      <section class="how" aria-labelledby="free-heading">
        <h2 id="free-heading">Take them in this order</h2>
        <ol class="lesson-list">
${free.map((entry) => renderStartRow({ entry, icons })).join("\n")}
        </ol>
      </section>

      <section class="how" aria-label="Full access to the whole course">
        <p class="cta-row"><a class="btn btn-primary btn-lg" href="/pricing">Get full access to the whole course</a></p>
        <p class="how-note">Full access opens the other ${paid} exercises, in the same one-task shape.</p>
      </section>

    </main>`;

  return {
    body,
    page: {
      path: "/start",
      title: "Start here: the ten free Excel exercises",
      description: `The ten free Excel exercises from the track, in the order to take them: SUM, COUNTIF, IF, VLOOKUP and a level-3 SUMIFS to finish. No account needed.`,
      bodyClass: "hub",
      skipLabel: "free exercises",
      jsonLd: jsonLd(breadcrumbJsonLd({ config, trail })),
    },
  };
}

export function renderStartPage(args) {
  const { body, page } = prepareStartPage(args);
  return renderDocument({
    config: args.config,
    page,
    body,
    icons: args.icons,
    projectsAvailable: args.projectsAvailable,
    appPagesAvailable: args.appPagesAvailable,
  });
}
