import { chromium } from "playwright";
const base = process.env.BASE;
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
await ctx.addCookies([{ name: "nortex_actor", value: "NX-4471", url: base }]);
const page = await ctx.newPage();
page.on("console", (m) => { if (m.type() === "error") console.log("  console error:", m.text().slice(0, 150)); });

const t0 = Date.now();
await page.goto(`${base}/requests/TRQ-2026-0001`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: /sample inbox/i }).click();
await page.waitForURL(/\/claims\//, { timeout: 120000 });
await page.waitForLoadState("networkidle");
console.log("import took", ((Date.now() - t0) / 1000).toFixed(1), "s");
console.log("claim:", page.url());

const body = await page.locator("body").innerText();
console.log("net line:", body.split("\n").find((l) => /Net reimbursable/.test(l)) ?? "-");
const idx = body.split("\n").findIndex((l) => /Net reimbursable/.test(l));
console.log("net value:", body.split("\n")[idx + 1]);
console.log("checks:", body.split("\n").find((l) => /blocking/.test(l)));
console.log("read by gemini count:", (body.match(/read by Gemini/g) || []).length);
console.log("attendee box present:", await page.getByLabel("Who was at the table").count());
console.log("clear boxes:", await page.getByPlaceholder("What was done about it").count());
console.log("file button enabled:", await page.getByRole("button", { name: /File the settlement/i }).isEnabled());
await page.screenshot({ path: "D:/Temp/claude/D--New-Assignment-expense-reimbursement-takehome/d0fb6bba-0c0c-4b8f-a87f-125892980657/scratchpad/shots/prod-claim.png", fullPage: false });
await browser.close();
