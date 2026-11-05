#!/usr/bin/env node
/**
 * Draws the share cards, the icon set and the manifest into a built `dist/`.
 *
 * A child process on purpose: `next/og` renders asynchronously (satori lays the text out, resvg
 * rasterises it) and `build()` is a synchronous function that five test suites call from non-async
 * hooks. One spawn per build is cheaper than an async boundary through all of them.
 *
 * Input is JSON on stdin, so nothing here parses arguments:
 *
 *   { "dist": "/abs/dist", "name": "Excel Supreme", "host": "excel.example.org",
 *     "cards": [{ "key": "home", "title": "…", "note": "…" }] }
 *
 * The copy comes from the caller because the caller has the pages; this file only draws.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { ImageResponse } from "next/og.js";
import { createElement as h } from "react";

import { FAVICON_JADE } from "./assets.mjs";
import { renderManifest, SOCIAL_SIZE } from "./social.mjs";
const INK = "#191918";
const PAPER = "#f9f9f8";
const MUTED = "#a8a8a3";

const frame = (children, style = {}) =>
  h(
    "div",
    {
      style: {
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: INK,
        color: PAPER,
        padding: "64px 72px",
        ...style,
      },
    },
    ...children,
  );

/** One card: the site's name, the page's heading, a jade rule, the page's own description and the host. */
function card({ name, host, title, note }) {
  return frame([
    h(
      "div",
      { style: { display: "flex", fontSize: 26, letterSpacing: "0.14em", color: MUTED } },
      name.toUpperCase(),
    ),
    h(
      "div",
      { style: { display: "flex", flexDirection: "column", gap: "28px" } },
      h("div", { style: { display: "flex", fontSize: 66, lineHeight: 1.14, maxWidth: "1000px" } }, title),
      h("div", { style: { display: "flex", width: "96px", height: "6px", background: FAVICON_JADE, borderRadius: "3px" } }),
    ),
    h(
      "div",
      { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: "48px" } },
      h("div", { style: { display: "flex", fontSize: 27, lineHeight: 1.4, color: MUTED, maxWidth: "800px" } }, note),
      h("div", { style: { display: "flex", fontSize: 24, color: MUTED } }, host),
    ),
  ]);
}

/**
 * The icon set, drawn rather than committed: the jade square with the two white bars is the favicon's
 * own geometry at the sizes a phone, a home screen and a maskable slot ask for. The maskable variant
 * keeps the bars inside the 80% safe circle, which is the only difference between the two.
 */
function icon({ size, maskable = false }) {
  const scale = maskable ? 0.72 : 1;
  const bar = Math.max(2, Math.round(size * 0.1 * scale));
  const width = Math.round(size * 0.44 * scale);
  return h(
    "div",
    {
      style: {
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: `${Math.round(size * 0.1 * scale)}px`,
        background: FAVICON_JADE,
      },
    },
    h("div", { style: { display: "flex", width: `${width}px`, height: `${bar}px`, background: "#ffffff", borderRadius: `${bar}px` } }),
    h("div", { style: { display: "flex", width: `${width}px`, height: `${bar}px`, background: "#ffffff", borderRadius: `${bar}px` } }),
  );
}

const ICONS = [
  { file: "assets/icons/icon-192.png", size: 192 },
  { file: "assets/icons/icon-512.png", size: 512 },
  { file: "assets/icons/icon-maskable-512.png", size: 512, maskable: true },
  { file: "assets/icons/apple-touch-icon.png", size: 180 },
];

async function png(element, width, height) {
  return Buffer.from(await new ImageResponse(element, { width, height }).arrayBuffer());
}

const write = (path, contents) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
};

const input = JSON.parse(readFileSync(0, "utf8"));
const { dist, name, host, themeColor, cards } = input;

for (const page of cards) {
  const buffer = await png(card({ name, host, title: page.title, note: page.note }), SOCIAL_SIZE.width, SOCIAL_SIZE.height);
  write(join(dist, "assets/social", `${page.key}.png`), buffer);
}

for (const spec of ICONS) {
  write(join(dist, spec.file), await png(icon(spec), spec.size, spec.size));
}

write(
  join(dist, "manifest.webmanifest"),
  renderManifest({ config: { name, themeColor } }),
);
