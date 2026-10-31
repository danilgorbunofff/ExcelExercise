/** Crawlers get every page, the sitemap is advertised at the origin the app was built for, and the
 *  two surfaces nobody should fetch are kept out: the JSON API (no page there, only JSON) and the
 *  certificate issue page (a personal URL that embeds a credential id). `/verify` stays open on
 *  purpose — it is where an employer checks a credential, and it is a page we want found.
 *
 *  The dashboard is *not* listed even though it is personal: it lives at `/learn`, it is served
 *  `noindex, follow`, and a `Disallow` would stop crawlers before they read that directive, which
 *  would let an already-indexed copy persist. Fetchable + noindex is the correct pairing; there is
 *  no `/dashboard` route to disallow. */
import { loadSite } from "../lib/site.js";

const { config } = loadSite();

export default function robots() {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/certificate"] }],
    sitemap: `${config.baseUrl}/sitemap.xml`,
  };
}
