import { chromium } from "playwright";
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const r = await p.goto("http://localhost:4300/login", { waitUntil: "networkidle" });
console.log("status", r.status(), p.url());
console.log(await p.evaluate(() => [...document.querySelectorAll(".auth-field input, .auth-submit")].map((e) => `${e.tagName}#${e.id}.${e.className} ${JSON.stringify(e.getBoundingClientRect())} ${getComputedStyle(e).display}`).join("\n")));
console.log((await p.evaluate(() => document.body.innerText)).slice(0, 200));
await b.close();
