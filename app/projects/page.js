import { prepareProjectsPage } from "../../legacy/src/site/projects.mjs";
import { renderChrome } from "../../legacy/src/site/shell.mjs";

import { loadProjectTrack } from "../../lib/projects.js";
import { loadSite } from "../../lib/site.js";
import { socialImage, socialTwitter } from "../../lib/social.js";

const { config, icons } = loadSite();
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
    images: [socialImage({ path: page.path, title: track.title })],
  },
  twitter: socialTwitter({ path: page.path, title: track.title }),
};

export default function Projects() {
  const { body } = prepareProjectsPage({ track, index });
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
