import { prepareIndexPage } from "../legacy/src/site/index-page.mjs";
import { renderChrome } from "../legacy/src/site/shell.mjs";

import { loadSite } from "../lib/site.js";
import { socialImage, socialTwitter } from "../lib/social.js";

const { config, track, index, icons, clientAvailable } = loadSite();

export const metadata = {
  title: { absolute: `${config.name} · ${track.title}` },
  description: track.promise,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: config.name,
    title: track.title,
    description: track.promise,
    url: "/",
    images: [socialImage({ path: "/", title: track.title })],
  },
  twitter: socialTwitter({ path: "/", title: track.title }),
};

export default function Home() {
  const { body, page } = prepareIndexPage({
    config,
    track,
    index,
    icons,
    clientAvailable,
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
