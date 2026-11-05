import { prepareDashboardPage } from "../../legacy/src/site/dashboard-page.mjs";
import { renderChrome } from "../../legacy/src/site/shell.mjs";

import { loadSite } from "../../lib/site.js";
import { socialImage, socialTwitter } from "../../lib/social.js";

const { config, track, index, icons, dashboardAvailable } = loadSite();

// The dashboard is per-browser, so it has nothing to rank and stays out of the sitemap. It is still
// shared — a reader sends a friend the link to their progress — so it carries the dashboard's own card.
const TITLE = "Your progress";
const DESCRIPTION = "What you have finished, what wants another look, and which exercise to open next.";

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  robots: { index: false, follow: true },
  openGraph: {
    type: "website",
    siteName: config.name,
    title: TITLE,
    description: DESCRIPTION,
    url: "/learn",
    images: [socialImage({ path: "/learn", title: TITLE })],
  },
  twitter: socialTwitter({ path: "/learn", title: TITLE }),
};

export default function Learn() {
  const { body, page } = prepareDashboardPage({
    config,
    track,
    index,
    icons,
    clientAvailable: dashboardAvailable,
  });
  const { skip, header, footer } = renderChrome({ config, page, appPagesAvailable: true, icons });

  return (
    <>
      <div dangerouslySetInnerHTML={{ __html: skip }} />
      <div dangerouslySetInnerHTML={{ __html: header }} />
      <div dangerouslySetInnerHTML={{ __html: body }} />
      <div dangerouslySetInnerHTML={{ __html: footer }} />
    </>
  );
}
