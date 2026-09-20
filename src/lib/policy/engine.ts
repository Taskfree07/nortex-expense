/**
 * The policy engine.
 *
 * In: a travel request plus everything the inbox produced.
 * Out: the settlement lines, the disallowances, and every flag a human needs to
 * see - each one carrying the clause of NTX-HR-POL-11 it comes from.
 *
 * The engine is pure. It touches no database and no network, which is what makes
 * the whole of it testable against the worked example in the pack.
 */

import { formatINR, round2, taxShare } from "../money";
import { addDays, formatDate, inclusiveDays, nextPaymentRun, ymd } from "../dates";
import {
  ADVANCE_CAP_RATIO,
  ENTERTAINMENT_PRIOR_APPROVAL_ABOVE,
  LODGING_CAP,
  MEAL_BILL_THRESHOLD,
  MEAL_CAP,
  SUBMISSION_WINDOW_DAYS,
  classifyCity,
  isFolioMeal,
  isTaxOrTotalRow,
  matchNonReimbursable,
  requiredApprovalRoles,
  type CityClass,
} from "./config";
import type { ParsedDocument } from "../ingest/types";

export type ProposedLine = {
  key: string;
  section: "LODGING" | "TRANSPORT" | "OTHER";
  head: string;
  description: string;
  lineDate?: string;
  checkIn?: string;
  checkOut?: string;
  nights?: number;
  fromLoc?: string;
  toLoc?: string;
  mode?: string;
  merchant?: string;
  cityClass?: CityClass;
  paidBy: "Employee" | "Company";
  gross: number;
  disallowed: number;
  allowed: number;
  reason: string;
  policyRefs: string[];
  attendees: string[];
  documentFilename?: string;
  sortOrder: number;
};

export type EngineFlag = {
  code: string;
  severity: "BLOCK" | "WARN" | "INFO";
  message: string;
  policyRef: string;
  detail?: string;
  lineKey?: string;
};

export type EngineTotals = {
  grossEmployee: number;
  grossCompany: number;
  disallowed: number;
  netClaim: number;
  advanceApplied: number;
  payable: number;
  recoverable: number;
};

export type EngineInput = {
  request: {
    trqId: string;
    destination: string;
    cityClass?: CityClass;
    fromDate: Date;
    toDate: Date;
    travelType?: "DOMESTIC" | "INTERNATIONAL";
    estimatedTotal: number;
    employeeBorneEstimate: number;
    advanceRequested: number;
    advanceDisbursed: number;
    approvedByRoles?: string[];
  };
  documents: ParsedDocument[];
  /** When the settlement is being filed. Defaults to now. */
  submittedAt?: Date;
};

export type EngineResult = {
  lines: ProposedLine[];
  flags: EngineFlag[];
  totals: EngineTotals;
  approvalChainRoles: string[];
  dueBy: Date;
  paymentRunDate: Date;
  mealAllowance: { days: number; capPerDay: number; cap: number; claimed: number };
};

export function runPolicyEngine(input: EngineInput): EngineResult {
  const cityClass = input.request.cityClass ?? classifyCity(input.request.destination);
  const lines: ProposedLine[] = [];
  const flags: EngineFlag[] = [];
  let order = 0;

  const add = (line: Omit<ProposedLine, "sortOrder">) => {
    lines.push({ ...line, sortOrder: order++ });
  };

  for (const doc of input.documents) {
    if (doc.excluded) {
      flags.push(excludedFlag(doc));
      continue;
    }
    switch (doc.classification) {
      case "HOTEL_INVOICE":
        buildLodgingLines(doc, cityClass, add, flags);
        break;
      case "CAB_RECEIPT":
        buildConveyanceLine(doc, add, flags);
        break;
      case "MEAL_BILL":
        buildMealLine(doc, cityClass, add, flags);
        break;
      case "ENTERTAINMENT_BILL":
        buildEntertainmentLine(doc, add, flags);
        break;
      case "FLIGHT_BOOKING":
        buildFlightLines(doc, add, flags);
        break;
      default:
        break;
    }
  }

  checkDatesInTrip(lines, input, flags);
  checkMissingProof(lines, flags);
  const mealAllowance = checkMealCap(lines, input, cityClass, flags);
  checkLodgingCoverage(lines, input, flags);
  checkReturnTransfer(lines, input, flags);

  const totals = computeTotals(lines, input.request.advanceDisbursed);

  checkAdvance(input, totals, flags);
  const approvalChainRoles = requiredApprovalRoles(
    totals.netClaim,
    input.request.travelType === "INTERNATIONAL",
  );
  checkRequestApproval(input, approvalChainRoles, flags);

  const submittedAt = input.submittedAt ?? new Date();
  const dueBy = addDays(input.request.toDate, SUBMISSION_WINDOW_DAYS);
  if (submittedAt.getTime() > dueBy.getTime()) {
    flags.push({
      code: "LATE_SUBMISSION",
      severity: "WARN",
      message: `Filed after the ${SUBMISSION_WINDOW_DAYS}-day window, which closed on ${formatDate(dueBy)}.`,
      policyRef: "5.1",
    });
  }

  return {
    lines,
    flags,
    totals,
    approvalChainRoles,
    dueBy,
    paymentRunDate: nextPaymentRun(submittedAt),
    mealAllowance,
  };
}

/* ------------------------------------------------------------------ lodging */

/**
 * A hotel folio is not one expense. It is a room, its tax, sometimes food, and
 * sometimes things the company never pays for. Policy 3.1 and 4 require each to
 * be shown separately, and the disallowed part to be *shown*, not dropped.
 */
function buildLodgingLines(
  doc: ParsedDocument,
  cityClass: CityClass,
  add: (l: Omit<ProposedLine, "sortOrder">) => void,
  flags: EngineFlag[],
) {
  const e = doc.extracted;
  // Tax and total rows are not charges: the bill's tax is carried separately, and
  // claiming it as a line as well would pay it twice.
  const folio = (e.folioLines ?? []).filter((l) => !isTaxOrTotalRow(l.description));
  const subTotal = e.subTotal ?? round2(folio.reduce((s, l) => s + l.amount, 0));
  const taxTotal = e.taxTotal ?? 0;
  const cap = LODGING_CAP[cityClass];

  const roomLines = folio.filter((l) => /room charge|room rent|tariff/i.test(l.description));
  const nights = e.nights ?? roomLines.length ?? 0;
  const roomTotal = round2(roomLines.reduce((s, l) => s + l.amount, 0)) || e.roomCharges || 0;
  const perNight = e.tariffPerNight ?? (nights ? round2(roomTotal / nights) : roomTotal);

  // Tariff above the cap is disallowed and must be shown as such (policy 3.1).
  const excessPerNight = round2(Math.max(0, perNight - cap));
  const roomTax = taxShare(roomTotal, subTotal, taxTotal);
  const roomExcess = round2(excessPerNight * nights);

  const lodgingKey = `lodging:${doc.filename}`;
  add({
    key: lodgingKey,
    section: "LODGING",
    head: "Lodging",
    description: `${e.merchant ?? "Hotel"} - ${nights} night(s) at ${formatINR(perNight)}/night + taxes`,
    checkIn: e.checkIn,
    checkOut: e.checkOut,
    nights,
    cityClass,
    merchant: e.merchant,
    paidBy: e.paidBy ?? "Employee",
    gross: round2(roomTotal + roomTax),
    disallowed: roomExcess,
    allowed: round2(roomTotal + roomTax - roomExcess),
    reason:
      excessPerNight > 0
        ? `Tariff ${formatINR(perNight)}/night is above the ${cityClass.replace("_", " ").toLowerCase()} limit of ${formatINR(cap)}. The excess is disallowed.`
        : `Within the ${cityClass.replace("_", " ").toLowerCase()} limit of ${formatINR(cap)}/night. Taxes on the room tariff are reimbursable in full.`,
    policyRefs: ["3.1"],
    attendees: [],
    documentFilename: doc.filename,
    lineDate: e.checkOut,
  });

  if (excessPerNight > 0) {
    flags.push({
      code: "LODGING_CAP_EXCEEDED",
      severity: "WARN",
      message: `Room tariff ${formatINR(perNight)}/night exceeds the ${formatINR(cap)}/night limit. ${formatINR(roomExcess)} is disallowed across ${nights} night(s).`,
      policyRef: "3.1",
      lineKey: lodgingKey,
    });
  }

  for (const [index, line] of folio.entries()) {
    if (roomLines.includes(line)) continue;
    const share = taxShare(line.amount, subTotal, taxTotal);
    const gross = round2(line.amount + share);
    const nonReimbursable = matchNonReimbursable(line.description);
    const key = `folio:${doc.filename}:${index}`;

    if (nonReimbursable) {
      add({
        key,
        section: "OTHER",
        head: "Non-reimbursable",
        description:
          `${line.description} on hotel folio ${e.invoiceNo ?? ""} (incl. tax ${formatINR(share)})`.trim(),
        lineDate: line.date,
        merchant: e.merchant,
        paidBy: "Employee",
        gross,
        disallowed: gross,
        allowed: 0,
        reason: `${nonReimbursable} is never reimbursed, even on a consolidated bill. Shown here rather than dropped.`,
        policyRefs: ["4", "5.3"],
        attendees: [],
        documentFilename: doc.filename,
      });
      flags.push({
        code: "NON_REIMBURSABLE_ON_FOLIO",
        severity: "INFO",
        message: `${nonReimbursable} on the hotel folio, ${formatINR(gross)} including its tax, is disallowed.`,
        policyRef: "4",
        lineKey: key,
      });
      continue;
    }

    if (isFolioMeal(line.description)) {
      // Food on a hotel folio is a meal, not lodging - it belongs under the meal cap.
      add({
        key,
        section: "OTHER",
        head: "Meals",
        description: `${line.description} at ${e.merchant ?? "hotel"} (incl. tax ${formatINR(share)})`,
        lineDate: line.date,
        merchant: e.merchant,
        paidBy: "Employee",
        gross,
        disallowed: 0,
        allowed: gross,
        reason: "Food billed to the room: claimed as a meal, not as lodging.",
        policyRefs: ["3.3"],
        attendees: [],
        documentFilename: doc.filename,
      });
      continue;
    }

    add({
      key,
      section: "OTHER",
      head: "Other",
      description: `${line.description} on hotel folio (incl. tax ${formatINR(share)})`,
      lineDate: line.date,
      merchant: e.merchant,
      paidBy: "Employee",
      gross,
      disallowed: 0,
      allowed: gross,
      reason: "Folio line with no specific rule. Confirm before submitting.",
      policyRefs: [],
      attendees: [],
      documentFilename: doc.filename,
    });
    flags.push({
      code: "UNCLASSIFIED_FOLIO_LINE",
      severity: "WARN",
      message: `"${line.description}" on the hotel folio has no matching policy rule - please confirm it is claimable.`,
      policyRef: "4",
      lineKey: key,
    });
  }
}

/* -------------------------------------------------------------- conveyance */

function buildConveyanceLine(
  doc: ParsedDocument,
  add: (l: Omit<ProposedLine, "sortOrder">) => void,
  flags: EngineFlag[],
) {
  const e = doc.extracted;
  const amount = e.amount ?? 0;
  const key = `cab:${doc.filename}`;
  const airport = /airport|\b(pnq|blr|maa|del|bom|hyd|ccu)\b/i.test(`${e.pickup ?? ""} ${e.drop ?? ""}`);

  add({
    key,
    section: "TRANSPORT",
    head: "Local conveyance",
    description: `${e.merchant ?? "Cab"} - ${e.pickup ?? "?"} to ${e.drop ?? "?"}`,
    lineDate: e.occurredAt,
    fromLoc: e.pickup,
    toLoc: e.drop,
    mode: "Cab",
    merchant: e.merchant,
    paidBy: e.paidBy ?? "Employee",
    gross: amount,
    disallowed: 0,
    allowed: amount,
    reason: airport
      ? "Airport transfer, reimbursed on actuals against the receipt."
      : "Local conveyance on actuals against the receipt.",
    policyRefs: ["3.4"],
    attendees: [],
    documentFilename: doc.filename,
  });

  if (!amount) {
    flags.push({
      code: "AMOUNT_NOT_READ",
      severity: "BLOCK",
      message: `No amount could be read from ${doc.filename}.`,
      policyRef: "5.2",
      lineKey: key,
    });
  }
}

/* -------------------------------------------------------------------- meals */

function buildMealLine(
  doc: ParsedDocument,
  cityClass: CityClass,
  add: (l: Omit<ProposedLine, "sortOrder">) => void,
  flags: EngineFlag[],
) {
  const e = doc.extracted;
  const amount = e.amount ?? 0;
  const key = `meal:${doc.filename}`;

  add({
    key,
    section: "OTHER",
    head: "Meals",
    description: `${e.merchant ?? "Meal"}${e.billNo ? ` - bill ${e.billNo}` : ""}`,
    lineDate: e.occurredAt,
    merchant: e.merchant,
    cityClass,
    paidBy: e.paidBy ?? "Employee",
    gross: amount,
    disallowed: 0,
    allowed: amount,
    reason: `Meal on actuals, within the ${MEAL_CAP[cityClass]}/day limit for this city class.`,
    policyRefs: ["3.3"],
    attendees: [],
    documentFilename: doc.filename,
  });

  if (amount > MEAL_BILL_THRESHOLD && !doc.extracted.billNo && doc.kind !== "RECEIPT_IMAGE") {
    flags.push({
      code: "MEAL_BILL_REQUIRED",
      severity: "WARN",
      message: `A meal above ${MEAL_BILL_THRESHOLD} needs a bill.`,
      policyRef: "3.3",
      lineKey: key,
    });
  }
}

/* ----------------------------------------------------------- entertainment */

function buildEntertainmentLine(
  doc: ParsedDocument,
  add: (l: Omit<ProposedLine, "sortOrder">) => void,
  flags: EngineFlag[],
) {
  const e = doc.extracted;
  const amount = e.amount ?? 0;
  const attendees = e.attendees ?? [];
  const key = `ent:${doc.filename}`;

  add({
    key,
    section: "OTHER",
    head: "Business entertainment",
    description: `${e.merchant ?? "Restaurant"} - customer dinner${e.covers ? `, ${e.covers} covers` : ""}${
      e.attendeeOrg ? ` (${e.attendeeOrg})` : ""
    }`,
    lineDate: e.occurredAt,
    merchant: e.merchant,
    paidBy: e.paidBy ?? "Employee",
    gross: amount,
    disallowed: 0,
    allowed: amount,
    reason: "Hosted for a customer, so it is business entertainment and not the meal allowance.",
    policyRefs: ["3.5"],
    attendees,
    documentFilename: doc.filename,
  });

  if (attendees.length === 0) {
    flags.push({
      code: "ENTERTAINMENT_ATTENDEES_MISSING",
      severity: "BLOCK",
      message:
        "Business entertainment needs the names and organisation of the attendees. The bill shows the covers but not who they were.",
      policyRef: "3.5",
      lineKey: key,
    });
  }
  if (amount > ENTERTAINMENT_PRIOR_APPROVAL_ABOVE) {
    flags.push({
      code: "ENTERTAINMENT_PRIOR_APPROVAL",
      severity: "BLOCK",
      message: `Business entertainment above ${ENTERTAINMENT_PRIOR_APPROVAL_ABOVE} needs prior approval from the Head of Department. No such approval is on record for this trip.`,
      policyRef: "3.5",
      lineKey: key,
    });
  }
  if (e.folioLines?.some((l) => matchNonReimbursable(l.description))) {
    flags.push({
      code: "ALCOHOL_ON_ENTERTAINMENT",
      severity: "WARN",
      message:
        "The bill contains an item that is normally non-reimbursable. Alcohol is allowed only as part of an approved business entertainment claim.",
      policyRef: "4",
      lineKey: key,
    });
  }
}

/* ------------------------------------------------------------------ flights */

/**
 * Policy 3.2 - flights are booked centrally and billed to the company. They are
 * not reimbursed. They still belong on the form as "Company" rows: the audit
 * trail and the economy-class check both need them.
 */
function buildFlightLines(
  doc: ParsedDocument,
  add: (l: Omit<ProposedLine, "sortOrder">) => void,
  flags: EngineFlag[],
) {
  const e = doc.extracted;
  const sectors = e.sectors ?? [];
  for (const [index, sector] of sectors.entries()) {
    add({
      key: `flight:${doc.filename}:${index}`,
      section: "TRANSPORT",
      head: "Air travel",
      description: `${sector.flight ?? "Flight"} ${sector.from} - ${sector.to}${e.pnr ? ` (PNR ${e.pnr})` : ""}`,
      lineDate: sector.date,
      fromLoc: sector.from,
      toLoc: sector.to,
      mode: "Flight",
      merchant: e.merchant,
      paidBy: "Company",
      gross: sector.total,
      disallowed: 0,
      allowed: 0,
      reason:
        "Booked through the travel desk and billed to the company. Recorded for the record, not reimbursed.",
      policyRefs: ["3.2"],
      attendees: [],
      documentFilename: doc.filename,
    });
  }
  if (e.cabinClass && !/economy/i.test(e.cabinClass)) {
    flags.push({
      code: "NON_ECONOMY_FLIGHT",
      severity: "WARN",
      message: `Domestic air travel must be economy class. This ticket reads "${e.cabinClass}".`,
      policyRef: "3.2",
    });
  }
}

/* -------------------------------------------------------------- claim rules */

function excludedFlag(doc: ParsedDocument): EngineFlag {
  const byCode: Record<string, { code: string; severity: EngineFlag["severity"]; ref: string }> = {
    THIRD_PARTY_EXPENSE: { code: "THIRD_PARTY_EXPENSE", severity: "INFO", ref: "4" },
    PAYMENT_FAILED: { code: "PAYMENT_FAILED_NOTICE", severity: "INFO", ref: "5.2" },
    PROMOTION: { code: "NOISE", severity: "INFO", ref: "" },
  };
  const meta = byCode[doc.classification] ?? {
    code: "DUPLICATE_BILL",
    severity: "INFO" as const,
    ref: "5.3",
  };
  return {
    code: meta.code,
    severity: meta.severity,
    message: `${doc.filename}: ${doc.excludeReason ?? "Excluded."}`,
    policyRef: meta.ref,
    detail: doc.subject,
  };
}

/** Policy 5.2 - a claim line without a proof reference is returned. */
function checkMissingProof(lines: ProposedLine[], flags: EngineFlag[]) {
  for (const line of lines) {
    if (line.paidBy === "Employee" && line.allowed > 0 && !line.documentFilename) {
      flags.push({
        code: "MISSING_PROOF",
        severity: "BLOCK",
        message: `"${line.description}" has no supporting document. A claim line without a proof reference is returned.`,
        policyRef: "5.2",
        lineKey: line.key,
      });
    }
  }
}

/** An expense dated outside the trip window is not part of this settlement. */
function checkDatesInTrip(lines: ProposedLine[], input: EngineInput, flags: EngineFlag[]) {
  const from = new Date(`${ymd(input.request.fromDate)}T00:00:00+05:30`).getTime();
  const to = new Date(`${ymd(input.request.toDate)}T23:59:59+05:30`).getTime();
  for (const line of lines) {
    if (!line.lineDate) continue;
    const t = new Date(line.lineDate).getTime();
    if (t < from || t > to) {
      flags.push({
        code: "OUTSIDE_TRIP_DATES",
        severity: "WARN",
        message: `"${line.description}" is dated ${formatDate(line.lineDate)}, outside the trip window ${formatDate(
          input.request.fromDate,
        )} to ${formatDate(input.request.toDate)}.`,
        policyRef: "1.1",
        lineKey: line.key,
      });
    }
  }
}

/** Policy 3.3 - meals on actuals, capped per day. Travel days count in full. */
function checkMealCap(
  lines: ProposedLine[],
  input: EngineInput,
  cityClass: CityClass,
  flags: EngineFlag[],
) {
  const days = inclusiveDays(input.request.fromDate, input.request.toDate);
  const capPerDay = MEAL_CAP[cityClass];
  const cap = round2(days * capPerDay);
  const mealLines = lines.filter((l) => l.head === "Meals");
  const claimed = round2(mealLines.reduce((s, l) => s + l.allowed, 0));

  if (claimed > cap) {
    let excess = round2(claimed - cap);
    for (const line of [...mealLines].reverse()) {
      if (excess <= 0) break;
      const cut = Math.min(excess, line.allowed);
      line.disallowed = round2(line.disallowed + cut);
      line.allowed = round2(line.allowed - cut);
      line.reason += ` Trimmed by ${formatINR(cut)} to stay inside the meal cap.`;
      excess = round2(excess - cut);
    }
    flags.push({
      code: "MEAL_CAP_EXCEEDED",
      severity: "WARN",
      message: `Meals claimed ${formatINR(claimed)} against a cap of ${formatINR(cap)} (${days} days at ${formatINR(capPerDay)}). The excess is disallowed.`,
      policyRef: "3.3",
    });
  }

  // Two meal bills on the same day is not automatically wrong - but a human should look.
  const byDay = new Map<string, number>();
  for (const line of mealLines) {
    if (!line.lineDate) continue;
    const day = ymd(new Date(line.lineDate));
    byDay.set(day, (byDay.get(day) ?? 0) + 1);
  }
  for (const [day, count] of byDay) {
    if (count > 1) {
      flags.push({
        code: "MULTIPLE_MEALS_SAME_DAY",
        severity: "INFO",
        message: `${count} meal bills on ${day}. Within the daily cap, but worth a look.`,
        policyRef: "3.3",
      });
    }
  }

  return { days, capPerDay, cap, claimed };
}

/** Nights on the trip with no lodging behind them: ask, never invent. */
function checkLodgingCoverage(lines: ProposedLine[], input: EngineInput, flags: EngineFlag[]) {
  const tripNights = Math.max(0, inclusiveDays(input.request.fromDate, input.request.toDate) - 1);
  const claimedNights = lines
    .filter((l) => l.section === "LODGING")
    .reduce((s, l) => s + (l.nights ?? 0), 0);

  if (claimedNights < tripNights) {
    flags.push({
      code: "LODGING_GAP",
      severity: "WARN",
      message: `The trip spans ${tripNights} night(s) but only ${claimedNights} night(s) of lodging are on record. Confirm where the remaining night(s) were spent - nothing has been assumed.`,
      policyRef: "3.1",
    });
  }
}

/** A trip that starts with an airport transfer usually ends with one. */
function checkReturnTransfer(lines: ProposedLine[], input: EngineInput, flags: EngineFlag[]) {
  const transfers = lines.filter(
    (l) =>
      l.head === "Local conveyance" &&
      /airport|\b(pnq|blr|maa|del|bom|hyd|ccu)\b/i.test(`${l.fromLoc ?? ""} ${l.toLoc ?? ""}`),
  );
  const destinationDeparture = transfers.some((l) => {
    if (!l.lineDate) return false;
    const sameDay = ymd(new Date(l.lineDate)) === ymd(input.request.toDate);
    return sameDay && /airport|\b(blr|maa|del|bom|hyd|ccu)\b/i.test(l.toLoc ?? "");
  });
  if (transfers.length > 0 && !destinationDeparture) {
    flags.push({
      code: "MISSING_RETURN_TRANSFER",
      severity: "INFO",
      message:
        "No cab to the airport at the destination on the return day. If one was paid for, the receipt is missing; if not, ignore this.",
      policyRef: "3.4",
    });
  }
}

/** Policy 1.2 and 1.3 - the advance ceiling, and how it settles. */
function checkAdvance(input: EngineInput, totals: EngineTotals, flags: EngineFlag[]) {
  const cap = round2(input.request.employeeBorneEstimate * ADVANCE_CAP_RATIO);
  if (input.request.advanceRequested > cap) {
    flags.push({
      code: "ADVANCE_ABOVE_CAP",
      severity: "WARN",
      message: `The advance of ${formatINR(input.request.advanceRequested)} is above the ${Math.round(
        ADVANCE_CAP_RATIO * 100,
      )}% ceiling of ${formatINR(cap)} on the ${formatINR(input.request.employeeBorneEstimate)} the employee was expected to bear.`,
      policyRef: "1.2",
    });
  }
  if (totals.recoverable > 0) {
    flags.push({
      code: "ADVANCE_RECOVERABLE",
      severity: "INFO",
      message: `The claim is below the advance drawn. ${formatINR(totals.recoverable)} is recoverable and is deducted from the next payroll cycle.`,
      policyRef: "1.3",
    });
  }
}

/** Policy 2 - was the request itself approved by everyone it needed? */
function checkRequestApproval(input: EngineInput, chainForClaim: string[], flags: EngineFlag[]) {
  const approved = input.request.approvedByRoles ?? [];
  const requiredAtRequest = requiredApprovalRoles(
    input.request.estimatedTotal,
    input.request.travelType === "INTERNATIONAL",
  );
  const missing = requiredAtRequest.filter((r) => !approved.includes(r));
  if (approved.length > 0 && missing.length > 0) {
    flags.push({
      code: "REQUEST_APPROVAL_INCOMPLETE",
      severity: "WARN",
      message: `The estimate of ${formatINR(input.request.estimatedTotal)} needed ${requiredAtRequest.join(
        ", ",
      )}. On record: ${approved.join(", ") || "none"}. Missing: ${missing.join(", ")}.`,
      policyRef: "2",
    });
  }
  if (chainForClaim.length > requiredAtRequest.length) {
    flags.push({
      code: "CLAIM_ABOVE_ESTIMATE_BAND",
      severity: "INFO",
      message: `The claimed value falls in a higher approval band than the estimate, so this settlement needs ${chainForClaim.join(
        ", ",
      )}.`,
      policyRef: "2",
    });
  }
}

export function computeTotals(lines: ProposedLine[], advanceDisbursed: number): EngineTotals {
  const employeeLines = lines.filter((l) => l.paidBy === "Employee");
  const grossEmployee = round2(employeeLines.reduce((s, l) => s + l.gross, 0));
  const grossCompany = round2(lines.filter((l) => l.paidBy === "Company").reduce((s, l) => s + l.gross, 0));
  const disallowed = round2(employeeLines.reduce((s, l) => s + l.disallowed, 0));
  const netClaim = round2(grossEmployee - disallowed);
  const advanceApplied = round2(advanceDisbursed);
  const difference = round2(netClaim - advanceApplied);

  return {
    grossEmployee,
    grossCompany,
    disallowed,
    netClaim,
    advanceApplied,
    payable: difference > 0 ? difference : 0,
    recoverable: difference < 0 ? round2(-difference) : 0,
  };
}
