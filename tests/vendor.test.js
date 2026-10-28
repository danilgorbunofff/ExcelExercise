/**
 * `vendor/manifest.json` is the provenance record for every third-party byte in the
 * repository. This is what makes it more than documentation: the hashes are recomputed
 * here, and each failure mode is exercised against a throw-away copy of the tree.
 */

import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, it } from "node:test";

import { checkVendor, listVendorFiles, sha256 } from "../src/vendor-check.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const VENDOR = join(ROOT, "vendor");

const copies = [];
function copyVendor() {
  const dir = mkdtempSync(join(tmpdir(), "es-vendor-"));
  cpSync(VENDOR, dir, { recursive: true });
  copies.push(dir);
  return dir;
}

afterEach(() => {
  while (copies.length) rmSync(copies.pop(), { recursive: true, force: true });
});

describe("vendor manifest", () => {
  it("matches the bytes on disk", () => {
    const result = checkVendor();
    assert.deepEqual(result.problems, []);
    assert.equal(result.ok, true);
    assert.equal(result.checked, 25);
  });

  it("lists every file in vendor/ except the manifest itself", () => {
    const files = listVendorFiles(VENDOR);
    assert.equal(files.includes("manifest.json"), false);
    assert.equal(files.length, 25);
    assert.ok(files.every((file) => !file.split("/").some((part) => part.startsWith("."))));
    assert.deepEqual(files, [...files].sort());
  });

  it("records a hash that matches the file it names", () => {
    const manifest = JSON.parse(readFileSync(join(VENDOR, "manifest.json"), "utf8"));
    for (const [name, entry] of Object.entries(manifest.files)) {
      const bytes = readFileSync(join(VENDOR, name));
      assert.equal(entry.bytes, bytes.length, `${name}: byte count drifted`);
      assert.equal(entry.sha256, sha256(bytes), `${name}: hash drifted`);
      assert.ok(entry.url.startsWith("https://"), `${name}: no upstream URL`);
      assert.ok(entry.licence, `${name}: no licence id`);
    }
  });

  it("catches a modified file", () => {
    const dir = copyVendor();
    const target = join(dir, "icons/check.svg");
    writeFileSync(target, `${readFileSync(target, "utf8")}<!-- edited -->`);
    const problems = checkVendor({ vendorDir: dir }).problems;
    // Appending a byte changes both the size and the hash, and both should be reported.
    assert.ok(problems.some((problem) => /icons\/check\.svg: sha256 /.test(problem)), problems.join("\n"));
    assert.ok(checkVendor({ vendorDir: dir }).ok === false);
  });

  it("catches a file added without provenance", () => {
    const dir = copyVendor();
    writeFileSync(join(dir, "radix/orange.css"), ":root { --orange-9: red; }");
    const problems = checkVendor({ vendorDir: dir }).problems;
    assert.equal(problems.length, 1);
    assert.match(problems[0], /radix\/orange\.css: in vendor\/ but not in the manifest/);
  });

  it("catches a file that disappeared", () => {
    const dir = copyVendor();
    rmSync(join(dir, "fonts/newsreader-latin.woff2"));
    const problems = checkVendor({ vendorDir: dir }).problems;
    assert.equal(problems.length, 1);
    assert.match(problems[0], /missing on disk/);
  });

  it("catches an asset with no licence attached", () => {
    const dir = copyVendor();
    const path = join(dir, "manifest.json");
    const manifest = JSON.parse(readFileSync(path, "utf8"));
    delete manifest.files["icons/lock.svg"].licenceFile;
    writeFileSync(path, JSON.stringify(manifest));
    const problems = checkVendor({ vendorDir: dir }).problems;
    assert.equal(problems.length, 1);
    assert.match(problems[0], /icons\/lock\.svg: manifest entry has no licenceFile/);
  });

  it("refuses a manifest that is not there or not readable", () => {
    const dir = copyVendor();
    rmSync(join(dir, "manifest.json"));
    assert.match(checkVendor({ vendorDir: dir }).problems[0], /manifest\.json is missing/);

    const broken = copyVendor();
    writeFileSync(join(broken, "manifest.json"), "{");
    assert.match(checkVendor({ vendorDir: broken }).problems[0], /is not JSON/);

    const shapeless = copyVendor();
    writeFileSync(join(shapeless, "manifest.json"), '{"generatedAt":"2026-10-28"}');
    assert.match(checkVendor({ vendorDir: shapeless }).problems[0], /has no files map/);
  });
});
