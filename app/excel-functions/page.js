import { prepareFunctionsHub } from "../../legacy/src/site/article-page.mjs";
import { renderChrome } from "../../legacy/src/site/shell.mjs";

import { loadSite } from "../../lib/site.js";

const { config, track, index, icons, articles } = loadSite();

const { page: meta } = prepareFunctionsHub({ config, track, index, articles, icons });

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
  },
  twitter: { card: "summary" },
};

export default function Functions() {
  const { body, page } = prepareFunctionsHub({ config, track, index, articles, icons });
  const { skip, header, footer } = renderChrome({ config, page });

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
