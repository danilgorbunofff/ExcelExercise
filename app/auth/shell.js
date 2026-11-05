import { renderChrome } from "../../legacy/src/site/shell.mjs";
import { loadSite } from "../../lib/site.js";

const { config, icons } = loadSite();

/**
 * The document furniture the rest of the site uses — skip link, header, footer — around an auth
 * `<main>`. The header prints nothing about the page: it used to carry a word for what the screen was,
 * which the `<h1>` under it already says.
 *
 * `skipLabel` finishes "Skip to the …": the sign-in screens land on a form, but the boards and
 * settings pages that share this shell do not, and a skip link that names the wrong landmark is
 * worse than none.
 */
export function AuthShell({ skipLabel = "form", children }) {
  const { skip, header, footer } = renderChrome({
    config,
    page: { isHome: false, skipLabel },
    appPagesAvailable: true,
    icons,
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
