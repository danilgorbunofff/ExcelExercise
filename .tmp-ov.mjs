import { chromium } from "playwright";
const b = await chromium.launch();
for (const path of ["/", "/pricing", "/excel/sum-basics", "/dashboard", "/learn"]) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  await p.goto("http://localhost:4300" + path, { waitUntil: "networkidle" });
  const r = await p.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth,
    over: [...document.querySelectorAll("body *")]
      .filter((e) => e.getBoundingClientRect().right > document.documentElement.clientWidth + 1)
      .slice(0, 3)
      .map((e) => `${e.tagName}.${e.className}`.slice(0, 50)),
  }));
  console.log(path, r.sw, r.cw, JSON.stringify(r.over));
  await ctx.close();
}
await b.close();
