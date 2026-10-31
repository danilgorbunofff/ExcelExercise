import { notFound } from "next/navigation";

import { prepareExercisePage } from "../../../../legacy/src/site/exercise-page.mjs";
import { renderChrome } from "../../../../legacy/src/site/shell.mjs";

import { loadProjectTrack } from "../../../../lib/projects.js";
import { loadSite } from "../../../../lib/site.js";

const { config, icons, clientAvailable } = loadSite();
const { track, index, entryFor } = loadProjectTrack();

// `dynamicParams = false` is unavailable under `cacheComponents`; an unknown slug falls through to
// notFound() instead, which is the same 404 for a reader.
export function generateStaticParams() {
  return index.map((entry) => ({ slug: entry.slug }));
}

export async function generateMetadata({ params }) {
  const entry = entryFor((await params).slug);
  if (!entry) return {};
  const { page } = prepareExercisePage({ config, track, index, entry, icons, clientAvailable });
  return {
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
}

export default async function Project({ params }) {
  const entry = entryFor((await params).slug);
  if (!entry) notFound();

  const { body, page } = prepareExercisePage({ config, track, index, entry, icons, clientAvailable });
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
