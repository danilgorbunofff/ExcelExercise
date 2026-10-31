import { prepareLegalPage } from "../../legacy/src/site/legal-page.mjs";
import { renderChrome } from "../../legacy/src/site/shell.mjs";

import { loadSite } from "../../lib/site.js";

const { config, track, index, icons } = loadSite();
// Called once at module scope so the metadata and the markup can never describe different documents.
const { page } = prepareLegalPage({ config, track, index, icons, kind: "terms" });

// Indexable on purpose, and listed in `app/sitemap.js`: the refund guarantee and the limits of a grader are terms a reader is entitled to read before
// paying, so the page is not a modal and not a footnote.
export const metadata = {
  title: { absolute: `${page.title} · ${config.name}` },
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

export default function Terms() {
  const { body } = prepareLegalPage({ config, track, index, icons, kind: "terms" });
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
