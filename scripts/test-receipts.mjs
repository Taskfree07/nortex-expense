/** Reads the two bills with Gemini and compares against the verified readings. */
import { readReceiptImage } from "../src/lib/ai/receipt-reader.ts";
import path from "path";
const pack = path.join(process.cwd(), "data", "pack", "receipts");
for (const file of ["dinner_bill_18jun.png", "hotel_invoice_1188.png"]) {
  const r = await readReceiptImage(path.join(pack, file));
  console.log("---", file, "| read by:", r.parsedBy, r.error ? `| ${r.error}` : "");
  const e = r.extracted;
  console.log("   merchant:", e.merchant, "| total:", e.amount, "| tax:", e.taxTotal, "| sub:", e.subTotal);
  console.log("   lines:", (e.folioLines ?? []).map((l) => `${l.description}=${l.amount}`).join(", "));
}
