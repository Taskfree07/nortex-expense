/** A filed claim is sent back with remarks, corrected, and filed again against
 *  the same Travel Request ID (policy 2.3). */
import { chromium } from "playwright";
const base = "http://localhost:3111";
const browser = await chromium.launch();
const as = async (code) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  await ctx.addCookies([{ name: "nortex_actor", value: code, url: base }]);
  return { ctx, page: await ctx.newPage() };
};

let { ctx, page } = await as("NX-4471");
await page.goto(`${base}/requests/TRQ-2026-0001`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: /Read my inbox/i }).click();
await page.waitForURL(/\/claims\//, { timeout: 60000 });
const claimUrl = page.url();
await page.getByLabel("Who was at the table").fill("R. Balaji (Vertex), S. Menon (Vertex)");
await page.getByRole("button", { name: /Record attendees/i }).click();
await page.waitForTimeout(1200);
await page
  .getByPlaceholder("What was done about it")
  .first()
  .fill("HoD approved the dinner by mail on 17 Jun.");
await page
  .getByRole("button", { name: /Clear this check/i })
  .first()
  .click();
await page.waitForTimeout(1500);
await page.getByRole("button", { name: /File the settlement/i }).click();
await page.waitForTimeout(2500);
await ctx.close();

// Manager sends it back
({ ctx, page } = await as("NX-2210"));
await page.goto(claimUrl, { waitUntil: "networkidle" });
await page
  .getByRole("textbox")
  .first()
  .fill("Attach the missing hotel night for 19 Jun or drop the claim to 3 nights.");
await page.getByRole("button", { name: /Send back for correction/i }).click();
await page.waitForTimeout(2500);
await ctx.close();

// Employee sees it back, edits, refiles
({ ctx, page } = await as("NX-4471"));
await page.goto(claimUrl, { waitUntil: "networkidle" });
let text = await page.locator("body").innerText();
console.log("D1 employee sees:", /Sent back to you/.test(text) ? "Sent back to you" : "??");
console.log("D2 remarks visible:", /missing hotel night/.test(text));
console.log(
  "D3 editable again:",
  (await page.getByRole("button", { name: /File the settlement/i }).count()) > 0,
);
await page.screenshot({
  path: "D:/Temp/claude/D--New-Assignment-expense-reimbursement-takehome/d0fb6bba-0c0c-4b8f-a87f-125892980657/scratchpad/shots/flow3-returned.png",
  fullPage: false,
});

// Remove a line, refile, confirm the total moved and the chain was rebuilt
const removeButtons = page.getByRole("button", { name: /^Remove$/ });
await removeButtons.last().click();
await page.waitForTimeout(1500);
await page.getByRole("button", { name: /File the settlement/i }).click();
await page.waitForTimeout(2500);
await page.reload({ waitUntil: "networkidle" });
text = await page.locator("body").innerText();
console.log("D4 refiled:", /Under review/.test(text));
console.log("D5 same request ID:", /TRQ-2026-0001/.test(text));
console.log("D6 new net:", text.match(/Net reimbursable claim\s*\n?\s*(₹[\d,\.]+)/)?.[1]);
await ctx.close();
await browser.close();
