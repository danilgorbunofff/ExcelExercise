import { notFound } from "next/navigation";

import { dashboardGroups, prepareDashboardPage } from "../../../../legacy/src/site/dashboard-page.mjs";
import { renderChrome } from "../../../../legacy/src/site/shell.mjs";

import { loadSite } from "../../../../lib/site.js";

const { config, track, index, icons, dashboardAvailable } = loadSite();
const groupIds = dashboardGroups({ track, index }).map((group) => group.id);

// `dynamicParams = false` is unavailable under `cacheComponents`; an unknown group falls through to
// notFound() instead, which is the same 404 for a reader.
export function generateStaticParams() {
  return groupIds.map((group) => ({ group }));
}

export async function generateMetadata({ params }) {
  const { group } = await params;
  if (!groupIds.includes(group)) return {};
  const { page } = prepareDashboardPage({ config, track, index, icons, clientAvailable: dashboardAvailable, group });
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

export default async function Group({ params }) {
  const { group } = await params;
  if (!groupIds.includes(group)) notFound();

  const { body, page } = prepareDashboardPage({
    config,
    track,
    index,
    icons,
    clientAvailable: dashboardAvailable,
    group,
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
