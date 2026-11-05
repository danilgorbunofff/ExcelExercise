import { prepareStartPage } from "../../legacy/src/site/start-page.mjs";
import { renderChrome } from "../../legacy/src/site/shell.mjs";

import { loadSite } from "../../lib/site.js";
import { socialImage, socialTwitter } from "../../lib/social.js";

const { config, track, index, icons } = loadSite();

const { page: meta } = prepareStartPage({ config, track, index, icons });

// Indexed, unlike `/pricing`: a reader who searches for free Excel exercises is the reader this page is
// written for, and the ten it lists need no account to open.
export const metadata = {
  title: { absolute: `${meta.title} · ${config.name}` },
  description: meta.description,
  alternates: { canonical: meta.path },
  openGraph: {
    type: "article",
    siteName: config.name,
    title: meta.title,
    description: meta.description,
    url: meta.path,
    images: [socialImage({ path: meta.path, title: meta.title })],
  },
  twitter: socialTwitter({ path: meta.path, title: meta.title }),
};

export default function Start() {
  const { body, page } = prepareStartPage({
    config,
    track,
    index,
    icons,
    projectsAvailable: true,
    appPagesAvailable: true,
  });
  const { skip, header, footer } = renderChrome({ config, page, appPagesAvailable: true, icons });

  return (
    <>
      <div dangerouslySetInnerHTML={{ __html: skip }} />
      <div dangerouslySetInnerHTML={{ __html: header }} />
      <div dangerouslySetInnerHTML={{ __html: body }} />
      <div dangerouslySetInnerHTML={{ __html: footer }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: page.jsonLd }} />
    </>
  );
}
