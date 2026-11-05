import { prepareFormulasHub } from "../../legacy/src/site/formula-page.mjs";
import { renderChrome } from "../../legacy/src/site/shell.mjs";

import { loadSite } from "../../lib/site.js";
import { socialImage, socialTwitter } from "../../lib/social.js";

const { config, track, index, icons, articles, formulas } = loadSite();

const { page: meta } = prepareFormulasHub({ config, track, index, articles, formulas, icons });

export const metadata = {
  title: { absolute: "Excel problems, answered with one formula · " + config.name },
  description: meta.description,
  alternates: { canonical: meta.path },
  openGraph: {
    type: "website",
    siteName: config.name,
    title: "Excel problems, answered with one formula",
    description: meta.description,
    url: meta.path,
    images: [socialImage({ path: meta.path, title: "Excel problems, answered with one formula" })],
  },
  twitter: socialTwitter({ path: meta.path, title: "Excel problems, answered with one formula" }),
};

export default function Formulas() {
  const { body, page } = prepareFormulasHub({ config, track, index, articles, formulas, icons });
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
