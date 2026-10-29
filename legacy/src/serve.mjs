#!/usr/bin/env node
/**
 * A static dev server for `dist/`. It exists so the pages can be opened at the URLs
 * they will really live at — /excel/sum-basics, not /excel/sum-basics.html — and it
 * refuses to serve anything outside `dist/`.
 *
 *   node src/serve.mjs            # http://localhost:4173
 *   PORT=5000 node src/serve.mjs
 */

import { createReadStream, existsSync, realpathSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
export const DEFAULT_PORT = 4173;

export const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};

const NOT_FOUND = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Not found — Excel Supreme</title>
  </head>
  <body>
    <h1>Nothing at this address</h1>
    <p><a href="/">Back to the drills</a></p>
  </body>
</html>
`;

function isFile(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/**
 * Maps a URL path onto a file in `dist/`: `/` → index.html, `/excel/x` → `excel/x.html`,
 * `/assets/` → `assets/index.html`. Anything that escapes `dist/` is simply not found.
 */
export function resolvePath(distDir, urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath || "/");
  } catch {
    return null;
  }
  if (decoded.includes("\0")) return null;

  const root = resolve(distDir);
  const base = resolve(root, decoded.replace(/^\/+/, ""));
  if (base !== root && !base.startsWith(root + sep)) return null;

  const candidates = [base];
  if (base === root || decoded.endsWith("/")) {
    candidates.push(join(base, "index.html"));
  } else {
    candidates.push(`${base}.html`, join(base, "index.html"));
  }

  for (const candidate of candidates) {
    if (isFile(candidate)) return candidate;
  }
  return null;
}

export function contentType(file) {
  return MIME_TYPES[extname(file).toLowerCase()] ?? "application/octet-stream";
}

export function createStaticServer({ distDir }) {
  return createServer((request, response) => {
    const { pathname } = new URL(request.url ?? "/", "http://localhost");

    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { Allow: "GET, HEAD", "Content-Type": "text/plain; charset=utf-8" });
      response.end("Method not allowed\n");
      return;
    }

    const file = resolvePath(distDir, pathname);
    if (!file) {
      response.writeHead(404, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      response.end(request.method === "HEAD" ? undefined : NOT_FOUND);
      return;
    }

    const headers = {
      "Content-Type": contentType(file),
      "Content-Length": statSync(file).size,
      // Dev only: a rebuild must be visible on the next reload.
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    };

    if (request.method === "HEAD") {
      response.writeHead(200, headers);
      response.end();
      return;
    }

    response.writeHead(200, headers);
    createReadStream(file).pipe(response);
  });
}

function portFromEnv() {
  const raw = process.env.PORT?.trim();
  if (!raw) return DEFAULT_PORT;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`PORT must be an integer between 0 and 65535, got "${raw}"`);
  }
  return port;
}

export function startServer({ distDir = join(ROOT, "dist"), port = portFromEnv() } = {}) {
  if (!existsSync(join(distDir, "index.html"))) {
    throw new Error(`${distDir}/index.html does not exist — run npm run build first`);
  }
  const server = createStaticServer({ distDir });
  server.listen(port, () => {
    console.log(`serving ${distDir} on http://localhost:${server.address().port}`);
  });
  return server;
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
  try {
    startServer();
  } catch (error) {
    console.error(`serve failed: ${error.message}`);
    process.exitCode = 1;
  }
}
