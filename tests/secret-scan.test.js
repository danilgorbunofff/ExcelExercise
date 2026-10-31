/**
 * The build-output secret scan. A key that ships in `legacy/dist` or `.next/static` is downloadable by
 * anyone, so the scanner has to fire on a planted value and stay quiet on a clean tree.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const SCRIPT = join(import.meta.dirname, "..", "scripts", "secret-scan.mjs");

const run = (root) => spawnSync(process.execPath, [SCRIPT, "--root", root], { encoding: "utf8" });

function tree(files) {
  const root = mkdtempSync(join(tmpdir(), "es-secret-"));
  mkdirSync(join(root, "public", "assets"), { recursive: true });
  mkdirSync(join(root, ".next", "static", "chunks"), { recursive: true });
  writeFileSync(join(root, "public", "assets", "clean.js"), "export const answer = 42;\n");
  for (const [path, body] of Object.entries(files)) writeFileSync(join(root, path), body);
  return root;
}

test("a planted Stripe secret in the build is a finding, and the value is not echoed", () => {
  // Assembled at runtime, never a literal: a live-looking key in the file text is what GitHub's
  // push protection blocks, and the scanner still has to fire on the value the fixture plants.
  const key = ["sk", "live", "51NxAbCdEfGhIjKlMnOpQrSt"].join("_");
  const root = tree({ ".next/static/chunks/page.js": `const c=window.c||"${key}";` });
  try {
    const result = run(root);
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stderr, /\.next\/static\/chunks\/page\.js: stripe secret key \(sk_liv…\)/);
    assert.ok(!result.stderr.includes(key), "the scan printed the secret it found");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a service-role JWT in a served bundle is a finding", () => {
  // The claim is what makes it a service-role key: `{"role":"service_role"}` base64url-encoded.
  const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.c2lnbmF0dXJlLXZhbHVl";
  const root = tree({ "public/assets/env.js": `window.supabaseKey="${jwt}";` });
  try {
    const result = run(root);
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stderr, /service_role claim|supabase service-role/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a clean build passes, and the word service_role alone is not a finding", () => {
  const root = tree({
    "public/assets/notes.js": 'const policy = "service_role is granted select on attempts";\n',
  });
  try {
    const result = run(root);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /no service-role key, Stripe secret or webhook signing secret/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a tree with no build output is an error, not a pass", () => {
  const root = mkdtempSync(join(tmpdir(), "es-secret-empty-"));
  try {
    const result = run(root);
    assert.equal(result.status, 2, result.stdout);
    assert.match(result.stderr, /No build output/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
