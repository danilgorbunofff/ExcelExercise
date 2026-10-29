/** Crawlers get everything, and the sitemap is advertised at the origin the app was built for. */
import { loadSite } from "../lib/site.js";

const { config } = loadSite();

export default function robots() {
  return {
    rules: [{ userAgent: "*", allow: "/" }],
    sitemap: `${config.baseUrl}/sitemap.xml`,
  };
}
