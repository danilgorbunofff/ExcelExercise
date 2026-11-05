import { prepareAboutPage } from "../../legacy/src/site/hub-page.mjs";
import { renderChrome } from "../../legacy/src/site/shell.mjs";

import { loadSite } from "../../lib/site.js";
import { socialImage, socialTwitter } from "../../lib/social.js";

const { config, track, index, icons } = loadSite();

const { page: meta } = prepareAboutPage({ config, track, index });

export const metadata = {
  title: { absolute: "About · " + config.name },
  description: meta.description,
  alternates: { canonical: meta.path },
  openGraph: {
    type: "website",
    siteName: config.name,
    title: meta.title,
    description: meta.description,
    url: meta.path,
    images: [socialImage({ path: meta.path, title: meta.title })],
  },
  twitter: socialTwitter({ path: meta.path, title: meta.title }),
};

export default function About() {
  const { body, page } = prepareAboutPage({ config, track, index });
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
