import { prepareExercisesHub } from "../../legacy/src/site/hub-page.mjs";
import { renderChrome } from "../../legacy/src/site/shell.mjs";

import { loadSite } from "../../lib/site.js";

const { config, track, index, icons } = loadSite();

const { page: meta } = prepareExercisesHub({ config, track, index, icons });

export const metadata = {
  title: { absolute: "Excel exercises · " + config.name },
  description: meta.description,
  alternates: { canonical: meta.path },
  openGraph: {
    type: "website",
    siteName: config.name,
    title: meta.title,
    description: meta.description,
    url: meta.path,
  },
  twitter: { card: "summary" },
};

export default function Exercises() {
  const { body, page } = prepareExercisesHub({
    config,
    track,
    index,
    icons,
    projectsAvailable: true,
    appPagesAvailable: true,
  });
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
