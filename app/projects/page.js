import { prepareProjectsPage } from "../../legacy/src/site/projects.mjs";
import { renderChrome } from "../../legacy/src/site/shell.mjs";

import { loadProjectTrack } from "../../lib/projects.js";
import { loadSite } from "../../lib/site.js";

const { config } = loadSite();
const { track, index } = loadProjectTrack();
const { page } = prepareProjectsPage({ track, index });

export const metadata = {
  title: track.title,
  description: track.promise,
  alternates: { canonical: page.path },
  openGraph: {
    type: "website",
    siteName: config.name,
    title: track.title,
    description: track.promise,
    url: page.path,
  },
  twitter: { card: "summary" },
};

export default function Projects() {
  const { body } = prepareProjectsPage({ track, index });
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
