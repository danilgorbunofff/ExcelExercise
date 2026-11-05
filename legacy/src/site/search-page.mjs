/**
 * `/search`: the page a learner reaches when they know the job but not the exercise's name.
 *
 * The index is written into the page rather than fetched: it is one request the page does not make,
 * it works on a static host, and it works with the network off once the page is open. The list at the
 * bottom is the whole track, so the page is still an index when the script does not run.
 */

import { buildSearchIndex, serializeIndex } from "./search.mjs";
import { esc, jsonScript } from "./html.mjs";
import { dashboardGroups } from "./dashboard-page.mjs";
import { breadcrumbJsonLd, jsonLd, renderBreadcrumbs } from "./seo.mjs";
import { renderDocument } from "./shell.mjs";

/**
 * The list the page shows before anything is typed: every exercise in track order, in its group. It is
 * the fallback for a browser with no JavaScript, and the honest answer to "show me everything".
 */
function renderEverything({ track, index }) {
  const sections = dashboardGroups({ track, index })
    .map(
      (group) => `        <li class="search-group">
          <h3><a href="/learn/groups/${esc(group.id)}">${esc(group.title)}</a></h3>
          <ol class="search-titles">
${group.entries
  .map(
    (entry) =>
      `            <li><a href="${esc(entry.path)}">${esc(entry.exercise.title)}</a>${
        entry.free ? "" : ' <span class="search-gated">paid</span>'
      }</li>`,
  )
  .join("\n")}
          </ol>
        </li>`,
    )
    .join("\n");
  return `      <section aria-labelledby="all-heading" id="search-all">
        <h2 id="all-heading">Every exercise, in order</h2>
        <p>All ${esc(index.length)} exercises, grouped by the skill they teach. Searching narrows this; it does not replace it.</p>
        <ol class="search-everything">
${sections}
        </ol>
      </section>`;
}

export function prepareSearchPage({
  config,
  track,
  index,
  articles = [],
  formulas = [],
  shortcuts = [],
  appPagesAvailable = false,
}) {
  const trail = [
    { href: "/", label: "Excel exercises" },
    { href: "/search", label: "Search" },
  ];
  const rows = serializeIndex(buildSearchIndex({ index, articles, formulas, shortcuts, groups: track.groups }));

  const body = `<main class="shell hub search" id="main">
      ${renderBreadcrumbs({ trail })}

      <div class="page-head">
        <p class="eyebrow">Search</p>
        <h1>Find the exercise</h1>
        <p class="lede">Type what you are trying to do ("remove duplicates", "days between dates", "sum one region") and the exercise that teaches it comes up. No results means no exercise covers it yet, which is worth knowing too.</p>
      </div>

      <form class="search-form" action="/search" method="get" role="search">
        <label class="visually-hidden" for="search-input">Search the exercises</label>
        <input
          id="search-input"
          name="q"
          type="search"
          autocomplete="off"
          spellcheck="false"
          role="combobox"
          aria-expanded="false"
          aria-controls="search-results"
          aria-autocomplete="list"
          aria-describedby="search-help"
          placeholder="sum one region" />
        <button class="btn btn-primary" type="submit">Search</button>
      </form>
      <p class="search-help" id="search-help">Arrow keys move through the results, Enter opens one, Escape clears the box.</p>
      <p class="search-status" id="search-status" role="status" aria-live="polite"></p>
      <ul class="search-results" id="search-results" role="listbox" aria-labelledby="search-help" hidden></ul>

${renderEverything({ track, index })}

      <p class="cta-row"><a class="btn btn-primary" href="/excel-exercises">Browse by skill instead</a></p>
    </main>`;

  return {
    body,
    page: {
      path: "/search",
      title: "Search the exercises",
      description: `Search ${index.length} Excel exercises by the job you need done: lookups, counts, dates, text, totals. Every result is an exercise you can start in one click.`,
      bodyClass: "hub",
      skipLabel: "search",
      jsonLd: jsonLd(breadcrumbJsonLd({ config, trail })),
    },
    indexJson: `<script type="application/json" id="search-index">${jsonScript(rows)}</script>`,
  };
}

/** The whole document, for the static build. */
export function renderSearchPage({
  config,
  track,
  index,
  articles = [],
  formulas = [],
  icons = {},
  appPagesAvailable = false,
}) {
  const { body, page, indexJson } = prepareSearchPage({
    config,
    track,
    index,
    articles,
    formulas,
    appPagesAvailable,
  });
  const html = renderDocument({ config, page, body, icons, appPagesAvailable });
  // The index and the script go in after the footer, so the page paints before the JSON is parsed.
  return html.replace(
    "</body>",
    `    ${indexJson}
    <script type="module" src="/assets/client/search.js"></script>
  </body>`,
  );
}
