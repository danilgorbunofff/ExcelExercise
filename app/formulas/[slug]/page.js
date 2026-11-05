import { notFound } from "next/navigation";

import { prepareFormulaPage } from "../../../legacy/src/site/formula-page.mjs";
import { renderChrome } from "../../../legacy/src/site/shell.mjs";

import { loadSite } from "../../../lib/site.js";
import { socialImage, socialTwitter } from "../../../lib/social.js";

const { config, track, index, icons, articles, formulas, formulaFor, articleDrillAvailable } = loadSite();

// Same reasoning as `app/excel-functions/[slug]/page.js`: an unknown slug falls through to notFound()
// rather than being prerendered, so a removed problem page is a 404 and not a stale answer.
export function generateStaticParams() {
  return formulas.map((formula) => ({ slug: formula.slug }));
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const formula = formulaFor(slug);
  if (!formula) return {};
  const { page } = prepareFormulaPage({
    config,
    track,
    index,
    articles,
    formulas,
    formula,
    clientAvailable: articleDrillAvailable,
  });
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
      modifiedTime: page.updated,
      images: [socialImage({ path: page.path, title: page.title })],
    },
    twitter: socialTwitter({ path: page.path, title: page.title }),
  };
}

export default async function Formula({ params }) {
  const { slug } = await params;
  const formula = formulaFor(slug);
  if (!formula) notFound();

  const { body, page } = prepareFormulaPage({
    config,
    track,
    index,
    articles,
    formulas,
    formula,
    clientAvailable: articleDrillAvailable,
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
