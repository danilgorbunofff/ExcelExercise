import { chromium } from "playwright";

const pages = process.argv.slice(2);
const base = "http://localhost:4300";
const viewports = [{ w: 1440, h: 900 }, { w: 390, h: 844 }];

const browser = await chromium.launch();

for (const vp of viewports) {
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
  const page = await ctx.newPage();
  for (const path of pages) {
    await page.goto(base + path, { waitUntil: "networkidle" });
    const rows = await page.evaluate(() => {
      const out = [];
      const sel = 'a, button, input, select, textarea, summary, [role="button"], [tabindex]:not([tabindex="-1"])';
      for (const el of document.querySelectorAll(sel)) {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        if (r.width >= 44 && r.height >= 44) continue;
        const label =
          el.getAttribute("aria-label") ||
          (el.textContent || "").trim().slice(0, 40) ||
          el.getAttribute("placeholder") ||
          el.getAttribute("type") ||
          "";
        out.push({
          tag: el.tagName.toLowerCase(),
          id: el.id || "",
          cls: el.className && typeof el.className === "string" ? el.className.slice(0, 40) : "",
          w: Math.round(r.width),
          h: Math.round(r.height),
          label,
        });
      }
      return out;
    });
    console.log(`\n=== ${path} @ ${vp.w}x${vp.h} — ${rows.length} under 44px`);
    for (const r of rows) console.log(`${r.w}x${r.h}\t${r.tag}.${r.cls || "—"}\t#${r.id || "—"}\t${r.label}`);
  }
  await ctx.close();
}
await browser.close();
