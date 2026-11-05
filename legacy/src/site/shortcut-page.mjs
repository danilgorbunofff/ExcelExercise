/**
 * One family of shortcuts, and the hub that lists the six.
 *
 * The page is the table, so the renderer's job is to get out of its way: keys become keycaps, a cell
 * that says `No default` says it without pretending to hold a chord, and the platform tabs are links
 * rather than a widget so that each tabbed state can be sent to someone. The prose the file carries
 * sits under the table, in the order the author wrote it, because a reader arrives for the chord and
 * stays for the explanation.
 */

import { esc } from "./html.mjs";
import { renderBlocks } from "./markdown.mjs";
import { renderQuestions } from "./questions.mjs";
import { articleJsonLd, breadcrumbJsonLd, jsonLd, renderBreadcrumbs } from "./seo.mjs";
import { renderDocument } from "./shell.mjs";
import { PLATFORM_TITLES, SHORTCUT_FAMILIES, SHORTCUT_PLATFORMS } from "./packages.mjs";

export const SHORTCUTS_BASE = "/shortcuts";

const familyTitleOf = (slug) => SHORTCUT_FAMILIES.find((family) => family.id === slug)?.title ?? slug;

/** The three tab labels, in the order the site shows them. Google Sheets is not "Sheets" in prose. */
const TAB_LABELS = PLATFORM_TITLES;

/** The default tab, and the one a bare `/shortcuts/<slug>` URL means. */
const DEFAULT_PLATFORM = "windows";

/**
 * A page's own URL, or the URL of one of its tabs. Windows is the default, so its address is the bare
 * one: a canonical that says `?platform=windows` would be a second name for the same page.
 */
const shortcutPath = (slug, platform = null) =>
  platform && platform !== DEFAULT_PLATFORM
    ? `${SHORTCUTS_BASE}/${slug}?platform=${platform}`
    : `${SHORTCUTS_BASE}/${slug}`;

const shortcutTrail = (shortcut) => [
  { href: "/", label: "Home" },
  { href: SHORTCUTS_BASE, label: "Excel shortcuts" },
  { href: shortcutPath(shortcut.slug), label: shortcut.title },
];

/**
 * One platform cell as keycaps. The parser guarantees the keys are in a code span and the note, if
 * any, follows an em dash, so this splits on ` + ` and wraps each part. The readers here scan for
 * shape as much as for words, and a keycap is the shape a key has.
 */
function renderKeys(cell) {
  if (cell.none) {
    const note = cell.note ? ` <span class="keys-note">${esc(cell.note)}</span>` : "";
    return `<span class="keys-none">${esc(cell.keys)}</span>${note}`;
  }
  const caps = cell.keys
    .split(" + ")
    .map((key) => `<span class="keycap">${esc(key.trim())}</span>`)
    .join('<span class="key-plus" aria-hidden="true">+</span>');
  const note = cell.note ? `<span class="keys-note">${esc(cell.note)}</span>` : "";
  return `<span class="press">${caps}</span>${note}`;
}

/**
 * The table. It carries every offered platform's column in the HTML, because the page has to work
 * with no JavaScript and print as one sheet; the script marks all but the chosen column `hidden` once
 * it runs. Nothing here is derived from the selected tab, so the same file renders the same bytes
 * whichever tab was asked for.
 */
function renderKeysTable(shortcut) {
  const platforms = shortcut.platforms.filter((platform) => SHORTCUT_PLATFORMS.includes(platform));
  const head = [
    `            <th scope="col">Action</th>`,
    ...platforms.map(
      (platform) => `            <th scope="col" data-platform="${esc(platform)}">${esc(TAB_LABELS[platform])}</th>`,
    ),
  ].join("\n");
  const rows = shortcut.rows
    .map(
      (row) => `            <tr>
              <th scope="row">${esc(row.action)}</th>
${platforms
  .map((platform) => `              <td data-platform="${esc(platform)}">${renderKeys(row.cells[platform])}</td>`)
  .join("\n")}
            </tr>`,
    )
    .join("\n");

  return `        <div class="table-wrap keys-wrap" data-shortcut-table>
          <table class="md-table keys-table">
            <thead>
              <tr>
${head}
              </tr>
            </thead>
            <tbody>
${rows}
            </tbody>
          </table>
        </div>`;
}

/**
 * The tabs. Real links with the platform in the query string, so a tab can be pasted into a chat and
 * arrives at the same three columns. `aria-current` marks the one the URL names; the script moves it
 * when the reader picks another, which is why this is a navigation landmark rather than a tablist.
 */
function renderPlatformTabs(shortcut, selected) {
  const platforms = shortcut.platforms.filter((platform) => SHORTCUT_PLATFORMS.includes(platform));
  if (platforms.length < 2) return "";
  const items = platforms
    .map((platform) => {
      const current = platform === selected ? ' aria-current="page"' : "";
      return `            <li><a class="platform-tab" href="${esc(shortcutPath(shortcut.slug, platform))}"${current}>${esc(
        TAB_LABELS[platform],
      )}</a></li>`;
    })
    .join("\n");
  return `        <nav class="platform-tabs" aria-label="Keys for">
          <ul class="platform-tabs-list">
${items}
          </ul>
        </nav>`;
}

/**
 * The touch-screen banner. Rendered hidden and revealed by the script when the pointer is coarse, so
 * a reader with no JavaScript is never shown a banner they cannot dismiss and a screen reader is told
 * about it once, after it is actually on screen.
 */
function renderTouchBanner() {
  return `        <div class="touch-banner" id="shortcuts-banner" hidden>
          <p class="touch-banner-text">Keyboard shortcuts need a keyboard. On a tablet you can still do the exercises, because they grade what you type with a touch keyboard.</p>
          <p class="touch-banner-actions">
            <a class="btn btn-primary" href="/excel-exercises">Practise formulas instead</a>
            <button class="btn btn-ghost" type="button" id="shortcuts-banner-dismiss">Dismiss</button>
          </p>
        </div>`;
}

/**
 * The practice block, with the exercise it names as a button rather than a third link in a paragraph.
 * The path comes from the index, because the two builds serve the same exercise at different addresses
 * (`/excel/...` in the static edition, `/learn/excel/...` in the app) and the index is where that is
 * already decided.
 */
function renderPracticeCta(slug, index, lessonBase) {
  const exercise = index.find((item) => item.slug === slug);
  const label = exercise ? exercise.exercise.title : "the exercise";
  const href = exercise?.path ?? `${lessonBase}/${slug}`;
  return `          <p class="practice-cta"><a class="btn btn-primary" href="${esc(href)}">Practise it: ${esc(
    label,
  )}</a></p>`;
}

/**
 * The body, with the table swapped for keycaps and the practice button after the prose that names it.
 * Every other block renders exactly as it reads, which is what keeps the page's words the author's.
 */
function renderShortcutBody({ shortcut, index, lessonBase }) {
  const parts = shortcut.blocks.map((block) => {
    if (block.type === "table") return renderKeysTable(shortcut);
    // `## Practice` is authored as a link to `/excel/<slug>`, which is the static edition's address for
    // an exercise. The app serves the same exercise under `/learn/excel/`, so the one link the author writes is
    // rewritten here rather than kept as a hop through a redirect.
    const rendered = renderBlocks([block]).replaceAll('href="/excel/', `href="${lessonBase}/`);
    return block.type === "h2" && block.id === "practice"
      ? `${rendered}\n${renderPracticeCta(shortcut.practice, index, lessonBase)}`
      : rendered;
  });
  return parts.join("\n");
}

/** The two ways out: the neighbouring families, and the hub. */
function renderShortcutRelated({ shortcut, shortcuts }) {
  const others = shortcuts.filter((candidate) => candidate.slug !== shortcut.slug);
  const items = [
    ...others.map(
      (candidate) =>
        `            <li><a href="${esc(shortcutPath(candidate.slug))}">${esc(familyTitleOf(candidate.slug))}</a></li>`,
    ),
    `            <li><a href="${SHORTCUTS_BASE}">Every shortcut family</a></li>`,
  ];
  return `<nav class="ways" aria-labelledby="shortcut-related-heading">
          <h2 class="ways-title" id="shortcut-related-heading">Where to go next</h2>
          <ul class="ways-list ways-list-links">
${items.join("\n")}
          </ul>
        </nav>`;
}

/**
 * One family page. `shortcuts` is the whole silo, because the tabs, the sibling links and the hub link
 * are derived from it: a family added to the folder appears on every other family's page without a
 * second edit. `platform` comes from the query string on the Next route and is `null` on the static
 * build, where the script does the same work in the browser.
 */
export function prepareShortcutPage({
  config,
  track,
  index,
  articles = [],
  shortcuts = [],
  shortcut,
  platform = null,
  lessonBase = "/excel",
  clientAvailable = false,
}) {
  const selected = shortcut.platforms.includes(platform) ? platform : DEFAULT_PLATFORM;
  const pageShortcut = {
    ...shortcut,
    heading: shortcut.title,
    path: shortcutPath(shortcut.slug, selected),
    description: shortcut.description,
  };
  const trail = shortcutTrail(pageShortcut);

  const sections = shortcut.blocks
    .filter((block) => block.type === "h2")
    .map((block) => ({ id: block.id, text: block.text }));
  const toc = sections.length
    ? `          <nav class="article-toc" aria-labelledby="shortcut-toc-heading">
            <h2 class="article-toc-title" id="shortcut-toc-heading">On this page</h2>
            <ul class="article-toc-list">
${sections.map((item) => `              <li><a href="#${esc(item.id)}">${esc(item.text)}</a></li>`).join("\n")}
            </ul>
          </nav>`
    : "";

  const body = `<main class="shell" id="main">
      <div class="page-head">
        ${renderBreadcrumbs({ trail })}
        <h1>${esc(shortcut.title)}</h1>
        <p class="lede">${esc(shortcut.summary)}</p>
        ${renderTouchBanner()}
        ${renderPlatformTabs(shortcut, selected)}
      </div>

      <div class="layout">
        <div class="col-main">
          <article class="docs note">
${toc}
${renderShortcutBody({ shortcut, index, lessonBase })}
          </article>

          ${renderShortcutRelated({ shortcut, shortcuts })}
        </div>
      </div>
    </main>${clientAvailable ? '\n  <script type="module" src="/assets/client/shortcuts.js"></script>' : ""}`;

  return {
    body,
    page: {
      path: pageShortcut.path,
      title: shortcut.title,
      description: shortcut.description,
      isHome: false,
      bodyClass: "article",
      updated: shortcut.updated,
      jsonLd: jsonLd(articleJsonLd({ config, article: pageShortcut }), breadcrumbJsonLd({ config, trail })),
    },
    platform: selected,
  };
}

export function renderShortcutPage(args) {
  const { body, page } = prepareShortcutPage(args);
  return renderDocument({ config: args.config, page, body, icons: args.icons });
}

/**
 * The hub: six families, each a heading and the actions on its page. The search field is rendered
 * hidden and revealed by the script, because a filter box that does nothing is worse than no filter
 * box; the list under it is complete, so a reader with no JavaScript loses only the typing.
 */
export function prepareShortcutsHub({ config, shortcuts, index = [], clientAvailable = false }) {
  // The filter box is rendered `hidden`, so without the script this page is the complete list and a
  // box that does nothing is never shown. That is the whole progressive-enhancement bargain of the hub.
  const sections = shortcuts
    .map((shortcut) => {
      const id = `family-${shortcut.slug}`;
      const rows = shortcut.rows
        .map((row) => {
          const keys = shortcut.platforms
            .map((platform) => (row.cells[platform].none ? "" : row.cells[platform].keys))
            .filter(Boolean)
            .join(" ");
          return `              <li class="shortcut-row" data-keys="${esc(keys.toLowerCase())}"><a href="${esc(
            shortcutPath(shortcut.slug),
          )}">${esc(row.action)}</a></li>`;
        })
        .join("\n");
      return `      <section class="shortcut-family" aria-labelledby="${esc(id)}">
        <h2 id="${esc(id)}"><a href="${esc(shortcutPath(shortcut.slug))}">${esc(
        familyTitleOf(shortcut.slug),
      )}</a></h2>
        <p class="shortcut-family-note">${esc(shortcut.summary)}</p>
        <ul class="shortcut-index">
${rows}
        </ul>
      </section>`;
    })
    .join("\n\n");

  const body = `<main class="shell hub" id="main">
      <div class="page-head">
        ${renderBreadcrumbs({ trail: [{ href: "/", label: "Home" }] })}
        <h1>Excel keyboard shortcuts, one page per family</h1>
        <p class="lede">Six pages of keys: moving around, selecting, formatting, writing formulas, cleaning data and arranging windows. Each page gives the Windows and macOS chord for every action, and ends on an exercise that asks for the keys.</p>
      </div>

      <div class="shortcut-filter" id="shortcut-filter" hidden>
        <label class="shortcut-filter-label" for="shortcut-search">Find a shortcut</label>
        <input class="shortcut-filter-input" id="shortcut-search" type="search" autocomplete="off" spellcheck="false" placeholder="Freeze, filter, Ctrl + Shift + L">
        <p class="shortcut-filter-status" id="shortcut-filter-status" role="status"></p>
      </div>

${sections}

      <section aria-labelledby="shortcut-practice-heading">
        <h2 id="shortcut-practice-heading">Practise the keys</h2>
        <p>Reading a table of keys does not build the habit. Each family ends on an exercise that asks for its keys, and that exercise grades the presses the way the formula ones grade what you type.</p>
        <ul class="ways-list">
          <li><a href="/excel-exercises">Start with the first exercise</a></li>
          <li><a href="/formulas">Look up a formula instead</a></li>
        </ul>
      </section>

${renderQuestions({
        id: "shortcut-questions-heading",
        questions: [
          {
            question: "What if my Excel has no default for a shortcut?",
            answer:
              "The row says so and names the menu the command lives on. A guessed chord is worse than a menu path, because you would believe it.",
          },
          {
            question: "Do these work in Google Sheets?",
            answer:
              "Some do. A family shows a Google Sheets tab only when it has keys that work there, and the rows that differ say so in the note.",
          },
          {
            question: "How current is the table?",
            answer:
              "Each page ends with the versions and the date its keys were checked. Shortcuts drift between releases, so check that line before you trust a row.",
          },
        ],
      })}
    </main>${clientAvailable ? '\n  <script type="module" src="/assets/client/shortcuts.js"></script>' : ""}`;

  const trail = [{ href: "/", label: "Home" }];
  return {
    body,
    page: {
      path: SHORTCUTS_BASE,
      title: "Excel keyboard shortcuts, by family",
      description:
        "Six pages of Excel keys: the Windows and macOS chord for every action, a note where a platform has no default, and an exercise that asks for the keys.",
      isHome: false,
      bodyClass: "hub",
      updated: config.builtAt,
      jsonLd: jsonLd(
        {
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: "Excel shortcut families",
          numberOfItems: shortcuts.length,
          itemListElement: shortcuts.map((shortcut, position) => ({
            "@type": "ListItem",
            position: position + 1,
            name: familyTitleOf(shortcut.slug),
            url: `${config.baseUrl}${shortcutPath(shortcut.slug)}`,
          })),
        },
        breadcrumbJsonLd({ config, trail }),
      ),
    },
  };
}

export function renderShortcutsHub(args) {
  const { body, page } = prepareShortcutsHub(args);
  return renderDocument({ config: args.config, page, body, icons: args.icons });
}
