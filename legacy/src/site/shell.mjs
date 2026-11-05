/**
 * The document shell every page shares: head, site header, the lesson rail, footer.
 * The rail is server-rendered with every lesson in it, because a navigation list that
 * only exists after hydration is a list that fails for readers, crawlers and no-JS.
 */

import { attrs, esc, inlineIcon } from "./html.mjs";
import { t } from "./messages.mjs";
import { cardUrl, SOCIAL_SIZE } from "./social.mjs";

function renderHead({ config, page }) {
  const canonical = `${config.baseUrl}${page.path}`;
  const title = page.isHome ? `${config.name} · ${page.title}` : `${page.title} · ${config.name}`;
  // One card per page kind, drawn at build time from this page's own heading — see `site/social.mjs`.
  const card = cardUrl(config, page.path);
  const fontPreloads = ["plex-sans-latin.woff2", "newsreader-latin.woff2"]
    .map(
      (file) =>
        `<link rel="preload" href="/assets/fonts/${file}" as="font" type="font/woff2" crossorigin="anonymous">`,
    )
    .join("\n    ");

  return `<meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(page.description)}">
    <link rel="canonical" href="${esc(canonical)}">
    <meta property="og:type" content="${page.isHome ? "website" : "article"}">
    <meta property="og:site_name" content="${esc(config.name)}">
    <meta property="og:title" content="${esc(page.title)}">
    <meta property="og:description" content="${esc(page.description)}">
    <meta property="og:url" content="${esc(canonical)}">
    ${page.updated ? `<meta property="article:modified_time" content="${esc(page.updated)}">` : ""}
    <meta property="og:image" content="${esc(card)}">
    <meta property="og:image:width" content="${SOCIAL_SIZE.width}">
    <meta property="og:image:height" content="${SOCIAL_SIZE.height}">
    <meta property="og:image:alt" content="${esc(page.title)}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:image" content="${esc(card)}">
    <meta name="twitter:image:alt" content="${esc(page.title)}">
    ${page.noindex ? '<meta name="robots" content="noindex">' : ""}
    <meta name="color-scheme" content="light dark">
    <meta name="theme-color" media="(prefers-color-scheme: light)" content="${config.themeColor.light}">
    <meta name="theme-color" media="(prefers-color-scheme: dark)" content="${config.themeColor.dark}">
    ${fontPreloads}
    <link rel="stylesheet" href="/assets/styles.css">
    <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
    <link rel="apple-touch-icon" href="/assets/icons/apple-touch-icon.png">
    <link rel="manifest" href="/manifest.webmanifest">
    ${page.jsonLd ? `<script type="application/ld+json">${page.jsonLd}</script>` : ""}`;
}

/**
 * The mark, then three ways in: search, the account, and the drawer.
 *
 * It used to print a fact about the page beside the wordmark — "86 exercises" on the front door, "Note 1
 * of 8" on a note, "Free exercises · paid track" on the price page. It was a fourth thing to read in a
 * row the reader is scanning for a way out, and it answered a question nobody had asked at that point:
 * what a page is, the page already says in its heading. The slot is gone rather than tidied.
 *
 * The header carries one link, not a wall: the account. Everything a customer pays for — the plan, the
 * invoices, the certificate, the board, the delete button — lives behind that door, so it cannot be the
 * one thing the page forgets. The rest of the site's destinations are in the drawer (see
 * `renderSiteMenu`), one click behind the Menu button that opens this header.
 *
 * It is labelled "Account" rather than "Sign in" because the header is rendered as static HTML and
 * cannot know whether the reader holds a session; `/account` answers both audiences (`proxy.js` sends
 * a signed-out visitor to `/login?next=%2Faccount`, a signed-in one sees their profile). A label that
 * changed with the session would need a dynamic render or a flicker after hydration, and neither is
 * worth a word.
 *
 * `appPagesAvailable` is the same host fact `renderSiteMenu` takes: the static edition has no server, so
 * it links the sibling deployment absolutely when `SITE_APP_URL` names one, and omits the link when it
 * does not. A relative `/account` on a host with no account page is a 404 behind the primary affordance.
 */
function accountHref({ config, appPagesAvailable }) {
  if (appPagesAvailable) return "/account";
  return config.appUrl ? `${config.appUrl}/account` : null;
}

function renderSiteHeader({ config, appPagesAvailable = false, icons = {} }) {
  const account = accountHref({ config, appPagesAvailable });
  // The glyph is decoration beside the word, never instead of it: it is `aria-hidden` inside a link that
  // still reads "Search". Two 16px marks are what makes the row scannable — a pair of grey words at the
  // same weight as the drawer's chrome read as prose, not as two places to go.
  const headIcon = (name) => inlineIcon(icons[name], { size: 16, className: "icon icon-head" });
  const accountLink = account
    ? `\n        <a class="head-link head-link-account" href="${esc(account)}">${headIcon("user")}${t("chrome.header.account")}</a>`
    : "";
  // Search is the way in for a learner who knows the job but not the exercise's name, so it sits in the
  // header on every page rather than only on the catalogue.
  const searchLink = `\n        <a class="head-link" href="/search">${headIcon("magnifying-glass")}${t("chrome.header.search")}</a>`;
  // The one door into the menu. It is a `<button>` with no `href`, so the header stays "the mark, one fact
  // and the ways in" — the menu is a sibling of `<main>`, not a row of links up here. It keeps the only
  // border in the row and it spells its name: an icon-only square is the thing readers on a desktop do
  // not notice, and a bordered square next to four other bordered squares read as another link.
  const menuToggle = `<button class="menu-toggle" id="menu-open" type="button" aria-haspopup="dialog" aria-expanded="false" aria-controls="site-menu"><span class="menu-bars" aria-hidden="true"></span><span class="menu-label">${t("chrome.menu.toggle")}</span></button>`;
  return `<header class="site">
      <a class="brand" href="/"><span class="brand-mark" aria-hidden="true">=</span><span class="brand-name">${esc(
        config.name,
      )}</span></a>
      <div class="head-actions">${searchLink}${accountLink}
        ${menuToggle}
      </div>
    </header>`;
}

/** `01 SUM: total a column` with a tick slot the client fills in once an exercise is solved. */
export function renderRail({ index, currentSlug, icons = {} }) {
  const items = index
    .map((entry) => {
      const current = entry.slug === currentSlug;
      const number = String(entry.number).padStart(2, "0");
      const lock = entry.free ? "" : ` ${inlineIcon(icons.lock, { size: 12, className: "icon icon-lock" })}`;
      const gatedNote = entry.free ? "" : `<span class="visually-hidden"> (paid lesson)</span>`;
      return `        <li${attrs({
        class: `rail-item${current ? " is-current" : ""}`,
        "data-lesson": entry.exercise.id,
        "data-gated": entry.free ? "false" : "true",
        "aria-current": current ? "page" : null,
      })}>
          <span class="rail-num" aria-hidden="true">${number}</span>
          <a class="rail-link" href="${esc(entry.path)}">${esc(entry.exercise.title)}${gatedNote}</a>${lock}
          <span class="rail-tick" data-tick hidden aria-hidden="true">${inlineIcon(icons.check, { size: 12 })}</span>
        </li>`;
    })
    .join("\n");

  return `<aside class="rail" aria-labelledby="rail-heading">
        <h2 class="rail-title" id="rail-heading">The track</h2>
        <p class="rail-count"><span id="progress-count">0 of ${index.length}</span> complete</p>
        <div class="rail-track" aria-hidden="true"><span class="rail-fill" id="progress-fill"></span></div>
        <ol class="rail-list">
${items}
        </ol>
      </aside>`;
}

/**
 * The feedback dialog is server-rendered with the footer, on every page, and stays closed until the
 * client asks for it: a `<dialog>` cannot be built by a script without either a flash of unstyled
 * markup or a second copy of this markup, and a learner with no JavaScript loses only the button.
 */
function renderFeedbackDialog() {
  return `      <dialog class="feedback-dialog" id="feedback-dialog" aria-labelledby="feedback-heading">
        <form class="feedback-form" id="feedback-form" novalidate>
          <h2 class="feedback-title" id="feedback-heading">${t("chrome.feedback.title")}</h2>
          <fieldset class="feedback-set">
            <legend class="feedback-legend">${t("chrome.feedback.legend")}</legend>
            <label class="feedback-choice"><input type="radio" name="mood" value="stuck"> ${t("chrome.feedback.stuck")}</label>
            <label class="feedback-choice"><input type="radio" name="mood" value="progress"> ${t("chrome.feedback.progress")}</label>
            <label class="feedback-choice"><input type="radio" name="mood" value="clicked"> ${t("chrome.feedback.clicked")}</label>
          </fieldset>
          <label class="feedback-label" for="feedback-text">${t("chrome.feedback.text")}</label>
          <textarea class="feedback-text" id="feedback-text" name="text" rows="3" maxlength="500" aria-describedby="feedback-count"></textarea>
          <p class="feedback-count" id="feedback-count">0 of 500 characters</p>
          <p class="feedback-note">${t("chrome.feedback.note")}</p>
          <p class="feedback-error" id="feedback-error" role="alert"></p>
          <div class="feedback-actions">
            <button class="btn btn-primary" type="submit">${t("chrome.feedback.send")}</button>
            <button class="btn" type="button" id="feedback-cancel">${t("chrome.feedback.cancel")}</button>
          </div>
        </form>
        <div class="feedback-done" id="feedback-done" hidden>
          <p class="feedback-note" id="feedback-done-note"></p>
          <div class="feedback-actions"><button class="btn" type="button" id="feedback-close">${t("chrome.feedback.close")}</button></div>
        </div>
      </dialog>`;
}

/**
 * A colophon, not a site map. The footer used to carry twelve links in two right-aligned rows — a wall
 * of navigation doing the job the header does not, which read as clutter on every page. What is left is
 * the copyright line and the three ways out that are legal or feedback in nature: Privacy, Terms, Send
 * feedback. Navigation lives in `renderSiteMenu`, one click behind the Menu button, where a reader is
 * actually choosing what to do.
 */
/**
 * The footer's last line is the way to a human: a mailto when the build was given an address, nothing
 * when it was not. `SITE_CONTACT` is a host fact like the app URL — a build with no address must not
 * invent one, and the privacy page's "write to us" only works when there is somewhere to write to.
 */
function renderFooter({ config }) {
  // `SITE_CONTACT` is accepted with or without the scheme — the privacy page and the hub read it the
  // same way — so the prefix is stripped here and added back exactly once.
  const address = config.contact?.trim().replace(/^mailto:/i, "");
  const write = address
    ? ` · <a href="mailto:${esc(address)}">${t("chrome.footer.write")}</a>`
    : "";
  // The year comes from the build stamp, so a footer is never a year out of date and no one has to
  // remember to edit it in January.
  const year = String(config.builtAt ?? "").slice(0, 4) || String(new Date().getFullYear());
  return `<footer class="foot">
      <p>${t("chrome.footer.copyright", { year, name: esc(config.name) })}</p>
      <p><a href="/privacy">${t("chrome.footer.privacy")}</a> · <a href="/terms">${t("chrome.footer.terms")}</a> · <button class="foot-feedback" id="feedback-open" type="button" aria-haspopup="dialog">${t("chrome.footer.feedback")}</button>${write}</p>
${renderFeedbackDialog()}
    </footer>`;
}

/**
 * The drawer: every destination the footer used to carry, behind one Menu button in the header.
 *
 * The site has no header navigation — the header is the mark, the exercise count and the account link —
 * and that decision stands. A wall of twelve links stapled to the bottom of every page was the price of
 * it, so the wall became a menu: one door per page, the same wall behind it, closed until asked for.
 *
 * Rows are one flat list of destinations, in the order a reader wants them, with the account rows
 * below a rule at the foot. No captions over two-row groups and no glyph tiles: a label and its link
 * is the whole row.
 *
 * `projectsAvailable` says whether this host has a `/projects` page. The static build does not — the
 * projects are Next-only — so it omits the row rather than pointing at a 404. `appPagesAvailable` is the
 * same fact for the signed-in surfaces: they need a server, so they exist only on the Next host, and
 * without the flag the static build would point its links at 404s. Availability is a host fact, passed
 * in, not probed. `appUrl` is the other half of that fact: when the static edition is deployed next to
 * the Next app those pages exist, just elsewhere — so the link is absolute rather than absent.
 *
 * `<noscript>` puts the same rows back in the flow with the button hidden: a menu that needs scripting to
 * open is a menu a crawler and a reader on a locked-down browser cannot use, and this is the only
 * navigation the site has.
 */
export function renderSiteMenu({ config, projectsAvailable = false, appPagesAvailable = false, icons = {} }) {
  const here = (path) => (appPagesAvailable ? path : null);
  const elsewhere = (path) => (appPagesAvailable ? path : config.appUrl ? `${config.appUrl}${path}` : null);
  // One glyph per row, in the same 16px optical size as the header's two. It is the column that lets the
  // eye find "Leaderboard" without reading eight labels in a row; the label is still the link's name, so
  // a row with no icon file (a unit test, a preview) is a row that still works.
  const listOf = (rows) =>
    rows
      .filter(([href]) => href)
      .map(
        ([href, label, icon]) =>
          `\n            <li><a class="menu-row" href="${esc(href)}">${inlineIcon(icons[icon], {
            size: 16,
            className: "icon icon-row",
          })}${esc(label)}</a></li>`,
      )
      .join("");
  // Eleven destinations do not need five captions. The list runs in the order a learner meets the
  // site, and the three things that are about the reader rather than the work — what they earned, who
  // they are, what it costs — sit below a rule at the foot, where a sidebar puts its account area.
  const work = [
    ["/start", t("chrome.ways.start"), "play"],
    ["/excel-exercises", t("chrome.ways.exercises"), "list-checks"],
    [projectsAvailable ? "/projects" : null, t("chrome.ways.projects"), "folder-simple"],
    [here("/daily"), t("chrome.ways.daily"), "calendar-blank"],
    [here("/flashcards"), t("chrome.ways.flashcards"), "cards"],
    [here("/leaderboard"), t("chrome.ways.board"), "ranking"],
    ["/excel-functions", t("chrome.ways.functions"), "function"],
    ["/shortcuts", t("chrome.ways.shortcuts"), "keyboard"],
  ];
  const mine = [
    [elsewhere("/certificate"), t("chrome.ways.certificate"), "seal-check"],
    [elsewhere("/account"), t("chrome.ways.account"), "user"],
    ["/pricing", t("chrome.ways.pricing"), "tag"],
  ];
  return `<dialog class="menu" id="site-menu" aria-labelledby="menu-heading">
      <div class="menu-sheet">
        <div class="menu-head">
          <p class="menu-title" id="menu-heading">${esc(config.name)}</p>
          <button class="menu-close" type="button" autofocus>${t("chrome.menu.close")}</button>
        </div>
        <nav aria-labelledby="menu-heading">
          <ul class="menu-list">${listOf(work)}
          </ul>
          <ul class="menu-list menu-list-foot">${listOf(mine)}
          </ul>
        </nav>
      </div>
      <noscript><style>#menu-open,.menu-close{display:none}dialog.menu:not([open]){display:block;position:static;width:auto;max-width:none;max-height:none;border:0;box-shadow:none}</style></noscript>
    </dialog>`;
}

/**
 * The document furniture around `<main>`: skip link, site header, footer. Split out because a host
 * that owns `<html>`/`<head>` itself (the Next.js shell) still wants this markup byte-identical.
 */
export function renderChrome({ config, page, appPagesAvailable = false, icons = {} }) {
  return {
    // `skipLabel` is the noun only — "Skip to the " is written once, here, so a page cannot end up
    // saying it twice.
    skip: `<a class="skip" href="#main">${t("chrome.skip", { what: page.skipLabel ?? (page.isHome ? "exercises" : "exercise") })}</a>`,
    header: renderSiteHeader({ config, appPagesAvailable, icons }),
    footer: renderFooter({ config }),
  };
}

export function renderDocument({
  config,
  page,
  body,
  icons = {},
  projectsAvailable = false,
  appPagesAvailable = false,
}) {
  const { skip, header, footer } = renderChrome({ config, page, appPagesAvailable, icons });
  // The drawer is rendered here rather than by `renderChrome` because the Next shell owns `<html>` and
  // mounts the chrome itself; both writers call this one function, so the two builds stay byte-identical.
  const menu = renderSiteMenu({ config, projectsAvailable, appPagesAvailable, icons });
  return `<!doctype html>
<html lang="${esc(config.inLanguage)}">
  <head>
    ${renderHead({ config, page })}
  </head>
  <body class="light ${esc(page.bodyClass)}">
    ${skip}
    ${header}
    ${menu}
    ${body}
    ${footer}
    <script type="module" src="/assets/client/feedback.js"></script>
    <script type="module" src="/assets/client/menu.js"></script>
  </body>
</html>
`;
}
