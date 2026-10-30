import { prepareLegalPage } from "../../legacy/src/site/legal-page.mjs";
import { renderChrome } from "../../legacy/src/site/shell.mjs";

import { loadSite } from "../../lib/site.js";

const { config, track, index, icons } = loadSite();
// Called once at module scope so the metadata and the markup can never describe different documents.
const { page } = prepareLegalPage({ config, track, index, icons, kind: "privacy" });

// Indexable on purpose, and listed in `app/sitemap.js`: what this site stores, and what it does not, is the page a reader looks for before signing up,
// and the cookie stance is only checkable if it is findable.
export const metadata = {
  title: { absolute: `${page.title} — ${config.name}` },
  description: page.description,
  alternates: { canonical: page.path },
  openGraph: {
    type: "article",
    siteName: config.name,
    title: page.title,
    description: page.description,
    url: page.path,
  },
  twitter: { card: "summary" },
};

export default function Privacy() {
  const { body } = prepareLegalPage({ config, track, index, icons, kind: "privacy" });
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
