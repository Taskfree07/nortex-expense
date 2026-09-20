import { chromium } from "playwright";
const base = process.env.BASE || "https://nortex-expense.vercel.app";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
await ctx.addCookies([{ name: "nortex_actor", value: "NX-4471", url: base }]);
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR:", String(e).replace(/\s+/g, " ").slice(0, 300)));
page.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE:", m.text().replace(/\s+/g, " ").slice(0, 300)); });

await page.goto(`${base}/requests/TRQ-2026-0001`, { waitUntil: "networkidle" });
console.log("step 1: request page loaded");

const sample = page.getByRole("button", { name: /sample inbox/i });
if (await sample.count()) {
  await sample.click();
  await page.waitForURL(/\/claims\//, { timeout: 180000 }).catch(() => console.log("  (no navigation yet)"));
} else {
  await page.goto(`${base}/claims`, { waitUntil: "networkidle" });
  await page.locator('a[href^="/claims/c"]').first().click();
}
await page.waitForLoadState("networkidle");
console.log("step 2: claim page:", page.url());
await page.waitForTimeout(3000);
console.log("done");
await browser.close();
