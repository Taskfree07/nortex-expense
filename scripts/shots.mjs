import { chromium } from "playwright";
const base = process.env.BASE || "http://localhost:3111";
const out =
  process.argv[2] ||
  "D:/Temp/claude/D--New-Assignment-expense-reimbursement-takehome/d0fb6bba-0c0c-4b8f-a87f-125892980657/scratchpad/shots";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
await ctx.addCookies([{ name: "nortex_actor", value: process.env.ACTOR || "NX-4471", url: base }]);
const page = await ctx.newPage();
for (const [name, path] of JSON.parse(process.env.PAGES)) {
  await page.goto(base + path, { waitUntil: "networkidle" });
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: process.env.FULL === "1" });
  console.log("shot", name, await page.title());
}
await browser.close();
