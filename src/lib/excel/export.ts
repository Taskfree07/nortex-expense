/**
 * Fills the company's own workbook - data/pack/Travel_Expense_Forms_Template.xlsx -
 * rather than inventing a spreadsheet of our own.
 *
 * The template's totals are formulas (=SUM, =SUMIF on the word "Employee"), and
 * its legend says not to overwrite them. So this writes only the shaded input
 * cells and lets Excel do the arithmetic; if our number and the sheet's number
 * ever disagree, that is a bug worth seeing rather than one worth hiding.
 */

import ExcelJS from "exceljs";
import path from "path";
import { formatDate } from "../dates";

const TEMPLATE = path.join(process.cwd(), "data", "pack", "Travel_Expense_Forms_Template.xlsx");

/** The input rows the template reserves for each section. */
const LODGING_ROWS = { first: 11, last: 14 };
const TRANSPORT_ROWS = { first: 19, last: 28 };
const OTHER_ROWS = { first: 33, last: 40 };
const APPROVAL_ROWS = { first: 54, last: 58 };

export type ExportClaim = {
  claimNo: string;
  submittedAt: Date | null;
  disallowed: number;
  advanceApplied: number;
  travelRequest: {
    trqId: string;
    destination: string;
    purpose: string;
    fromDate: Date;
    toDate: Date;
    days: number;
    mode: string;
    travelType: string;
    cityClass: string;
    costCentre: string;
    estimateJson: string;
    estimatedTotal: number;
    advanceRequested: number;
    employee: {
      name: string;
      empCode: string;
      designation: string;
      department: string;
      costCentre: string;
    };
    approvals: {
      level: number;
      role: string;
      decision: string;
      remarks: string | null;
      decidedAt: Date | null;
      approver: { name: string } | null;
    }[];
  };
  employee: { name: string; empCode: string; costCentre: string };
  lines: {
    section: string;
    head: string;
    description: string;
    lineDate: Date | null;
    checkIn: Date | null;
    checkOut: Date | null;
    nights: number | null;
    fromLoc: string | null;
    toLoc: string | null;
    mode: string | null;
    merchant: string | null;
    paidBy: string;
    gross: number;
    disallowed: number;
    allowed: number;
    status: string;
    document: { filename: string; subject: string; extractedJson: string } | null;
  }[];
  approvals: {
    level: number;
    role: string;
    decision: string;
    remarks: string | null;
    decidedAt: Date | null;
    approver: { name: string } | null;
  }[];
};

export async function buildSettlementWorkbook(claim: ExportClaim): Promise<ExcelJS.Buffer> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(TEMPLATE);

  fillRequestSheet(workbook, claim);
  fillSettlementSheet(workbook, claim);

  return workbook.xlsx.writeBuffer();
}

function fillRequestSheet(workbook: ExcelJS.Workbook, claim: ExportClaim) {
  const sheet = workbook.getWorksheet("Travel Request Form");
  if (!sheet) return;
  const request = claim.travelRequest;

  set(sheet, "C5", request.trqId);
  set(sheet, "F5", formatDate(request.fromDate));
  set(sheet, "C8", request.employee.name);
  set(sheet, "F8", request.employee.empCode);
  set(sheet, "C9", request.employee.designation);
  set(sheet, "F9", request.employee.department);
  set(sheet, "C10", request.costCentre);
  set(sheet, "F10", request.approvals.find((a) => a.role === "Reporting Manager")?.approver?.name ?? "");

  set(sheet, "C13", formatDate(request.fromDate));
  set(sheet, "F13", formatDate(request.toDate));
  set(sheet, "C14", request.days);
  set(sheet, "F14", `${request.travelType === "INTERNATIONAL" ? "International" : "Domestic"} - ${request.cityClass.replace("_", " ")}`);
  set(sheet, "C15", request.destination);
  set(sheet, "F15", "INR");
  set(sheet, "C16", request.purpose);
  set(sheet, "F16", request.mode);

  const estimates = JSON.parse(request.estimateJson) as {
    head: string;
    basis: string;
    estimate: number;
    borneBy: string;
  }[];
  estimates.slice(0, 5).forEach((row, index) => {
    const r = 20 + index;
    set(sheet, `B${r}`, row.head);
    set(sheet, `C${r}`, row.basis);
    set(sheet, `D${r}`, row.estimate);
    set(sheet, `E${r}`, row.borneBy);
  });
  set(sheet, "D27", request.advanceRequested);

  request.approvals.slice(0, 5).forEach((step, index) => {
    const r = 31 + index;
    set(sheet, `D${r}`, step.approver?.name ?? "");
    set(sheet, `E${r}`, decisionWord(step.decision));
    set(sheet, `F${r}`, step.decidedAt ? formatDate(step.decidedAt) : "");
    set(sheet, `G${r}`, step.remarks ?? "");
  });
}

function fillSettlementSheet(workbook: ExcelJS.Workbook, claim: ExportClaim) {
  const sheet = workbook.getWorksheet("Expense Settlement Form");
  if (!sheet) return;

  set(sheet, "C5", claim.travelRequest.trqId);
  set(sheet, "F5", formatDate(claim.submittedAt ?? new Date()));
  set(sheet, "C6", claim.employee.name);
  set(sheet, "F6", claim.employee.empCode);
  set(sheet, "C7", claim.employee.costCentre);
  set(sheet, "F7", "INR");

  const live = claim.lines.filter((l) => l.status !== "REMOVED");

  // 1) Lodging
  writeSection(sheet, LODGING_ROWS, live.filter((l) => l.section === "LODGING"), (row, line) => {
    set(sheet, `B${row}`, line.checkIn ? formatDate(line.checkIn) : "");
    set(sheet, `C${row}`, line.checkOut ? formatDate(line.checkOut) : "");
    set(sheet, `D${row}`, line.nights ?? "");
    set(sheet, `E${row}`, line.merchant ?? line.description);
    set(sheet, `F${row}`, claim.travelRequest.destination.split("/")[0].trim());
    set(sheet, `G${row}`, line.paidBy);
    set(sheet, `H${row}`, line.gross);
    set(sheet, `I${row}`, proofRef(line));
  });

  // 2) Travel and transportation
  writeSection(sheet, TRANSPORT_ROWS, live.filter((l) => l.section === "TRANSPORT"), (row, line) => {
    set(sheet, `B${row}`, line.lineDate ? formatDate(line.lineDate) : "");
    set(sheet, `C${row}`, line.lineDate ? timeOf(line.lineDate) : "");
    set(sheet, `D${row}`, line.fromLoc ?? "");
    set(sheet, `E${row}`, line.toLoc ?? "");
    set(sheet, `F${row}`, line.mode ?? "");
    set(sheet, `G${row}`, line.paidBy);
    set(sheet, `H${row}`, line.gross);
    set(sheet, `I${row}`, proofRef(line));
  });

  // 3) Other expenses
  writeSection(sheet, OTHER_ROWS, live.filter((l) => l.section === "OTHER"), (row, line) => {
    set(sheet, `B${row}`, line.lineDate ? formatDate(line.lineDate) : "");
    set(sheet, `C${row}`, line.head);
    set(sheet, `D${row}`, line.description);
    set(sheet, `G${row}`, line.paidBy);
    set(sheet, `H${row}`, line.gross);
    set(sheet, `I${row}`, proofRef(line));
  });

  // 4) Settlement summary - only the two cells the template expects us to type.
  set(sheet, "H46", claim.disallowed);
  set(sheet, "H48", claim.advanceApplied);

  // The disallowed figure must carry its reason, per the form's own legend.
  const reasons = live
    .filter((l) => l.disallowed > 0)
    .map((l) => `${l.description} ${l.disallowed.toFixed(2)}`)
    .join("; ");
  if (reasons) set(sheet, "I46", `Disallowed: ${reasons}`);

  // 5) Approval and finance processing
  const steps = [
    {
      role: "Employee (submitted by)",
      name: claim.employee.name,
      decision: claim.submittedAt ? "Submitted" : "Draft",
      at: claim.submittedAt,
      remarks: claim.claimNo,
    },
    ...claim.approvals.map((step) => ({
      role: step.role,
      name: step.approver?.name ?? "",
      decision: decisionWord(step.decision),
      at: step.decidedAt,
      remarks: step.remarks ?? "",
    })),
  ];
  steps.slice(0, APPROVAL_ROWS.last - APPROVAL_ROWS.first + 1).forEach((step, index) => {
    const row = APPROVAL_ROWS.first + index;
    set(sheet, `C${row}`, step.role);
    set(sheet, `D${row}`, step.name);
    set(sheet, `E${row}`, step.decision);
    set(sheet, `F${row}`, step.at ? formatDate(step.at) : "");
    set(sheet, `G${row}`, step.remarks);
  });
}

/**
 * The paper form has a fixed number of rows per section. If a trip has more
 * lines than that, the last usable row says so instead of silently dropping
 * them - a short claim is a returned claim.
 */
function writeSection<T>(
  sheet: ExcelJS.Worksheet,
  rows: { first: number; last: number },
  lines: T[],
  write: (row: number, line: T) => void,
) {
  const capacity = rows.last - rows.first + 1;
  const fits = lines.length <= capacity ? lines : lines.slice(0, capacity - 1);

  fits.forEach((line, index) => write(rows.first + index, line));

  if (lines.length > capacity) {
    const overflowRow = rows.last;
    const remaining = lines.slice(capacity - 1) as unknown as { gross: number }[];
    const total = remaining.reduce((s, l) => s + l.gross, 0);
    set(sheet, `E${overflowRow}`, `+ ${remaining.length} further line(s) - see the claim in full`);
    set(sheet, `G${overflowRow}`, "Employee");
    set(sheet, `H${overflowRow}`, Math.round(total * 100) / 100);
  }
}

function set(sheet: ExcelJS.Worksheet, address: string, value: string | number) {
  const cell = sheet.getCell(address);
  if (typeof cell.value === "object" && cell.value !== null && "formula" in cell.value) return; // never overwrite a formula
  cell.value = value;
}

function proofRef(line: { document: { filename: string; extractedJson: string } | null }) {
  if (!line.document) return "NO PROOF";
  const extracted = JSON.parse(line.document.extractedJson) as { invoiceNo?: string; billNo?: string };
  const reference = extracted.invoiceNo ?? extracted.billNo;
  const file = line.document.filename.replace(/\.eml$/, "");
  return reference ? `${file} (${reference})` : file;
}

function timeOf(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function decisionWord(decision: string) {
  return (
    { PENDING: "Pending", APPROVED: "Approved", REJECTED: "Rejected", RETURNED: "Returned", SKIPPED: "Skipped" }[
      decision
    ] ?? decision
  );
}
