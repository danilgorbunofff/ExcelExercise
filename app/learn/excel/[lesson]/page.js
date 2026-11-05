import { notFound } from "next/navigation";

import { prepareExercisePage } from "../../../../legacy/src/site/exercise-page.mjs";
import { renderChrome } from "../../../../legacy/src/site/shell.mjs";

import { loadSite } from "../../../../lib/site.js";
import { stripeConfig } from "../../../../lib/stripe.js";
import { socialImage, socialTwitter } from "../../../../lib/social.js";

const { config, track, index, icons, clientAvailable, articles, entryFor } = loadSite();

// A preread fact, like the pricing page's: the gate's buy button is baked with the page, so adding
// the Stripe key is a rebuild, not just a restart. `docs/ops/deploy.md` says so.
const checkout = { enabled: stripeConfig().enabled };

// `dynamicParams = false` is unavailable under `cacheComponents`; an unknown slug falls through to
// notFound() instead, which is the same 404 for a reader.
export function generateStaticParams() {
  return index.map((entry) => ({ lesson: entry.slug }));
}

export async function generateMetadata({ params }) {
  const entry = entryFor((await params).lesson);
  if (!entry) return {};
  const { page } = prepareExercisePage({ config, track, index, entry, icons, clientAvailable, articles });
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
      images: [socialImage({ path: page.path, title: page.title })],
    },
    twitter: socialTwitter({ path: page.path, title: page.title }),
  };
}

export default async function Lesson({ params }) {
  const entry = entryFor((await params).lesson);
  if (!entry) notFound();

  const { body, page } = prepareExercisePage({ config, track, index, entry, icons, clientAvailable, articles, checkout });
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
