#!/usr/bin/env node
/**
 * Recomputes every hash in `vendor/manifest.json` and fails on any drift. A vendored
 * dependency is only "pinned" if something checks the bytes; this is that something,
 * and it is also the guard against a file being added to `vendor/` with no provenance.
 *
 *   node src/vendor-check.mjs
 *   node src/vendor-check.mjs --json
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const MANIFEST_NAME = "manifest.json";
const REQUIRED_FIELDS = ["url", "sha256", "bytes", "licence", "added"];

export function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

/** Every file under `dir`, as posix-style paths relative to it, manifest excluded. */
export function listVendorFiles(dir, base = dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listVendorFiles(path, base));
    } else if (entry.name !== MANIFEST_NAME) {
      files.push(relative(base, path).split(sep).join("/"));
    }
  }
  return files.sort();
}

/**
 * Returns `{ ok, checked, problems }`. Problems are strings, because the only thing
 * that ever reads them is a human looking at a failed build or a failed test.
 */
export function checkVendor({ vendorDir = join(ROOT, "vendor") } = {}) {
  const manifestPath = join(vendorDir, MANIFEST_NAME);
  if (!existsSync(manifestPath)) {
    return { ok: false, checked: 0, problems: [`${MANIFEST_NAME} is missing`] };
  }

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (error) {
    return { ok: false, checked: 0, problems: [`${MANIFEST_NAME} is not JSON: ${error.message}`] };
  }
  if (typeof manifest.files !== "object" || manifest.files === null) {
    return { ok: false, checked: 0, problems: [`${MANIFEST_NAME} has no files map`] };
  }

  const problems = [];
  const listed = new Set(Object.keys(manifest.files));

  for (const [name, entry] of Object.entries(manifest.files)) {
    for (const field of REQUIRED_FIELDS) {
      if (!entry?.[field]) problems.push(`${name}: manifest entry has no ${field}`);
    }
    const path = join(vendorDir, name);
    if (!existsSync(path)) {
      problems.push(`${name}: listed in the manifest but missing on disk`);
      continue;
    }
    // Compare only against fields that are actually present: one missing field is one
    // problem, not the same problem restated three times at the caller.
    const bytes = statSync(path).size;
    if (typeof entry?.bytes === "number" && bytes !== entry.bytes) {
      problems.push(`${name}: ${bytes} bytes on disk, ${entry.bytes} in the manifest`);
    }
    const actual = sha256(readFileSync(path));
    if (typeof entry?.sha256 === "string" && actual !== entry.sha256) {
      problems.push(`${name}: sha256 ${actual} does not match the manifest`);
    }
    // Asset entries point at their licence text; the licence texts themselves are the files.
    if (entry?.licenceFile === undefined && !name.startsWith("licenses/")) {
      problems.push(`${name}: manifest entry has no licenceFile`);
    }
    if (entry?.licenceFile) {
      const licencePath = join(vendorDir, entry.licenceFile);
      if (!existsSync(licencePath)) problems.push(`${name}: licence text ${entry.licenceFile} is missing`);
      else if (!listed.has(entry.licenceFile)) problems.push(`${name}: licence text ${entry.licenceFile} is not in the manifest`);
    }
  }

  for (const name of listVendorFiles(vendorDir)) {
    if (!listed.has(name)) problems.push(`${name}: in vendor/ but not in the manifest`);
  }

  return { ok: problems.length === 0, checked: listed.size, problems };
}

/** True when this file is the script node was asked to run, symlinked paths included. */
function invokedDirectly() {
  if (process.argv[1] === undefined) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (invokedDirectly()) {
  const result = checkVendor();
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(result, null, 2));
  } else if (result.ok) {
    console.log(`vendor: ${result.checked} files match ${MANIFEST_NAME}`);
  } else {
    console.error(`vendor: ${result.problems.length} problem${result.problems.length === 1 ? "" : "s"}`);
    for (const problem of result.problems) console.error(`  ${problem}`);
  }
  if (!result.ok) process.exitCode = 1;
}

export { ROOT };
