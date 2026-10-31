import { defineConfig, devices } from "@playwright/test";

import { stack } from "./tests/db/harness.mjs";

/**
 * The accounts suite is opt-in and self-skipping.
 *
 * It needs a real GoTrue and a real Postgres, so it cannot be part of the default run: CI has neither
 * unless it starts the stack. `PW_ACCOUNTS=1` turns it on, and a stack that is not running is a named
 * failure rather than a silent skip — a suite that quietly does not run is the bug this file is
 * trying to avoid.
 */
const ACCOUNTS = process.env.PW_ACCOUNTS === "1";

function accountsStack() {
  try {
    return stack();
  } catch (error) {
    throw new Error(`PW_ACCOUNTS=1 needs the local Supabase stack: ${error.message}`);
  }
}

const accountsEnv = ACCOUNTS ? accountsStack() : null;

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
    // The engine-specific risk is narrow and worth naming: `drill.spec.js` types into the formula
    // input and reads the verdict the grader wrote, and `keyboard.spec.js` is focus order and keys.
    // Those are where an engine disagrees about selection, composition or focus. The other specs are
    // markup, routing and the static crawl, which no engine answers differently, so they stay on one
    // browser rather than multiplying the suite by three.
    {
      name: "firefox",
      testMatch: ["**/drill.spec.js", "**/keyboard.spec.js"],
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit",
      testMatch: ["**/drill.spec.js", "**/keyboard.spec.js"],
      use: { ...devices["Desktop Safari"] },
    },
    // The static build is the other deployable. It used to be HTML-crawled only, so nothing
    // browser-only about it was ever executed; this project drives `legacy/dist` behind a plain
    // file server so the shipped static pages are proven in the same browser.
    // The one project whose pages cannot be prerendered: everything it asserts depends on a session
    // in the database. Same build, different environment — which is itself the claim, since a
    // deployment is one image with accounts switched on or off.
    ...(ACCOUNTS
      ? [
          {
            name: "accounts",
            testDir: "./e2e-accounts",
            // Serial: `resetFixtures()` empties tables for every spec, so two workers would delete each
            // other's rows halfway through an assertion.
            fullyParallel: false,
            workers: 1,
            use: { ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:4176" },
          },
        ]
      : []),
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
    ...(ACCOUNTS
      ? [
          {
            command: "npx next start -p 4176",
            url: "http://127.0.0.1:4176/api/health",
            reuseExistingServer: Boolean(process.env.PW_REUSE_SERVER) && !process.env.CI,
            timeout: 120_000,
            stderr: "pipe",
            env: {
              // The local stack's own credentials, read at run time: nothing is written to disk.
              NEXT_PUBLIC_SUPABASE_URL: accountsEnv.api,
              NEXT_PUBLIC_SUPABASE_ANON_KEY: accountsEnv.anon,
              SUPABASE_SERVICE_ROLE_KEY: accountsEnv.service,
              // The webhook's secret is ours to invent: the tests sign their own payloads.
              STRIPE_WEBHOOK_SECRET: "whsec_local_accounts",
              STRIPE_SECRET_KEY: "sk_test_local_accounts",
              // Enforcement on, so a gated drill is refused by the request and not only by the browser.
              PAYWALL: "on",
            },
          },
        ]
      : []),
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
