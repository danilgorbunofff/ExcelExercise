import { siteConfig } from "../legacy/src/site/config.mjs";
import { renderChrome } from "../legacy/src/site/shell.mjs";

// Only the name and the contact link are needed here, so the 404 path takes the light config module
// instead of `lib/site.js` (which reads every lesson off disk to build the rail it does not render).
const config = siteConfig();

// `notFound()` lands here from the lesson route (unknown slug), and Next uses this file for every
// address the app does not have. It renders the same chrome as the real pages so a wrong link still
// looks like the site and offers one way back.
const page = { isHome: false, counter: "Page not found" };

export const metadata = {
  title: "Page not found",
};

const body = `<main class="shell" id="main">
      <div class="page-head">
        <p class="eyebrow">404</p>
        <h1>That page is not a drill</h1>
        <p class="lede">The address you followed does not exist. All ten drills are on the track page, and each one grades in your browser: no account, no upload.</p>
      </div>

      <p class="cta-row"><a class="btn btn-primary" href="/">Back to the track</a></p>
    </main>`;

export default function NotFound() {
  const { skip, header, footer } = renderChrome({ config, page });

  return (
    <>
      <div dangerouslySetInnerHTML={{ __html: skip }} />
      <div dangerouslySetInnerHTML={{ __html: header }} />
      <div dangerouslySetInnerHTML={{ __html: body }} />
      <div dangerouslySetInnerHTML={{ __html: footer }} />
    </>
  );
}
