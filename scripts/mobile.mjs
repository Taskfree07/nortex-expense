import { chromium } from "playwright";
const base = "http://localhost:3111";
const out =
  "D:/Temp/claude/D--New-Assignment-expense-reimbursement-takehome/d0fb6bba-0c0c-4b8f-a87f-125892980657/scratchpad/shots";
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
await ctx.addCookies([{ name: "nortex_actor", value: "NX-4471", url: base }]);
const page = await ctx.newPage();
for (const [name, path] of [
  ["m-dashboard", "/dashboard"],
  ["m-request", "/requests/TRQ-2026-0001"],
  ["m-claims", "/claims"],
]) {
  await page.goto(base + path, { waitUntil: "networkidle" });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  console.log(name, "horizontal overflow:", overflow, "px");
  await page.screenshot({ path: `${out}/${name}.png` });
}
await browser.close();
