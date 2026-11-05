import { prepareSearchPage } from "../../legacy/src/site/search-page.mjs";
import { renderChrome } from "../../legacy/src/site/shell.mjs";

import { loadSite } from "../../lib/site.js";
import { socialImage, socialTwitter } from "../../lib/social.js";

const { config, track, index, icons, articles } = loadSite();

const { page: meta, indexJson } = prepareSearchPage({ config, track, index, articles, appPagesAvailable: true });

export const metadata = {
  title: { absolute: "Search the exercises · " + config.name },
  description: meta.description,
  alternates: { canonical: meta.path },
  openGraph: {
    type: "website",
    siteName: config.name,
    title: "Search the exercises",
    description: meta.description,
    url: meta.path,
    images: [socialImage({ path: meta.path, title: "Search the exercises" })],
  },
  twitter: socialTwitter({ path: meta.path, title: "Search the exercises" }),
};

export default function Search() {
  const { body, page } = prepareSearchPage({ config, track, index, articles, icons, appPagesAvailable: true });
  const { skip, header, footer } = renderChrome({ config, page, appPagesAvailable: true, icons });

  return (
    <>
      <div dangerouslySetInnerHTML={{ __html: skip }} />
      <div dangerouslySetInnerHTML={{ __html: header }} />
      <div dangerouslySetInnerHTML={{ __html: body }} />
      <div dangerouslySetInnerHTML={{ __html: footer }} />
      <div dangerouslySetInnerHTML={{ __html: indexJson }} />
      {/* eslint-disable-next-line @next/next/no-sync-scripts */}
      <script type="module" src="/assets/client/search.js"></script>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: page.jsonLd }} />
    </>
  );
}
