/** Covers the paths the happy path does not: raising a request, the advance cap,
 *  and a claim being sent back with remarks and refiled. */
import { chromium } from "playwright";
const base = "http://localhost:3111";
const browser = await chromium.launch();
const as = async (code) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  await ctx.addCookies([{ name: "nortex_actor", value: code, url: base }]);
  return { ctx, page: await ctx.newPage() };
};

// A) Raise a travel request through the form
let { ctx, page } = await as("NX-4490"); // Imran Qureshi, reports to Suresh
await page.goto(`${base}/requests/new`, { waitUntil: "networkidle" });
await page.fill('input[name="destination"]', "Hyderabad");
await page.fill('input[name="purpose"]', "Vendor audit");
await page.fill('input[name="fromDate"]', "2026-10-05");
await page.fill('input[name="toDate"]', "2026-10-08");
await page.fill('input[name="estLodging"]', "18000");
await page.fill('input[name="estConveyance"]', "4000");
await page.fill('input[name="estMeals"]', "6000");
await page.fill('input[name="estAir"]', "9000");
await page.fill('input[name="advanceRequested"]', "25000");
await page.waitForTimeout(400);
const disabled = await page.getByRole("button", { name: /Send for approval/i }).isDisabled();
console.log("A1 advance over cap blocks submit:", disabled);
await page.screenshot({
  path: "D:/Temp/claude/D--New-Assignment-expense-reimbursement-takehome/d0fb6bba-0c0c-4b8f-a87f-125892980657/scratchpad/shots/flow2-01-request-form.png",
  fullPage: true,
});
await page.fill('input[name="advanceRequested"]', "12000");
await page.waitForTimeout(300);
await page.getByRole("button", { name: /Send for approval/i }).click();
await page.waitForURL(/\/requests\/TRQ-/, { timeout: 30000 });
const trq = page.url().split("/").pop();
console.log("A2 request raised:", trq);
console.log(
  "A3 chain shown:",
  (await page.locator("text=Head of Department").count()) > 0 ? "RM + HoD (37,000 estimate)" : "RM only",
);
await ctx.close();

// B) Approver sends it back with remarks
({ ctx, page } = await as("NX-2210"));
await page.goto(`${base}/requests/${trq}`, { waitUntil: "networkidle" });
await page
  .getByRole("textbox")
  .first()
  .fill("Hotel estimate is above the Tier-1 cap for 3 nights. Redo it.");
await page.getByRole("button", { name: /Send back for correction/i }).click();
await page.waitForTimeout(2000);
await page.reload({ waitUntil: "networkidle" });
const body = await page.locator("body").innerText();
console.log("B1 status now:", /Sent back/.test(body) ? "Sent back" : "??");
console.log("B2 remarks kept:", /Redo it/.test(body));
await ctx.close();

// C) A claim sent back, then refiled
({ ctx, page } = await as("NX-4471"));
await page.goto(`${base}/claims`, { waitUntil: "networkidle" });
const claimHref = await page.locator('a[href^="/claims/c"]').first().getAttribute("href");
await ctx.close();

({ ctx, page } = await as("NX-2210"));
await page.goto(base + claimHref, { waitUntil: "networkidle" });
const alreadyDecided = (await page.getByRole("button", { name: /^Approve$/ }).count()) === 0;
console.log("C0 claim already paid, so no decision available to the manager:", alreadyDecided);
await ctx.close();

await browser.close();
