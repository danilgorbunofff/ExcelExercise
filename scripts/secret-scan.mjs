/**
 * Scan the *build output* for secrets.
 *
 * A secret that reaches `public/`, `legacy/dist` or `.next/static` is public, whatever the README says
 * about it. Source files are not scanned: `.env` handling is the deploy's job, and a scanner that
 * greps the repository mostly reports its own fixtures. What is scanned is what a visitor can fetch.
 *
 * The shapes are the ones this stack actually uses: a Supabase service-role or secret key, a Stripe
 * secret key (`sk_live_` and `sk_test_` are both secrets — the test one still books real deliveries),
 * a webhook signing secret, and the `service_role` claim inside a JWT, which is the same key wearing
 * a base64 payload. The word `service_role` on its own is not a finding: it appears in policy files
 * and in sentences.
 *
 *   node scripts/secret-scan.mjs
 *   node scripts/secret-scan.mjs --root /tmp/build   # scan another tree (the tests do this)
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const args = process.argv.slice(2);
const rootArg = args.indexOf("--root");
const ROOT = resolve(rootArg === -1 ? join(import.meta.dirname, "..") : args[rootArg + 1]);
const TREES = ["public", "legacy/dist", ".next/static", ".next/server"];

/**
 * Each pattern is anchored on the value, not on the name, so a variable called `sk_live_…` in a test
 * fixture does not fire while a real key pasted into a template does.
 */
const PATTERNS = [
  {
    name: "supabase service-role key in an env assignment",
    pattern: /SUPABASE_(SERVICE_ROLE|SECRET)_KEY\s*[=:]\s*["']?(eyJ[A-Za-z0-9_-]{10,}|sb_secret_[A-Za-z0-9_-]{10,})/g,
  },
  {
    name: "supabase secret key literal",
    pattern: /\bsb_secret_[A-Za-z0-9_-]{20,}/g,
  },
  {
    name: "stripe secret key",
    pattern: /\bsk_(live|test)_[A-Za-z0-9]{16,}/g,
  },
  {
    name: "stripe webhook signing secret",
    pattern: /\bwhsec_[A-Za-z0-9]{16,}/g,
  },
  {
    name: "JWT carrying the service_role claim",
    pattern: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]*c2VydmljZV9yb2xl[A-Za-z0-9_-]*\.[A-Za-z0-9_-]{10,}/g,
  },
];

const IGNORED = new Set(["node_modules", ".git"]);

function walk(dir, found = []) {
  if (!existsSync(dir)) return found;
  for (const name of readdirSync(dir)) {
    if (IGNORED.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      walk(path, found);
      continue;
    }
    // Source maps and binaries are not fetched by a browser; they are also where minified identifiers
    // would produce the most false positives.
    if (/\.(map|png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf|zip|xlsx?)$/i.test(name)) continue;
    found.push(path);
  }
  return found;
}

const files = TREES.flatMap((tree) => walk(join(ROOT, tree)));

if (files.length === 0) {
  console.error(`No build output under ${TREES.join(", ")}. Run \`npm run build\` and \`npm run next:build\`.`);
  process.exit(2);
}

const findings = [];
for (const file of files) {
  const text = readFileSync(file, "latin1");
  for (const { name, pattern } of PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      // Never print the secret itself: this output goes into CI logs.
      findings.push(`${relative(ROOT, file)}: ${name} (${match[0].slice(0, 6)}…)`);
    }
  }
}

console.log(`secret-scan: ${files.length} build-output files under ${TREES.join(", ")}`);

if (findings.length > 0) {
  for (const finding of findings) console.error(`  ${finding}`);
  console.error(`\nsecret-scan: ${findings.length} finding(s). A value here is downloadable by anyone.`);
  process.exit(1);
}

console.log("secret-scan: no service-role key, Stripe secret or webhook signing secret in the build");
