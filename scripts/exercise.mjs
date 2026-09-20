import { chromium } from "playwright";
const base = process.env.BASE || "https://nortex-expense.vercel.app";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
await ctx.addCookies([{ name: "nortex_actor", value: "NX-4471", url: base }]);
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("PAGEERROR: " + String(e).replace(/\s+/g, " ").slice(0, 250)));
page.on("console", (m) => { if (m.type() === "error") errors.push("CONSOLE: " + m.text().replace(/\s+/g, " ").slice(0, 250)); });

await page.goto(`${base}/claims`, { waitUntil: "networkidle" });
await page.locator('a[href^="/claims/c"]').first().click();
await page.waitForLoadState("networkidle");
console.log("on claim:", page.url());

async function step(label, fn) {
  const before = errors.length;
  try { await fn(); } catch (e) { console.log(`  ${label}: threw ${String(e).slice(0, 90)}`); }
  await page.waitForTimeout(2500);
  const fresh = errors.slice(before);
  console.log(`${label}: ${fresh.length ? "ERROR -> " + fresh[0] : "clean"}`);
}

await step("record attendees", async () => {
  await page.getByLabel("Who was at the table").fill("R. Balaji (Vertex), S. Menon (Vertex)");
  await page.getByRole("button", { name: /Record attendees/i }).click();
});
await step("clear a blocking check", async () => {
  await page.getByPlaceholder("What was done about it").first().fill("Approved by the HoD on 17 Jun.");
  await page.getByRole("button", { name: /Clear this check/i }).first().click();
});
await step("remove a line", async () => {
  await page.getByRole("button", { name: /^Remove$/ }).last().click();
});
await step("open add-line form", async () => {
  await page.getByRole("button", { name: /Add something the inbox missed/i }).click();
});
await step("add a manual line", async () => {
  await page.fill('input[name="description"]', "Cab hotel to airport");
  await page.fill('input[name="gross"]', "450");
  await page.fill('input[name="lineDate"]', "2026-06-20");
  await page.getByRole("button", { name: /^Add$/ }).click();
});
await step("file the settlement", async () => {
  await page.getByRole("button", { name: /File the settlement/i }).click();
});

console.log("\ntotal errors seen:", errors.length);
for (const e of errors.slice(0, 5)) console.log(" -", e);
await browser.close();
