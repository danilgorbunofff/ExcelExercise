import { notFound } from "next/navigation";

import { prepareShortcutPage } from "../../../legacy/src/site/shortcut-page.mjs";
import { renderChrome } from "../../../legacy/src/site/shell.mjs";

import { loadSite } from "../../../lib/site.js";
import { socialImage, socialTwitter } from "../../../lib/social.js";

const { config, track, index, icons, shortcuts, shortcutFor, clientAvailable } = loadSite();

// Same reasoning as `app/formulas/[slug]/page.js`: an unknown slug is a 404 rather than a prerendered
// page, so a retired family cannot keep answering.
export function generateStaticParams() {
  return shortcuts.map((shortcut) => ({ slug: shortcut.slug }));
}

// The platform is a client-side choice on both builds, so every page prerenders with the Windows
// column visible and the script moves the highlight and the canonical. Reading `searchParams` here
// would make the route dynamic and each tabbed state a distinct render, which is the one thing the
// two builds' HTML is compared on.
const args = (shortcut) => ({
  config,
  track,
  index,
  shortcuts,
  shortcut,
  icons,
  lessonBase: "/learn/excel",
  clientAvailable,
});

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const shortcut = shortcutFor(slug);
  if (!shortcut) return {};
  const { page } = prepareShortcutPage(args(shortcut));
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

export default async function Shortcut({ params }) {
  const { slug } = await params;
  const shortcut = shortcutFor(slug);
  if (!shortcut) notFound();

  const { body, page } = prepareShortcutPage(args(shortcut));
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
