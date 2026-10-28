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

function renderFooter({ config }) {
  const contact = config.contact
    ? `<a href="${esc(config.contact.startsWith("mailto:") ? config.contact : `mailto:${config.contact}`)}">Contact</a>`
    : "";
  return `<footer class="foot">
      <p>${esc(config.name)} grades formulas in the browser. Nothing you type is sent anywhere.</p>
      <p><a href="/">All drills</a>${contact ? ` · ${contact}` : ""}</p>
    </footer>`;
}

export function renderDocument({ config, page, body, icons = {} }) {
  return `<!doctype html>
<html lang="${esc(config.inLanguage)}">
  <head>
    ${renderHead({ config, page })}
  </head>
  <body class="light ${esc(page.bodyClass)}">
    <a class="skip" href="#main">Skip to the ${page.isHome ? "drills" : "drill"}</a>
    ${renderSiteHeader({ config, page })}
    ${body}
    ${renderFooter({ config })}
  </body>
</html>
`;
}
