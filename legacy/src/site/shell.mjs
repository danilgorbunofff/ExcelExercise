/**
 * The document shell every page shares: head, site header, the lesson rail, footer.
 * The rail is server-rendered with every lesson in it, because a navigation list that
 * only exists after hydration is a list that fails for readers, crawlers and no-JS.
 */

import { attrs, esc, humanDate, inlineIcon } from "./html.mjs";
import { t } from "./messages.mjs";

function renderHead({ config, page }) {
  const canonical = `${config.baseUrl}${page.path}`;
  const title = page.isHome ? `${config.name} · ${page.title}` : `${page.title} · ${config.name}`;
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
    <meta name="twitter:card" content="summary">
    ${page.noindex ? '<meta name="robots" content="noindex">' : ""}
    <meta name="color-scheme" content="light dark">
    <meta name="theme-color" media="(prefers-color-scheme: light)" content="${config.themeColor.light}">
    <meta name="theme-color" media="(prefers-color-scheme: dark)" content="${config.themeColor.dark}">
    ${fontPreloads}
    <link rel="stylesheet" href="/assets/styles.css">
    <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
    ${page.jsonLd ? `<script type="application/ld+json">${page.jsonLd}</script>` : ""}`;
}

function renderSiteHeader({ config, page }) {
  return `<header class="site">
      <a class="brand" href="/"><span class="brand-mark" aria-hidden="true">=</span><span class="brand-name">${esc(
        config.name,
      )}</span></a>
      <p class="drill-count">${esc(page.counter)}</p>
      <p class="badge">${esc(page.badge ?? t("chrome.badge.free"))}</p>
    </header>`;
}

/** `01 SUM: total a column` with a tick slot the client fills in once a drill is solved. */
export function renderRail({ index, currentSlug, icons = {} }) {
  const items = index
    .map((entry) => {
      const current = entry.slug === currentSlug;
      const number = String(entry.number).padStart(2, "0");
      const lock = entry.free ? "" : ` ${inlineIcon(icons.lock, { size: 12, className: "icon icon-lock" })}`;
      const gatedNote = entry.free ? "" : `<span class="visually-hidden"> (trial lesson)</span>`;
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

export function renderByline({ config, index, extra = null, noun = "drills", updated }) {
  const parts = [];
  if (config.author) parts.push(`By ${esc(config.author)}`);
  // A page that was rewritten on its own date says so; the rest fall back to the build date, which is
  // the truth for them (they were rendered from today's content).
  const date = updated ?? config.builtAt;
  parts.push(`<time datetime="${esc(date)}">Updated ${esc(humanDate(date))}</time>`);
  parts.push(`${index.length} ${noun}`);
  if (extra) parts.push(extra);
  return `<p class="byline">${parts.join(" · ")}</p>`;
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
 * the product claim and the three ways out that are legal or feedback in nature: Privacy, Terms, Send
 * feedback. Navigation lives in `renderWaysOut`, once, where a reader is actually choosing what to do.
 */
function renderFooter({ config }) {
  return `<footer class="foot">
      <p>${t("chrome.footer.claim", { name: esc(config.name) })}</p>
      <p><a href="/privacy">${t("chrome.footer.privacy")}</a> · <a href="/terms">${t("chrome.footer.terms")}</a> · <button class="foot-feedback" id="feedback-open" type="button" aria-haspopup="dialog">${t("chrome.footer.feedback")}</button></p>
${renderFeedbackDialog()}
    </footer>`;
}

/**
 * Every destination the footer used to carry, in one quiet block. The site has no header navigation —
 * the header is the mark, the drill count and the badge — so this is the page's menu, and it belongs in
 * the flow of the page rather than stapled under it.
 *
 * Two variants, because a reader on the front door and a reader on their own dashboard are choosing
 * different things. `home` offers the ways *in*: the projects, today's set, what a trial costs. The
 * `dashboard` variant offers the ways *around*, next to the progress the reader already has. Splitting
 * them keeps either page to a handful of links instead of reinstating the twelve-item wall.
 *
 * `projectsAvailable` says whether this host has a `/projects` page. The static build does not — the
 * projects are Next-only — so it omits the link rather than pointing at a 404. `appPagesAvailable` is
 * the same fact for the signed-in surfaces: they need a server, so they exist only on the Next host,
 * and without the flag the static build would point its links at 404s. Availability is a host fact,
 * passed in, not probed.
 */
export function renderWaysOut({
  variant = "home",
  projectsAvailable = false,
  appPagesAvailable = false,
}) {
  const projects = projectsAvailable ? `\n        <li><a href="/projects">${t("chrome.ways.projects")}</a></li>` : "";
  const items =
    variant === "dashboard"
      ? appPagesAvailable
        ? `
        <li><a href="/flashcards">${t("chrome.ways.flashcards")}</a></li>
        <li><a href="/daily">${t("chrome.ways.daily")}</a></li>
        <li><a href="/leaderboard">${t("chrome.ways.board")}</a></li>
        <li><a href="/certificate">${t("chrome.ways.certificate")}</a></li>
        <li><a href="/account">${t("chrome.ways.account")}</a></li>`
        : `
        <li><a href="/pricing">Pricing</a></li>`
      : `${projects}${
          appPagesAvailable ? `\n        <li><a href="/daily">${t("chrome.ways.daily")}</a></li>` : ""
        }
        <li><a href="/excel-exercises">${t("chrome.ways.exercises")}</a></li>
        <li><a href="/pricing">${t("chrome.ways.pricing")}</a></li>`;
  const title = variant === "dashboard" && appPagesAvailable ? t("chrome.ways.tools") : t("chrome.ways.home");
  return `<nav class="ways" aria-labelledby="ways-heading">
      <h2 class="ways-title" id="ways-heading">${title}</h2>
      <ul class="ways-list">${items}
      </ul>
    </nav>`;
}

/**
 * The document furniture around `<main>`: skip link, site header, footer. Split out because a host
 * that owns `<html>`/`<head>` itself (the Next.js shell) still wants this markup byte-identical.
 */
export function renderChrome({ config, page }) {
  return {
    // `skipLabel` is the noun only — "Skip to the " is written once, here, so a page cannot end up
    // saying it twice.
    skip: `<a class="skip" href="#main">${t("chrome.skip", { what: page.skipLabel ?? (page.isHome ? "drills" : "drill") })}</a>`,
    header: renderSiteHeader({ config, page }),
    footer: renderFooter({ config }),
  };
}

export function renderDocument({ config, page, body, icons = {} }) {
  const { skip, header, footer } = renderChrome({ config, page });
  return `<!doctype html>
<html lang="${esc(config.inLanguage)}">
  <head>
    ${renderHead({ config, page })}
  </head>
  <body class="light ${esc(page.bodyClass)}">
    ${skip}
    ${header}
    ${body}
    ${footer}
    <script type="module" src="/assets/client/feedback.js"></script>
  </body>
</html>
`;
}
