import { chromium } from "playwright";
const base = "http://localhost:3111";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1400 } });
await ctx.addCookies([{ name: "nortex_actor", value: "NX-4471", url: base }]);
const page = await ctx.newPage();
await page.goto(`${base}/requests/TRQ-2026-0001`, { waitUntil: "networkidle" });
const btn = page.getByRole("button", { name: /sample inbox/i });
if (await btn.count()) { await btn.click(); await page.waitForURL(/\/claims\//, { timeout: 120000 }); }
else { await page.goto(`${base}/claims`, { waitUntil: "networkidle" }); await page.locator('a[href^="/claims/c"]').first().click(); }
await page.waitForLoadState("networkidle");
const panel = page.locator("aside");
await panel.screenshot({ path: "D:/Temp/claude/D--New-Assignment-expense-reimbursement-takehome/d0fb6bba-0c0c-4b8f-a87f-125892980657/scratchpad/shots/panel.png" });
const text = await panel.innerText();
console.log("--- panel text ---");
console.log(text.slice(0, 1400));
console.log("--- input boxes in the panel:", await panel.getByPlaceholder("What was done about it").count());
await browser.close();
