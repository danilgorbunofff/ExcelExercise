import { prepareShortcutsHub } from "../../legacy/src/site/shortcut-page.mjs";
import { renderChrome } from "../../legacy/src/site/shell.mjs";

import { loadSite } from "../../lib/site.js";
import { socialImage, socialTwitter } from "../../lib/social.js";

const { config, track, index, icons, shortcuts, clientAvailable } = loadSite();

const { page: meta } = prepareShortcutsHub({ config, track, index, shortcuts, icons, clientAvailable });

export const metadata = {
  title: { absolute: "Excel keyboard shortcuts, by family · " + config.name },
  description: meta.description,
  alternates: { canonical: meta.path },
  openGraph: {
    type: "website",
    siteName: config.name,
    title: "Excel keyboard shortcuts, by family",
    description: meta.description,
    url: meta.path,
    images: [socialImage({ path: meta.path, title: "Excel keyboard shortcuts, by family" })],
  },
  twitter: socialTwitter({ path: meta.path, title: "Excel keyboard shortcuts, by family" }),
};

export default function Shortcuts() {
  const { body, page } = prepareShortcutsHub({ config, track, index, shortcuts, icons, clientAvailable });
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
