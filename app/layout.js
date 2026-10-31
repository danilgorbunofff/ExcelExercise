import "./globals.css";

import ProgressSender from "./progress-sender.js";
import { loadSite } from "../lib/site.js";

const { config } = loadSite();

export const metadata = {
  metadataBase: new URL(config.baseUrl),
  title: { default: config.name, template: `%s · ${config.name}` },
  description: "Zero-signup, in-browser Excel practice drills with deterministic grading.",
  other: { "color-scheme": "light dark" },
  icons: { icon: [{ url: "/assets/favicon.svg", type: "image/svg+xml" }] },
};

/** `themeColor` moved out of `metadata` in Next 14; the light/dark pair is the same one the static
 *  head writes from `config.themeColor`, so the mobile browser bar matches the page in both themes. */
export const viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: config.themeColor.light },
    { media: "(prefers-color-scheme: dark)", color: config.themeColor.dark },
  ],
};

export default function RootLayout({ children }) {
  return (
    <html lang={config.inLanguage}>
      <head>
        <link rel="preload" href="/assets/fonts/plex-sans-latin.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/assets/fonts/newsreader-latin.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      </head>
      {/* `body.lesson` / `body.track` exist in the legacy markup but no rule selects on them. */}
      <body className="light">
        {children}
        {/* The footer's feedback dialog is React-inserted markup, so its script cannot ride along in
            the fragment: a script set through innerHTML never runs. */}
        <script type="module" src="/assets/client/feedback.js" />
        {/* The drill's event buffer is the browser's record of what happened; this posts it. Inert on
            a deployment without accounts (the API refuses, and the sender stops there). */}
        <ProgressSender />
      </body>
    </html>
  );
}
