/**
 * Deepa's Goa trip, exactly as it went wrong: the same hotel bill arriving by
 * two routes - the hotel's email and a photograph of the invoice - plus a
 * photographed dinner bill. Checks the stay is claimed once and that whatever
 * blocks the settlement carries the control that clears it.
 */
import { chromium } from "playwright";
import path from "path";

const base = process.env.BASE;
const pack = path.join(process.cwd(), "data", "pack");
const shots =
  "D:/Temp/claude/D--New-Assignment-expense-reimbursement-takehome/d0fb6bba-0c0c-4b8f-a87f-125892980657/scratchpad/shots";

const browser = await chromium.launch();
const as = async (code) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
  await ctx.addCookies([{ name: "nortex_actor", value: code, url: base }]);
  return { ctx, page: await ctx.newPage() };
};

// Deepa raises a Goa trip
let { ctx, page } = await as("NX-5182");
await page.goto(`${base}/requests/new`, { waitUntil: "networkidle" });
await page.fill('input[name="destination"]', "Goa");
await page.fill('input[name="purpose"]', "Channel partner meet");
await page.fill('input[name="fromDate"]', "2026-09-21");
await page.fill('input[name="toDate"]', "2026-09-25");
await page.fill('input[name="estLodging"]', "12000");
await page.fill('input[name="estConveyance"]', "3000");
await page.fill('input[name="estMeals"]', "5000");
await page.fill('input[name="advanceRequested"]', "8000");
await page.waitForTimeout(400);
await page.getByRole("button", { name: /Send for approval/i }).click();
await page.waitForURL(/\/requests\/TRQ-/, { timeout: 60000 });
const trq = page.url().split("/").pop();
console.log("raised", trq);
await ctx.close();

// Her manager approves it
({ ctx, page } = await as("NX-2210"));
await page.goto(`${base}/requests/${trq}`, { waitUntil: "networkidle" });
await page.getByRole("textbox").first().fill("Approved.");
await page.getByRole("button", { name: /^Approve$/ }).click();
await page.waitForTimeout(4000);
await ctx.close();

// She uploads the hotel bill twice over, plus the dinner photograph
({ ctx, page } = await as("NX-5182"));
await page.goto(`${base}/requests/${trq}`, { waitUntil: "networkidle" });
await page.setInputFiles(`#files-${trq}`, [
  path.join(pack, "sample_emails", "12_hotel_invoice.eml"),
  path.join(pack, "receipts", "hotel_invoice_1188.png"),
  path.join(pack, "receipts", "dinner_bill_18jun.png"),
]);
await page.waitForTimeout(600);
await page.getByRole("button", { name: /Read 3 files/i }).click();
await page.waitForURL(/\/claims\//, { timeout: 180000 });
await page.waitForLoadState("networkidle");
console.log("claim:", page.url());

const text = await page.locator("body").innerText();
const lines = text.split("\n");
const after = (label) => lines[lines.findIndex((l) => l.includes(label)) + 1];

console.log("  claim total      :", after("Claim total, paid by you"));
console.log("  lodging rows     :", await page.locator("tr", { hasText: "night(s) at" }).count());
console.log("  duplicate caught :", /Duplicate of/i.test(text));
console.log("  blocking summary :", lines.find((l) => /need(s)? you|Nothing is waiting/.test(l)));
console.log("  fix on the check :", (await page.getByRole("button", { name: /Add it to the claim/i }).count()) > 0);

await page.screenshot({ path: `${shots}/goa-checks.png`, fullPage: true });

const panel = await page.locator("aside").last().innerText();
const start = panel.indexOf("Policy checks");
console.log("\n--- policy checks panel ---");
console.log(panel.slice(start, start + 900));

await ctx.close();
await browser.close();
