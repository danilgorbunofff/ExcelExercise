import { renderChrome } from "../../legacy/src/site/shell.mjs";
import { loadSite } from "../../lib/site.js";

const { config } = loadSite();

/**
 * The document furniture the rest of the site uses — skip link, header, footer — around an auth
 * `<main>`. Auth pages are not part of the catalog, so the header counter says what the page is
 * instead of carrying a lesson count that would mean nothing here.
 */
export function AuthShell({ counter, children }) {
  const { skip, header, footer } = renderChrome({
    config,
    page: { isHome: false, skipLabel: "form", counter },
  });
  return (
    <>
      <div dangerouslySetInnerHTML={{ __html: skip }} />
      <div dangerouslySetInnerHTML={{ __html: header }} />
      <main className="shell auth" id="main">
        {children}
      </main>
      <div dangerouslySetInnerHTML={{ __html: footer }} />
    </>
  );
}
