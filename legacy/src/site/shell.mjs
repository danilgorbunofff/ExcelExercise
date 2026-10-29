/**
 * The document shell every page shares: head, site header, the lesson rail, footer.
 * The rail is server-rendered with every lesson in it, because a navigation list that
 * only exists after hydration is a list that fails for readers, crawlers and no-JS.
 */

import { attrs, esc, humanDate, inlineIcon } from "./html.mjs";

function renderHead({ config, page }) {
  const canonical = `${config.baseUrl}${page.path}`;
  const title = page.isHome ? `${config.name} — ${page.title}` : `${page.title} — ${config.name}`;
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
    <meta name="twitter:card" content="summary">
    ${page.noindex ? '<meta name="robots" content="noindex">' : ""}
    <meta name="color-scheme" content="light">
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
      <p class="badge">Free · no signup</p>
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

export function renderByline({ config, index, extra = null }) {
  const parts = [];
  if (config.author) parts.push(`By ${esc(config.author)}`);
  parts.push(`<time datetime="${esc(config.builtAt)}">Updated ${esc(humanDate(config.builtAt))}</time>`);
  parts.push(`${index.length} drills`);
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
          <h2 class="feedback-title" id="feedback-heading">How is this going?</h2>
          <fieldset class="feedback-set">
            <legend class="feedback-legend">Pick the one that fits</legend>
            <label class="feedback-choice"><input type="radio" name="mood" value="stuck"> I am stuck</label>
            <label class="feedback-choice"><input type="radio" name="mood" value="progress"> Getting there</label>
            <label class="feedback-choice"><input type="radio" name="mood" value="clicked"> It clicked</label>
          </fieldset>
          <label class="feedback-label" for="feedback-text">Anything to add? Optional.</label>
          <textarea class="feedback-text" id="feedback-text" name="text" rows="3" maxlength="500" aria-describedby="feedback-count"></textarea>
          <p class="feedback-count" id="feedback-count">0 of 500 characters</p>
          <p class="feedback-note">Nothing is sent yet: your note is kept in this browser, and that is all.</p>
          <p class="feedback-error" id="feedback-error" role="alert"></p>
          <div class="feedback-actions">
            <button class="btn btn-primary" type="submit">Send</button>
            <button class="btn" type="button" id="feedback-cancel">Cancel</button>
          </div>
        </form>
        <div class="feedback-done" id="feedback-done" hidden>
          <p class="feedback-note" id="feedback-done-note"></p>
          <div class="feedback-actions"><button class="btn" type="button" id="feedback-close">Close</button></div>
        </div>
      </dialog>`;
}

function renderFooter({ config }) {
  const contact = config.contact
    ? `<a href="${esc(config.contact.startsWith("mailto:") ? config.contact : `mailto:${config.contact}`)}">Contact</a>`
    : "";
  return `<footer class="foot">
      <p>${esc(config.name)} grades formulas in the browser. Nothing you type is sent anywhere.</p>
      <p><a href="/">All drills</a> · <a href="/learn">Your progress</a>${contact ? ` · ${contact}` : ""} · <button class="foot-feedback" id="feedback-open" type="button" aria-haspopup="dialog">Send feedback</button></p>
${renderFeedbackDialog()}
    </footer>`;
}

/**
 * The document furniture around `<main>`: skip link, site header, footer. Split out because a host
 * that owns `<html>`/`<head>` itself (the Next.js shell) still wants this markup byte-identical.
 */
export function renderChrome({ config, page }) {
  return {
    skip: `<a class="skip" href="#main">Skip to the ${page.skipLabel ?? (page.isHome ? "drills" : "drill")}</a>`,
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
