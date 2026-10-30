import { chromium } from "playwright";
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
p.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE", m.text().slice(0, 200)); });
p.on("pageerror", (e) => console.log("PAGEERROR", e.message.slice(0, 300)));
const r = await p.goto("http://localhost:4300/drill/1", { waitUntil: "networkidle" });
console.log("status", r.status());
console.log((await p.evaluate(() => document.body.innerText)).slice(0, 600));
await b.close();
