/**
 * Seeds the company: the nine people from employee_master.csv, the expense
 * categories an Admin would have configured, and Chaitanya's approved trip to
 * Bengaluru - exactly as the email trail in the pack describes it.
 *
 * The inbox is deliberately NOT seeded. Reading it is the thing the app does.
 */

import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";
import path from "path";

const prisma = new PrismaClient();

const PACK = path.join(process.cwd(), "data", "pack");

type Row = Record<string, string>;

function readCsv(file: string): Row[] {
  const text = readFileSync(file, "utf8").trim();
  const [header, ...lines] = text.split(/\r?\n/);
  const cols = header.split(",");
  return lines.map((line) => {
    const cells = line.split(",");
    return Object.fromEntries(cols.map((c, i) => [c.trim(), (cells[i] ?? "").trim()]));
  });
}

const CATEGORIES = [
  {
    code: "DOM_TRAVEL",
    name: "Domestic travel",
    description: "Pre-trip request with booking, an advance if you need one, and settlement against your bills.",
    stagesJson: JSON.stringify([
      { key: "TRAVEL_REQUEST", label: "Travel request", hint: "You are here" },
      { key: "TRIP_APPROVAL", label: "Trip approval", hint: "Goes for a decision" },
      { key: "ADVANCE_DISBURSEMENT", label: "Advance disbursement", hint: "Advance reaches you" },
      { key: "TRIP_SETTLEMENT", label: "Trip settlement", hint: "You file bills and actuals" },
      { key: "FINANCE_REVIEW", label: "Finance review", hint: "Verification against policy" },
      { key: "PAYOUT", label: "Payout", hint: "Paid and closed" },
    ]),
    approversJson: JSON.stringify([
      { level: 1, role: "Reporting Manager", thresholdAbove: 0 },
      { level: 2, role: "Head of Department", thresholdAbove: 25000 },
      { level: 3, role: "Head of Division", thresholdAbove: 75000 },
      { level: 4, role: "MD", thresholdAbove: 200000 },
    ]),
    rulesJson: JSON.stringify([
      "LODGING_CAP", "NON_REIMBURSABLE", "MEAL_CAP", "ENTERTAINMENT_APPROVAL",
      "DUPLICATE_BILL", "MISSING_PROOF", "ADVANCE_CAP", "SUBMISSION_WINDOW", "THIRD_PARTY",
    ]),
    version: 6,
  },
  {
    code: "CONFERENCE",
    name: "Conference & training",
    description: "Courses, certifications and conference passes, with your manager's sign-off.",
    stagesJson: JSON.stringify([
      { key: "CLAIM", label: "Claim", hint: "You file the bill" },
      { key: "MANAGER_APPROVAL", label: "Manager approval", hint: "Goes for a decision" },
      { key: "PAYOUT", label: "Payout", hint: "Paid and closed" },
    ]),
    approversJson: JSON.stringify([{ level: 1, role: "Reporting Manager", thresholdAbove: 0 }]),
    rulesJson: JSON.stringify(["MISSING_PROOF", "DUPLICATE_BILL"]),
    version: 1,
  },
  {
    code: "GENERAL_EXPENSE",
    name: "General expense",
    description: "Anything without a category of its own - add as many expense rows as you need.",
    stagesJson: JSON.stringify([
      { key: "CLAIM", label: "Claim", hint: "You file the bill" },
      { key: "MANAGER_APPROVAL", label: "Manager approval", hint: "Goes for a decision" },
      { key: "PAYOUT", label: "Payout", hint: "Paid and closed" },
    ]),
    approversJson: JSON.stringify([{ level: 1, role: "Reporting Manager", thresholdAbove: 0 }]),
    rulesJson: JSON.stringify(["MISSING_PROOF", "DUPLICATE_BILL", "NON_REIMBURSABLE"]),
    version: 1,
  },
];

async function main() {
  console.log("Seeding Nortex Industries...");

  await prisma.auditEvent.deleteMany();
  await prisma.flag.deleteMany();
  await prisma.approvalStep.deleteMany();
  await prisma.claimLine.deleteMany();
  await prisma.claim.deleteMany();
  await prisma.document.deleteMany();
  await prisma.travelRequest.deleteMany();
  await prisma.category.deleteMany();
  await prisma.employee.deleteMany();

  const rows = readCsv(path.join(PACK, "employee_master.csv"));

  // Two passes: everyone exists before anyone points at their manager.
  for (const r of rows) {
    await prisma.employee.create({
      data: {
        empCode: r.emp_code,
        name: r.name,
        email: r.email,
        designation: r.designation,
        department: r.department,
        costCentre: r.cost_centre,
        city: r.city,
        role: r.role,
      },
    });
  }
  for (const r of rows) {
    if (!r.reporting_manager_code) continue;
    await prisma.employee.update({
      where: { empCode: r.emp_code },
      data: { managerCode: r.reporting_manager_code },
    });
  }
  console.log(`  ${rows.length} employees`);

  for (const category of CATEGORIES) await prisma.category.create({ data: category });
  console.log(`  ${CATEGORIES.length} categories`);

  // The trip the pack documents. Policy 1.1: the request carries the ID that
  // every downstream artefact is tracked against.
  const request = await prisma.travelRequest.create({
    data: {
      trqId: "TRQ-2026-0001",
      employeeCode: "NX-4471",
      categoryCode: "DOM_TRAVEL",
      purpose: "Customer meeting + site visit - Vertex account review and plant visit",
      destination: "Bengaluru / Vertex Technologies",
      cityClass: "TIER_1",
      travelType: "DOMESTIC",
      mode: "Flight",
      costCentre: "CE110",
      fromDate: new Date("2026-06-16T00:00:00+05:30"),
      toDate: new Date("2026-06-20T00:00:00+05:30"),
      days: 5,
      estimateJson: JSON.stringify([
        { head: "Air / Rail", basis: "Return, economy", estimate: 10500, borneBy: "Company" },
        { head: "Lodging", basis: "4 nights", estimate: 23000, borneBy: "Company" },
        { head: "Local conveyance", basis: "Actuals", estimate: 4000, borneBy: "Employee" },
        { head: "Meals / allowance", basis: "As per policy", estimate: 6000, borneBy: "Employee" },
      ]),
      estimatedTotal: 43500,
      advanceRequested: 20000,
      advanceDisbursed: 20000,
      advanceRef: "ADV/2026/0619",
      status: "APPROVED",
      createdAt: new Date("2026-06-08T11:12:04+05:30"),
    },
  });

  // What actually happened: the Reporting Manager approved on 8 Jun. The Head of
  // Department never did - the engine flags that against the approval matrix.
  await prisma.approvalStep.createMany({
    data: [
      {
        travelRequestId: request.id,
        level: 1,
        role: "Reporting Manager",
        approverCode: "NX-2210",
        decision: "APPROVED",
        remarks: "Approved. Please keep the hotel within the 6000/night limit for Bengaluru.",
        decidedAt: new Date("2026-06-08T18:40:55+05:30"),
        requiredBecause: "Every travel request needs the Reporting Manager (policy 2).",
      },
      {
        travelRequestId: request.id,
        level: 2,
        role: "Head of Department",
        approverCode: "NX-1108",
        decision: "PENDING",
        requiredBecause: "An estimate of 43,500 falls in the 25,001 - 75,000 band (policy 2).",
      },
    ],
  });

  await prisma.auditEvent.createMany({
    data: [
      {
        entity: "TRAVEL_REQUEST",
        entityId: request.id,
        actorCode: "NX-4471",
        action: "REQUEST_RAISED",
        detailJson: JSON.stringify({ estimatedTotal: 43500, advanceRequested: 20000 }),
        at: new Date("2026-06-08T11:12:04+05:30"),
      },
      {
        entity: "TRAVEL_REQUEST",
        entityId: request.id,
        actorCode: "NX-2210",
        action: "APPROVED",
        detailJson: JSON.stringify({ level: 1, role: "Reporting Manager" }),
        at: new Date("2026-06-08T18:40:55+05:30"),
      },
      {
        entity: "TRAVEL_REQUEST",
        entityId: request.id,
        actorCode: "NX-3305",
        action: "ADVANCE_DISBURSED",
        detailJson: JSON.stringify({ amount: 20000, ref: "ADV/2026/0619" }),
        at: new Date("2026-06-10T15:02:11+05:30"),
      },
    ],
  });

  console.log(`  travel request ${request.trqId} (approved, advance ${request.advanceDisbursed})`);
  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
