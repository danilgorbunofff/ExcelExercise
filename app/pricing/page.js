import { preparePricingPage } from "../../legacy/src/site/pricing-page.mjs";
import { renderChrome } from "../../legacy/src/site/shell.mjs";

import { loadSite } from "../../lib/site.js";
import { stripeConfig } from "../../lib/stripe.js";
import { socialImage, socialTwitter } from "../../lib/social.js";

const { config, track, index, icons } = loadSite();
// Whether this build can take money. Read once, at build time, so the static page and the Next page
// cannot disagree about which offer they show.
const checkout = stripeConfig();
// Called once at module scope so the metadata and the markup can never describe different offers.
const { page } = preparePricingPage({ config, track, index, icons, checkout });

// The offer the exercise's wall links to. Out of the sitemap and `noindex` on purpose: the track index
// is the page search engines should land on, and a price page must not compete with it.

export const metadata = {
  title: { absolute: `${page.title} · ${config.name}` },
  description: page.description,
  alternates: { canonical: page.path },
  robots: { index: false, follow: true },
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

export default function Pricing() {
  const { body } = preparePricingPage({ config, track, index, icons, checkout });
  const { skip, header, footer } = renderChrome({ config, page, appPagesAvailable: true, icons });

  return (
    <>
      <div dangerouslySetInnerHTML={{ __html: skip }} />
      <div dangerouslySetInnerHTML={{ __html: header }} />
      <div dangerouslySetInnerHTML={{ __html: body }} />
      <div dangerouslySetInnerHTML={{ __html: footer }} />
    </>
  );
}
