/** Deepa's Goa trip, exactly as it went wrong: the same hotel bill by two
 *  routes, plus a photographed dinner bill the reader may not price. */
import { chromium } from "playwright";
import path from "path";

const base = process.env.BASE;
const pack = path.join(process.cwd(), "data", "pack");
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

// Manager approves (20,000 estimate -> manager only)
({ ctx, page } = await as("NX-2210"));
await page.goto(`${base}/requests/${trq}`, { waitUntil: "networkidle" });
await page.getByRole("textbox").first().fill("Approved.");
await page.getByRole("button", { name: /^Approve$/ }).click();
await page.waitForTimeout(4000);
await ctx.close();

// Deepa uploads the same hotel bill twice, plus the dinner photo
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
const claimUrl = page.url();
console.log("claim:", claimUrl);

const body = () => page.locator("body").innerText();
let text = await body();
const after = (label) => text.split("\n")[text.split("\n").findIndex((l) => l.includes(label)) + 1];
console.log("  claim total     :", after("Claim total, paid by you"));
console.log("  lodging lines   :", (text.match(/night\(s\) at/g) || []).length);
console.log("  duplicate noted :", /Duplicate of/.test(text));
console.log("  blocking text   :", text.split("\n").find((l) => /need(s)? you/.test(l)));
console.log("  price form here :", await page.getByRole("button", { name: /Add it to the claim/i }).count());
await page.screenshot({ path: "D:/Temp/claude/D--New-Assignment-expense-reimbursement-takehome/d0fb6bba-0c0c-4b8f-a87f-125892980657/scratchpad/shots/goa-blocked.png", fullPage: true });

// Clear the blocker the way the interface now offers
if (await page.getByRole("button", { name: /Add it to the claim/i }).count()) {
  await page.locator('input[name="description"]').last().fill("Dinner with the channel partners");
  await page.locator('select[name="head"]').last().selectOption("Business entertainment");
  await page.locator('input[name="amount"]').last().fill("2255");
  await page.locator('input[name="lineDate"]').last().fill("2026-09-23");
  await page.getByRole("button", { name: /Add it to the claim/i }).click();
  await page.waitForTimeout(6000);
  await page.reload({ waitUntil: "networkidle" });
  text = await body();
  console.log("\nafter pricing it:");
  console.log("  blocking text   :", text.split("\n").find((l) => /need(s)? you|Nothing is waiting/.test(l)));
  console.log("  can file        :", await page.getByRole("button", { name: /File the settlement/i }).isEnabled());
  console.log("  claim total     :", text.split("\n")[text.split("\n").findIndex((l) => l.includes("Claim total, paid by you")) + 1]);
  await page.screenshot({ path: "D:/Temp/claude/D--New-Assignment-expense-reimbursement-takehome/d0fb6bba-0c0c-4b8f-a87f-125892980657/scratchpad/shots/goa-cleared.png", fullPage: true });
}
await ctx.close();
await browser.close();
