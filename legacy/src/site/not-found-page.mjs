/**
 * The 404 the static edition answers with.
 *
 * A static host cannot improvise a page for an address that does not exist; it serves whatever file
 * the deploy names as its not-found document. Without one, a mistyped URL got the host's own plain
 * "Not found" and the reader lost the header, the ways back and the site's only navigation. This is
 * the same chrome as every other page, an `<h1>` that says what happened, and two doors: the front
 * page and the catalogue.
 *
 * `noindex` is deliberate: a 404 page in the index competes with the page the reader meant to reach.
 */
import { esc } from "./html.mjs";
import { renderDocument } from "./shell.mjs";

export function prepareNotFoundPage({ config, index }) {
  const body = `<main class="shell" id="main">
      <div class="page-head">
        <p class="eyebrow">404</p>
        <h1>That page is not here</h1>
        <p class="lede">The address you followed does not match a page on this site. The page may have moved, or one character in the link may be wrong.</p>
      </div>

      <div class="docs">
        <h2 id="ways-back">Two ways back</h2>
        <p>Start from the <a href="/">front page</a>, or open the <a href="/excel-exercises">catalogue of ${index.length} Excel exercises</a> and choose one.</p>
      </div>

    </main>`;

  return {
    body,
    page: {
      path: "/404",
      title: "Page not found",
      description: `That address does not match a page on this site. The front page and the catalogue of ${index.length} Excel exercises are one click away.`,
      skipLabel: "error",
      bodyClass: "not-found",
      noindex: true,
      jsonLd: "",
    },
  };
}

export function renderNotFoundPage(args) {
  const { body, page } = prepareNotFoundPage(args);
  return renderDocument({ config: args.config, page, body, icons: args.icons ?? {} });
}
