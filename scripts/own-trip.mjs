/**
 * A trip that is nothing to do with the pack: Imran goes to Hyderabad, raises
 * the request, gets it approved, draws an advance, and settles it from his own
 * files. Proves the workflow runs on real numbers rather than the sample's.
 */
import { chromium } from "playwright";
import path from "path";

const base = process.env.BASE || "http://localhost:3111";
const evidence =
  process.env.EVIDENCE ||
  "D:/Temp/claude/D--New-Assignment-expense-reimbursement-takehome/d0fb6bba-0c0c-4b8f-a87f-125892980657/scratchpad/own-trip";
const shots =
  "D:/Temp/claude/D--New-Assignment-expense-reimbursement-takehome/d0fb6bba-0c0c-4b8f-a87f-125892980657/scratchpad/shots";

const browser = await chromium.launch();
const as = async (code) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  await ctx.addCookies([{ name: "nortex_actor", value: code, url: base }]);
  return { ctx, page: await ctx.newPage() };
};
const money = (text, label) => text.split("\n")[text.split("\n").findIndex((l) => l.includes(label)) + 1];

// 1. Imran raises the trip
let { ctx, page } = await as("NX-4490");
await page.goto(`${base}/requests/new`, { waitUntil: "networkidle" });
await page.fill('input[name="destination"]', "Hyderabad");
await page.fill('input[name="purpose"]', "Vendor audit at the Hyderabad plant");
await page.fill('input[name="fromDate"]', "2026-10-05");
await page.fill('input[name="toDate"]', "2026-10-08");
await page.fill('input[name="estAir"]', "9000");
await page.fill('input[name="estLodging"]', "24000");
await page.fill('input[name="estConveyance"]', "3000");
await page.fill('input[name="estMeals"]', "4500");
await page.fill('input[name="advanceRequested"]', "12000");
await page.waitForTimeout(400);
await page.getByRole("button", { name: /Send for approval/i }).click();
await page.waitForURL(/\/requests\/TRQ-/, { timeout: 60000 });
const trq = page.url().split("/").pop();
console.log("1. raised", trq, "- estimate 40,500 so it needs the HoD too");
await ctx.close();

// 2. Manager, then head of department
for (const [code, who] of [
  ["NX-2210", "Suresh Iyer"],
  ["NX-1108", "Meera Krishnan"],
]) {
  ({ ctx, page } = await as(code));
  await page.goto(`${base}/requests/${trq}`, { waitUntil: "networkidle" });
  await page.getByRole("textbox").first().fill("Approved.");
  await page.getByRole("button", { name: /^Approve$/ }).click();
  await page.waitForTimeout(3000);
  console.log("2. approved by", who);
  await ctx.close();
}

// 3. Finance releases the advance
({ ctx, page } = await as("NX-3305"));
await page.goto(`${base}/requests/${trq}`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: /Release/i }).click();
await page.waitForTimeout(3000);
console.log("3. advance of 12,000 released");
await ctx.close();

// 4. Imran uploads his own evidence
({ ctx, page } = await as("NX-4490"));
await page.goto(`${base}/requests/${trq}`, { waitUntil: "networkidle" });
console.log("   sample-inbox button offered on this trip?", await page.getByRole("button", { name: /sample inbox/i }).count());
await page.screenshot({ path: `${shots}/own-01-request.png`, fullPage: true });

const files = [
  "01_cab_to_airport.eml",
  "02_cab_from_airport.eml",
  "03_cab_duplicate.eml",
  "04_hotel_invoice.eml",
  "05_colleague_ride.eml",
].map((f) => path.join(evidence, f));
await page.setInputFiles(`#files-${trq}`, files);
await page.waitForTimeout(500);
await page.getByRole("button", { name: /Read 5 files/i }).click();
await page.waitForURL(/\/claims\//, { timeout: 120000 });
await page.waitForLoadState("networkidle");
console.log("4. uploaded 5 files ->", page.url());

const text = await page.locator("body").innerText();
console.log("   claim total :", money(text, "Claim total, paid by you"));
console.log("   disallowed  :", money(text, "Disallowed"));
console.log("   advance     :", money(text, "Advance adjusted"));
console.log("   payable     :", money(text, "Payable to you"));
console.log("   checks      :", text.split("\n").find((l) => /blocking/.test(l)));
console.log("   duplicate caught:", /Duplicate of/.test(text));
console.log("   colleague excluded:", /not the claimant/.test(text));
console.log("   lodging cap hit:", /above the tier 1 limit/i.test(text));
await page.screenshot({ path: `${shots}/own-02-claim.png`, fullPage: true });
await ctx.close();

await browser.close();
