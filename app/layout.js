import "./globals.css";

import { loadSite } from "../lib/site.js";

const { config } = loadSite();

export const metadata = {
  metadataBase: new URL(config.baseUrl),
  title: { default: config.name, template: `%s — ${config.name}` },
  description: "Zero-signup, in-browser Excel practice drills with deterministic grading.",
  other: { "color-scheme": "light" },
  icons: { icon: [{ url: "/assets/favicon.svg", type: "image/svg+xml" }] },
};

export default function RootLayout({ children }) {
  return (
    <html lang={config.inLanguage}>
      <head>
        <link rel="preload" href="/assets/fonts/plex-sans-latin.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/assets/fonts/newsreader-latin.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      </head>
      {/* `body.lesson` / `body.track` exist in the legacy markup but no rule selects on them. */}
      <body className="light">{children}</body>
    </html>
  );
}
