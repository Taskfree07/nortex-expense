import { chromium } from "playwright";
const base = "http://localhost:3111";
const out = "D:/Temp/claude/D--New-Assignment-expense-reimbursement-takehome/d0fb6bba-0c0c-4b8f-a87f-125892980657/scratchpad/shots";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await ctx.addCookies([{ name: "nortex_actor", value: "NX-4471", url: base }]);
const page = await ctx.newPage();
await page.goto(base + "/claims", { waitUntil: "networkidle" });
const href = await page.locator('a[href^="/claims/c"]').first().getAttribute("href").catch(() => null);
if (href) {
  await page.goto(base + href, { waitUntil: "networkidle" });
  console.log("m-claim overflow:", await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth));
  await page.screenshot({ path: `${out}/m-claim.png` });
} else console.log("no claim to open");
await browser.close();
