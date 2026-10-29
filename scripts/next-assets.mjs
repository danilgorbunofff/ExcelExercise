#!/usr/bin/env node
/**
 * Serves the static build's assets to the Next.js shell: `legacy/dist/assets` is copied to
 * `public/assets/` so `/assets/client/drill.js`, the grader modules, the fonts and the favicon all
 * resolve at the same URLs the legacy pages use. One copy, so there is nothing to keep in sync.
 *
 *   node scripts/next-assets.mjs      (npm run next:assets)
 */
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const from = join(ROOT, "legacy/dist/assets");
const to = join(ROOT, "public/assets");

if (!existsSync(from)) {
  console.error(`next:assets: ${from} is missing — run \`npm run build\` first (npm run next:build does it for you)`);
  process.exit(1);
}

rmSync(to, { recursive: true, force: true });
mkdirSync(to, { recursive: true });
cpSync(from, to, { recursive: true });
console.log("next:assets: copied legacy/dist/assets → public/assets");
