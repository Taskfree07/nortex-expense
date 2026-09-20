// Recomputes the template's own SUMIF formulas from the written cells, so we know
// what Excel will show - not just what we typed.
import ExcelJS from "exceljs";
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile("D:/Temp/claude/D--New-Assignment-expense-reimbursement-takehome/d0fb6bba-0c0c-4b8f-a87f-125892980657/scratchpad/settlement.xlsx");
const s = wb.getWorksheet("Expense Settlement Form");
const ranges = [[11,14],[19,28],[33,40]];
let emp = 0, comp = 0;
for (const [a,b] of ranges) for (let r=a;r<=b;r++) {
  const who = s.getCell(`G${r}`).value, amt = Number(s.getCell(`H${r}`).value) || 0;
  if (who === "Employee") emp += amt; else if (who === "Company") comp += amt;
}
const round2 = (n) => Math.round(n*100)/100;
const disallowed = Number(s.getCell("H46").value), advance = Number(s.getCell("H48").value);
const net = round2(emp - disallowed);
console.log("H44 total claim, employee :", round2(emp));
console.log("H45 company (memo)        :", round2(comp));
console.log("H46 disallowed            :", disallowed);
console.log("H47 net reimbursable      :", net);
console.log("H48 advance               :", advance);
console.log("H49 payable               :", round2(Math.max(0, net - advance)));
console.log("H50 recoverable           :", round2(Math.max(0, advance - net)));
console.log(net === 26388.44 && round2(net - advance) === 6388.44 ? "MATCHES the hand-worked settlement" : "MISMATCH");
