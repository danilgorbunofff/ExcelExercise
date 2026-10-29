import { defineConfig, devices } from "@playwright/test";

/**
 * The browser suite for the ported shell. It runs against a real production build (`next start`),
 * not the dev server, because phase 0 acceptance is about what ships.
 *
 *   npm run e2e        # next:build, then this
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://127.0.0.1:4174",
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    // The static build is the other deployable. It used to be HTML-crawled only, so nothing
    // browser-only about it was ever executed; this project drives `legacy/dist` behind a plain
    // file server so the shipped static pages are proven in the same browser.
    {
      name: "static",
      testDir: "./e2e-static",
      use: { ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:4175" },
    },
  ],
  webServer: [
    {
      command: "npx next start -p 4174",
      url: "http://127.0.0.1:4174/api/health",
      // `npm run e2e` rebuilds first, so a server left over from an older build must not be reused:
      // it would serve stale HTML and the suite would bless code that no longer exists. Iterating
      // against a server you started yourself is opt-in.
      reuseExistingServer: Boolean(process.env.PW_REUSE_SERVER) && !process.env.CI,
      timeout: 120_000,
      stderr: "pipe",
    },
    {
      command: "node scripts/serve-static.mjs legacy/dist 4175",
      url: "http://127.0.0.1:4175/learn",
      // Always fresh: the server is a read of `legacy/dist`, which `next:build` rewrites.
      reuseExistingServer: false,
      timeout: 30_000,
      stderr: "pipe",
    },
  ],
});
