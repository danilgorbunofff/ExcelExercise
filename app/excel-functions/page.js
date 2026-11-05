import { prepareFunctionsHub } from "../../legacy/src/site/article-page.mjs";
import { renderChrome } from "../../legacy/src/site/shell.mjs";

import { loadSite } from "../../lib/site.js";
import { socialImage, socialTwitter } from "../../lib/social.js";

const { config, track, index, icons, articles, formulas } = loadSite();

const { page: meta } = prepareFunctionsHub({ config, track, index, articles, formulas, icons });

export const metadata = {
  title: { absolute: "Excel functions, explained in plain words · " + config.name },
  description: meta.description,
  alternates: { canonical: meta.path },
  openGraph: {
    type: "website",
    siteName: config.name,
    title: "Excel functions, explained in plain words",
    description: meta.description,
    url: meta.path,
    images: [socialImage({ path: meta.path, title: "Excel functions, explained in plain words" })],
  },
  twitter: socialTwitter({ path: meta.path, title: "Excel functions, explained in plain words" }),
};

export default function Functions() {
  const { body, page } = prepareFunctionsHub({ config, track, index, articles, formulas, icons });
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
