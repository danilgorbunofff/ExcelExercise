import { notFound } from "next/navigation";

import { prepareArticlePage } from "../../../legacy/src/site/article-page.mjs";
import { renderChrome } from "../../../legacy/src/site/shell.mjs";

import { loadSite } from "../../../lib/site.js";

const { config, track, index, icons, articles, formulas, entryFor, articleFor, articleDrillAvailable } =
  loadSite();

// Same reasoning as `app/learn/groups/[group]/page.js`: an unknown slug falls through to notFound()
// rather than being prerendered, so a deleted note is a 404 and not a stale page.
export function generateStaticParams() {
  return articles.map((article) => ({ slug: article.slug }));
}

import { socialImage, socialTwitter } from "../../../lib/social.js";

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const article = articleFor(slug);
  if (!article) return {};
  const { page } = prepareArticlePage({
    config,
    track,
    index,
    articles,
    formulas,
    article,
    entry: entryFor(article.exercise),
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

export default async function Note({ params }) {
  const { slug } = await params;
  const article = articleFor(slug);
  if (!article) notFound();

  const { body, page } = prepareArticlePage({
    config,
    track,
    index,
    articles,
    formulas,
    article,
    entry: entryFor(article.exercise),
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
