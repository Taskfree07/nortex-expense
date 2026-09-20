/**
 * Drives the whole story in a real browser: Chaitanya reads his inbox, files the
 * settlement, then it moves through Suresh, Meera and Finance to payment.
 * Screenshots each step. Used to check the app really works end to end.
 */
import { chromium } from "playwright";

const base = process.env.BASE || "http://localhost:3111";
const out =
  "D:/Temp/claude/D--New-Assignment-expense-reimbursement-takehome/d0fb6bba-0c0c-4b8f-a87f-125892980657/scratchpad/shots";
const browser = await chromium.launch();

async function as(empCode) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  await ctx.addCookies([{ name: "nortex_actor", value: empCode, url: base }]);
  return { ctx, page: await ctx.newPage() };
}
const shot = (page, name, full = false) => page.screenshot({ path: `${out}/${name}.png`, fullPage: full });

// 1. Employee reads the inbox
let { ctx, page } = await as("NX-4471");
await page.goto(`${base}/requests/TRQ-2026-0001`, { waitUntil: "networkidle" });
await shot(page, "flow-01-request", true);
await page.getByRole("button", { name: /Read my inbox/i }).click();
await page.waitForURL(/\/claims\//, { timeout: 60000 });
await page.waitForLoadState("networkidle");
const claimUrl = page.url();
console.log("claim drafted:", claimUrl);
await shot(page, "flow-02-claim-draft", true);

// The two blocking checks on the customer dinner
console.log(
  "blocking:",
  await page
    .locator("text=blocking")
    .first()
    .textContent()
    .catch(() => "-"),
);
await page
  .getByLabel("Who was at the table")
  .fill(
    "R. Balaji (Vertex Technologies), S. Menon (Vertex Technologies), A. Kulkarni (Vertex Technologies)",
  );
await page.getByRole("button", { name: /Record attendees/i }).click();
await page.waitForLoadState("networkidle");
await page.waitForTimeout(800);

const clearInputs = page.getByPlaceholder("What was done about it");
await clearInputs
  .first()
  .fill("Meera Krishnan approved the customer dinner by mail on 17 Jun, before the booking.");
await page
  .getByRole("button", { name: /Clear this check/i })
  .first()
  .click();
await page.waitForTimeout(1200);
await shot(page, "flow-03-checks-cleared", true);

await page.getByRole("button", { name: /File the settlement/i }).click();
await page.waitForTimeout(2500);
await page.reload({ waitUntil: "networkidle" });
await shot(page, "flow-04-filed", true);
await ctx.close();

// 2. Reporting Manager
({ ctx, page } = await as("NX-2210"));
await page.goto(`${base}/approvals`, { waitUntil: "networkidle" });
await shot(page, "flow-05-approver-queue", true);
await page.goto(claimUrl, { waitUntil: "networkidle" });
await page.getByRole("textbox").first().fill("Checked against the hotel limit I asked about. Approved.");
await page.getByRole("button", { name: /^Approve$/ }).click();
await page.waitForTimeout(2000);
await ctx.close();

// 3. Head of Department
({ ctx, page } = await as("NX-1108"));
await page.goto(claimUrl, { waitUntil: "networkidle" });
await page.getByRole("textbox").first().fill("Entertainment confirmed. Approved.");
await page.getByRole("button", { name: /^Approve$/ }).click();
await page.waitForTimeout(2000);
await ctx.close();

// 4. Finance verifies
({ ctx, page } = await as("NX-3305"));
await page.goto(claimUrl, { waitUntil: "networkidle" });
await page.getByRole("textbox").first().fill("Bills reconciled, no duplicates. Verified.");
await page.getByRole("button", { name: /^Approve$/ }).click();
await page.waitForTimeout(2000);
await page.goto(`${base}/finance`, { waitUntil: "networkidle" });
await shot(page, "flow-06-finance", true);
await ctx.close();

// 5. Controller releases payment
({ ctx, page } = await as("NX-3300"));
await page.goto(claimUrl, { waitUntil: "networkidle" });
await page.getByRole("textbox").first().fill("Released in the 25 Jun run.");
await page.getByRole("button", { name: /^Approve$/ }).click();
await page.waitForTimeout(2500);
await page.reload({ waitUntil: "networkidle" });
await shot(page, "flow-07-paid", true);
console.log(
  "final:",
  await page.locator("h1").first().textContent(),
  "|",
  await page
    .locator("body")
    .innerText()
    .then((t) => t.split("\n").find((l) => /Paid/i.test(l))),
);
await ctx.close();

await browser.close();
