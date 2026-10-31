/**
 * The 404, in one place, because it is answered from two.
 *
 * `app/not-found.js` renders it when a page calls `notFound()` — a wrong slug inside a page that the
 * router already resolved. The proxy answers it when the address names no catalog entry at all, and it
 * does that because of a measured Next behaviour: with Cache Components on, an unknown param is
 * rendered on request, and the prerender shell has already been flushed with `200` by the time the page
 * throws. A crawler that asks once sees a soft 404 — a success status carrying "That page is not a
 * drill". The second request is a cached `404`, so the bug only hides from repeat probes.
 *
 * Both callers must ship the same document, so the markup lives here. The stylesheet is the static
 * build's own file, which is published to `public/assets` by the same `npm run build` the Next build
 * runs behind, so the refused page is painted by the site it belongs to rather than by the browser's
 * defaults.
 */
import { siteConfig } from "../legacy/src/site/config.mjs";
import { renderChrome } from "../legacy/src/site/shell.mjs";

export const NOT_FOUND_TITLE = "Page not found";

/** The words, in one copy: the eyebrow, the heading, and the one way back. */
export const NOT_FOUND_BODY = `<main class="shell" id="main">
      <div class="page-head">
        <p class="eyebrow">404</p>
        <h1>That page is not a drill</h1>
        <p class="lede">The address you followed does not exist. Every drill is on the track page, and each one grades in your browser: no account, no upload.</p>
      </div>

      <p class="cta-row"><a class="btn btn-primary" href="/">Back to the track</a></p>
    </main>`;

/**
 * Built at import time, not per render: `siteConfig()` reads the clock for the build date, and under
 * Cache Components a clock read inside a prerendered page is a build error. The old page had the same
 * `const` at module scope for the same reason.
 */
const VIEW = buildView();

/** The fragments a page needs: this file's chrome, around this file's words. */
export function notFoundView() {
  return VIEW;
}

function buildView() {
  const config = siteConfig();
  const { skip, header, footer } = renderChrome({ config, page: { isHome: false, counter: "Page not found" } });
  return { config, skip, header, footer, body: NOT_FOUND_BODY };
}

/**
 * The whole document, escaped the way every other page here escapes: nothing in it is reader input, and
 * the site name comes from configuration.
 */
export function notFoundDocument() {
  const { config, skip, header, footer, body } = notFoundView();
  const name = escapeHtml(config.name);
  return `<!doctype html>
<html lang="${escapeHtml(config.inLanguage)}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <title>${name ? `${NOT_FOUND_TITLE} · ${name}` : NOT_FOUND_TITLE}</title>
    <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml" />
    <link rel="stylesheet" href="/assets/styles.css" />
  </head>
  <body class="light">
${skip}${header}${body}${footer}
  </body>
</html>
`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}
