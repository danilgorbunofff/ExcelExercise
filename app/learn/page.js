import { prepareDashboardPage } from "../../legacy/src/site/dashboard-page.mjs";
import { renderChrome } from "../../legacy/src/site/shell.mjs";

import { loadSite } from "../../lib/site.js";

const { config, track, index, icons, dashboardAvailable } = loadSite();

// The dashboard is per-browser, so it has nothing to rank and stays out of the sitemap.
export const metadata = {
  title: "Your progress",
  description: "What you have finished, what wants another look, and which drill to open next.",
  robots: { index: false, follow: true },
};

export default function Learn() {
  const { body, page } = prepareDashboardPage({
    config,
    track,
    index,
    icons,
    clientAvailable: dashboardAvailable,
    projectsAvailable: true,
    appPagesAvailable: true,
  });
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
