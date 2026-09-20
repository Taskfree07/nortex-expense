// Downloads the filled workbook and reads back what Excel itself would compute.
import ExcelJS from "exceljs";
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const claim = await db.claim.findFirst({ orderBy: { createdAt: "desc" } });
const res = await fetch(`http://localhost:3111/api/claims/${claim.id}/export`, {
  headers: { cookie: "nortex_actor=NX-4471" },
});
console.log("status", res.status, res.headers.get("content-type").slice(0, 60));
const buf = Buffer.from(await res.arrayBuffer());
const path =
  "D:/Temp/claude/D--New-Assignment-expense-reimbursement-takehome/d0fb6bba-0c0c-4b8f-a87f-125892980657/scratchpad/settlement.xlsx";
await (await import("fs/promises")).writeFile(path, buf);
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(path);
const s = wb.getWorksheet("Expense Settlement Form");
const show = (addr) => {
  const c = s.getCell(addr).value;
  return typeof c === "object" && c ? (c.formula ? `=${c.formula}` : JSON.stringify(c)) : c;
};
for (const addr of [
  "C5",
  "C6",
  "F6",
  "B11",
  "E11",
  "G11",
  "H11",
  "I11",
  "B19",
  "E19",
  "H19",
  "B33",
  "C33",
  "H33",
  "H44",
  "H45",
  "H46",
  "H47",
  "H48",
  "H49",
  "H50",
  "I46",
  "D54",
  "E54",
  "D55",
  "E55",
  "D56",
  "E56",
  "D57",
  "E57",
  "D58",
  "E58",
])
  console.log(addr.padEnd(5), show(addr));
await db.$disconnect();
