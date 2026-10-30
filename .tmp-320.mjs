import { chromium } from "playwright";
const b = await chromium.launch();
for (const path of ["/", "/pricing", "/excel/sum-basics", "/dashboard", "/learn", "/login"]) {
  const ctx = await b.newContext({ viewport: { width: 320, height: 640 } });
  const p = await ctx.newPage();
  await p.goto("http://localhost:4300" + path, { waitUntil: "networkidle" });
  const r = await p.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth,
    over: [...document.querySelectorAll("main *, footer *")]
      .filter((e) => e.getBoundingClientRect().right > document.documentElement.clientWidth + 1)
      .filter((e) => !e.closest(".visually-hidden"))
      .slice(0, 4)
      .map((e) => `${e.tagName}.${String(e.className).slice(0, 30)}`),
  }));
  console.log(path, r.sw, r.cw, JSON.stringify(r.over));
  await ctx.close();
}
await b.close();
