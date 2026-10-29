/**
 * A dependency-free static server for `legacy/dist`, used by the `static` Playwright project.
 *
 * The port ships two deployables: the Next app (served by `next start`) and the static build. Until
 * this existed the static build was only HTML-crawled by `legacy/src/verify.mjs` — no browser ever
 * loaded one of its pages, so the browser-only parts (the drill's module graph, the storage probe,
 * the keyboard loop) were unproven there. This serves the exact bytes `legacy/dist` contains, with
 * the extension-less `/excel/<slug>` shape the real host uses.
 *
 *   node scripts/serve-static.mjs [root] [port]
 */
import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, sep } from "node:path";

const root = normalize(process.argv[2] ?? "legacy/dist");
const port = Number(process.argv[3] ?? 4175);

const TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
  ".xml": "application/xml; charset=utf-8",
};

function resolveFile(pathname) {
  const candidates = [pathname, `${pathname}.html`, join(pathname, "index.html")];
  for (const candidate of candidates) {
    const file = normalize(join(root, candidate));
    // `join` + `normalize` collapse `..`; the prefix check rejects anything that escaped the root.
    if (file !== root && !file.startsWith(root + sep)) continue;
    try {
      if (statSync(file).isFile()) return file;
    } catch {
      // Not this candidate.
    }
  }
  return null;
}

const server = createServer((req, res) => {
  const { pathname } = new URL(req.url, `http://127.0.0.1:${port}`);
  const file = resolveFile(decodeURIComponent(pathname));
  if (!file) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }
  res.writeHead(200, {
    "content-type": TYPES[extname(file)] ?? "application/octet-stream",
    "cache-control": "no-store",
  });
  createReadStream(file).pipe(res);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`static: serving ${root} on http://127.0.0.1:${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
