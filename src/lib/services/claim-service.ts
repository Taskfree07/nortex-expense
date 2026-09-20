/**
 * Everything that happens to a claim between the inbox and the bank transfer.
 *
 * The policy engine decides what is true; this file decides what is stored, who
 * is asked next, and what the audit trail records.
 */

import { db } from "../db";
import { ingestPack, ingestUploads, type Claimant, type UploadedFile } from "../ingest/pipeline";
import { markDuplicates } from "../ingest/parsers";
import type { ParsedDocument } from "../ingest/types";
import { runPolicyEngine, type EngineResult, type ProposedLine } from "../policy/engine";
import { resolveApprovalChain, type Person } from "../policy/approvals";
import { requiredApprovalRoles } from "../policy/config";
import { formatINR, round2 } from "../money";
import { addDays, nextPaymentRun } from "../dates";
import type { CityClass } from "../policy/config";

/* --------------------------------------------------------------- utilities */

async function people(): Promise<Map<string, Person>> {
  const rows = await db.employee.findMany();
  return new Map(
    rows.map((r) => [
      r.empCode,
      {
        empCode: r.empCode,
        name: r.name,
        email: r.email,
        role: r.role,
        designation: r.designation,
        department: r.department,
        managerCode: r.managerCode,
      },
    ]),
  );
}

async function audit(
  entity: string,
  entityId: string,
  actorCode: string | null,
  action: string,
  detail: Record<string, unknown> = {},
) {
  await db.auditEvent.create({
    data: { entity, entityId, actorCode, action, detailJson: JSON.stringify(detail) },
  });
}

async function nextClaimNo(): Promise<string> {
  const count = await db.claim.count();
  return `CLM-2026-${String(count + 1).padStart(6, "0")}`;
}

/* ---------------------------------------------------------- evidence in */

/**
 * The sample trip that ships with the app. It replaces whatever was on the
 * request, so pressing it twice is safe - and it is offered only on the seeded
 * trip, because its bills belong to that trip and nobody else's.
 */
export async function importInboxForRequest(trqId: string, actorCode: string) {
  const { request, claimant } = await loadRequest(trqId);
  const parsed = await ingestPack(claimant);

  await db.document.deleteMany({ where: { travelRequestId: request.id } });
  for (const doc of parsed) await storeDocument(request.id, doc);

  const claimId = await redraft(trqId, actorCode, "INBOX_IMPORTED");
  return { claimId };
}

/**
 * Evidence the employee dropped on their own trip: .eml files, photographs of
 * bills, PDFs. It is added to what is already on the request, checked against
 * it for duplicates, and the settlement is redrafted from the lot.
 */
export async function addUploadedEvidence(trqId: string, files: UploadedFile[], actorCode: string) {
  const { request, claimant } = await loadRequest(trqId);
  if (request.employeeCode !== actorCode) {
    throw new Error("Only the person who made the trip can add evidence to it.");
  }
  if (files.length === 0) throw new Error("No files were attached.");

  const existing = (await db.document.findMany({ where: { travelRequestId: request.id } })).map(toParsed);
  const parsed = await ingestUploads(files, claimant, existing);
  for (const doc of parsed) await storeDocument(request.id, doc);

  const claimId = await redraft(trqId, actorCode, "EVIDENCE_ADDED");
  return {
    claimId,
    added: parsed.length,
    unreadable: parsed.filter((d) => d.needsReview).length,
    duplicates: parsed.filter((d) => d.excluded).length,
  };
}

async function loadRequest(trqId: string) {
  const request = await db.travelRequest.findUnique({
    where: { trqId },
    include: { employee: true, approvals: true },
  });
  if (!request) throw new Error(`No travel request ${trqId}`);
  const claimant: Claimant = { email: request.employee.email, name: request.employee.name };
  return { request, claimant };
}

async function storeDocument(travelRequestId: string, doc: ParsedDocument) {
  return db.document.create({
    data: {
      travelRequestId,
      source: doc.source,
      kind: doc.imagePath || doc.fileBase64 ? "RECEIPT_IMAGE" : "EMAIL",
      filename: doc.filename,
      messageId: doc.messageId,
      fromAddr: doc.fromAddr,
      toAddr: doc.toAddr,
      subject: doc.subject,
      sentAt: doc.sentAt,
      rawText: doc.rawText,
      imagePath: doc.imagePath,
      fileData: doc.fileBase64,
      mimeType: doc.mimeType,
      classification: doc.classification,
      parsedBy: doc.parsedBy,
      confidence: doc.confidence,
      extractedJson: JSON.stringify(doc.extracted),
      fingerprint: doc.fingerprint,
      excluded: doc.excluded,
      excludeReason: doc.excludeReason,
      needsReview: doc.needsReview ?? false,
    },
  });
}

type DocumentRow = {
  filename: string;
  source: string;
  kind: string;
  messageId: string | null;
  fromAddr: string;
  toAddr: string;
  subject: string;
  sentAt: Date | null;
  rawText: string;
  imagePath: string | null;
  classification: string;
  parsedBy: string;
  confidence: number;
  extractedJson: string;
  fingerprint: string | null;
  excluded: boolean;
  excludeReason: string | null;
  needsReview: boolean;
};

/** A stored document, back in the shape the engine reads. */
function toParsed(row: DocumentRow): ParsedDocument {
  return {
    filename: row.filename,
    source: row.source as ParsedDocument["source"],
    kind: row.kind as ParsedDocument["kind"],
    messageId: row.messageId ?? undefined,
    fromAddr: row.fromAddr,
    toAddr: row.toAddr,
    subject: row.subject,
    sentAt: row.sentAt,
    rawText: row.rawText,
    imagePath: row.imagePath ?? undefined,
    classification: row.classification as ParsedDocument["classification"],
    parsedBy: row.parsedBy as ParsedDocument["parsedBy"],
    confidence: row.confidence,
    extracted: JSON.parse(row.extractedJson),
    fingerprint: row.fingerprint,
    excluded: row.excluded,
    excludeReason: row.excludeReason ?? undefined,
    needsReview: row.needsReview,
  };
}

/**
 * Runs the policy engine over every document on the request and rewrites the
 * draft from the result. The documents are the record; the lines are derived,
 * which is why adding one more bill cannot leave a stale total behind.
 */
async function redraft(trqId: string, actorCode: string, action: string) {
  const { request } = await loadRequest(trqId);
  const rows = await db.document.findMany({ where: { travelRequestId: request.id } });
  const parsed = rows.map(toParsed);

  // Duplicate detection is derived, not a decision taken once at upload: the
  // same bill can arrive as an email today and a photograph tomorrow. Re-running
  // it over everything on the trip means a claim repairs itself on the next
  // redraft instead of carrying a double charge forever.
  markDuplicates(parsed);
  for (const [index, doc] of parsed.entries()) {
    const row = rows[index];
    if (doc.excluded === row.excluded) continue;
    await db.document.update({
      where: { id: row.id },
      data: { excluded: doc.excluded, excludeReason: doc.excludeReason ?? null },
    });
    row.excluded = doc.excluded;
    row.excludeReason = doc.excludeReason ?? null;
  }

  const approvedRoles = request.approvals.filter((a) => a.decision === "APPROVED").map((a) => a.role);
  const estimates: { borneBy: string; estimate: number }[] = JSON.parse(request.estimateJson);
  const employeeBorne = round2(
    estimates.filter((e) => e.borneBy === "Employee").reduce((s, e) => s + e.estimate, 0),
  );

  const engine = runPolicyEngine({
    request: {
      trqId: request.trqId,
      destination: request.destination,
      cityClass: request.cityClass as CityClass,
      fromDate: request.fromDate,
      toDate: request.toDate,
      travelType: request.travelType as "DOMESTIC" | "INTERNATIONAL",
      estimatedTotal: request.estimatedTotal,
      employeeBorneEstimate: employeeBorne,
      advanceRequested: request.advanceRequested,
      advanceDisbursed: request.advanceDisbursed,
      approvedByRoles: approvedRoles,
    },
    documents: parsed,
    submittedAt: new Date(),
  });

  // One draft per request: redrafting refreshes it rather than stacking claims.
  const open = await db.claim.findFirst({
    where: { travelRequestId: request.id, status: { in: ["DRAFT", "RETURNED"] } },
  });
  const claim =
    open ??
    (await db.claim.create({
      data: {
        claimNo: await nextClaimNo(),
        travelRequestId: request.id,
        employeeCode: request.employeeCode,
        status: "DRAFT",
        advanceApplied: request.advanceDisbursed,
        dueBy: addDays(request.toDate, 7),
      },
    }));

  // A line the employee struck out stays struck out, and one they typed in stays
  // theirs. Everything else is rebuilt from the evidence.
  const kept = await db.claimLine.findMany({
    where: { claimId: claim.id, OR: [{ status: "REMOVED" }, { reason: "Added by the employee." }] },
  });
  const removedDescriptions = new Set(kept.filter((l) => l.status === "REMOVED").map((l) => l.description));

  await db.claimLine.deleteMany({
    where: {
      claimId: claim.id,
      reason: { not: "Added by the employee." },
      status: { not: "REMOVED" },
    },
  });
  await db.flag.deleteMany({ where: { claimId: claim.id, resolved: false } });

  const documentByFilename = new Map(rows.map((d) => [d.filename, d]));
  const lineIdByKey = new Map<string, string>();

  for (const line of engine.lines) {
    if (removedDescriptions.has(line.description)) continue;
    const created = await db.claimLine.create({
      data: {
        claimId: claim.id,
        section: line.section,
        head: line.head,
        description: line.description,
        lineDate: line.lineDate ? new Date(line.lineDate) : null,
        checkIn: line.checkIn ? new Date(line.checkIn) : null,
        checkOut: line.checkOut ? new Date(line.checkOut) : null,
        nights: line.nights,
        fromLoc: line.fromLoc,
        toLoc: line.toLoc,
        mode: line.mode,
        merchant: line.merchant,
        cityClass: line.cityClass,
        paidBy: line.paidBy,
        gross: line.gross,
        disallowed: line.disallowed,
        allowed: line.allowed,
        policyRefsJson: JSON.stringify(line.policyRefs),
        attendeesJson: JSON.stringify(line.attendees),
        reason: line.reason,
        status: "SUGGESTED",
        sortOrder: line.sortOrder,
        documentId: line.documentFilename ? documentByFilename.get(line.documentFilename)?.id : null,
      },
    });
    lineIdByKey.set(line.key, created.id);
  }

  for (const flag of engine.flags) {
    await db.flag.create({
      data: {
        claimId: claim.id,
        lineId: flag.lineKey ? (lineIdByKey.get(flag.lineKey) ?? null) : null,
        code: flag.code,
        severity: flag.severity,
        message: flag.message,
        policyRef: flag.policyRef,
        detail: flag.detail ?? "",
      },
    });
  }

  // A bill nothing could read is a blocker in its own right: policy 5.2 will not
  // pay a line without proof, and this is proof nobody can price.
  for (const row of rows.filter((d) => d.needsReview)) {
    await db.flag.create({
      data: {
        claimId: claim.id,
        code: "DOCUMENT_NEEDS_REVIEW",
        severity: "BLOCK",
        message: `"${row.filename}" could not be read. Say what it was and what it cost, or remove it.`,
        policyRef: "5.2",
        detail: row.id,
      },
    });
  }

  await recalculate(claim.id);
  await audit("CLAIM", claim.id, actorCode, action, {
    documents: rows.length,
    excluded: rows.filter((d) => d.excluded).length,
    lines: engine.lines.length,
    flags: engine.flags.length,
  });

  return claim.id;
}

/* ----------------------------------------------------------- recalculation */

/** Totals always come from the stored lines, never from a cached number. */
export async function recalculate(claimId: string) {
  const claim = await db.claim.findUniqueOrThrow({
    where: { id: claimId },
    include: { lines: true, travelRequest: true },
  });
  const live = claim.lines.filter((l) => l.status !== "REMOVED");

  const grossEmployee = round2(
    live.filter((l) => l.paidBy === "Employee").reduce((s, l) => s + l.gross, 0),
  );
  const grossCompany = round2(live.filter((l) => l.paidBy === "Company").reduce((s, l) => s + l.gross, 0));
  const disallowed = round2(
    live.filter((l) => l.paidBy === "Employee").reduce((s, l) => s + l.disallowed, 0),
  );
  const netClaim = round2(grossEmployee - disallowed);
  const advanceApplied = round2(claim.travelRequest.advanceDisbursed);
  const difference = round2(netClaim - advanceApplied);

  return db.claim.update({
    where: { id: claimId },
    data: {
      grossEmployee,
      grossCompany,
      disallowed,
      netClaim,
      advanceApplied,
      payable: difference > 0 ? difference : 0,
      recoverable: difference < 0 ? round2(-difference) : 0,
    },
  });
}

/* ------------------------------------------------------------- submission */

export async function submitClaim(claimId: string, actorCode: string) {
  const claim = await recalculate(claimId);
  const full = await db.claim.findUniqueOrThrow({
    where: { id: claimId },
    include: { flags: true, lines: true, travelRequest: true, employee: true },
  });

  const blocking = full.flags.filter((f) => f.severity === "BLOCK" && !f.resolved);
  if (blocking.length > 0) {
    throw new Error(
      `${blocking.length} blocking check(s) still open: ${blocking.map((f) => f.message).join(" | ")}`,
    );
  }
  if (full.lines.filter((l) => l.status !== "REMOVED").length === 0) {
    throw new Error("There is nothing to claim yet.");
  }

  const roles = requiredApprovalRoles(claim.netClaim, full.travelRequest.travelType === "INTERNATIONAL");
  const chain = resolveApprovalChain(
    {
      empCode: full.employee.empCode,
      name: full.employee.name,
      email: full.employee.email,
      role: full.employee.role,
      designation: full.employee.designation,
      department: full.employee.department,
      managerCode: full.employee.managerCode,
    },
    await people(),
    roles,
    `The claimed value of ${formatINR(claim.netClaim)} falls in this band of the approval matrix (policy 2).`,
  );

  await db.approvalStep.deleteMany({ where: { claimId } });
  for (const step of chain) {
    await db.approvalStep.create({
      data: {
        claimId,
        level: step.level,
        role: step.role,
        approverCode: step.approverCode,
        decision: step.skipped ? "SKIPPED" : "PENDING",
        requiredBecause: step.requiredBecause,
        skipReason: step.skipReason,
      },
    });
  }

  const submittedAt = new Date();
  await db.claim.update({
    where: { id: claimId },
    data: {
      status: "UNDER_REVIEW",
      submittedAt,
      dueBy: addDays(full.travelRequest.toDate, 7),
      version: { increment: 1 },
    },
  });
  await db.claimLine.updateMany({
    where: { claimId, status: "SUGGESTED" },
    data: { status: "CONFIRMED" },
  });
  await audit("CLAIM", claimId, actorCode, "SUBMITTED", {
    netClaim: claim.netClaim,
    chain: chain.map((s) => `${s.role}: ${s.approverName ?? "-"}`),
  });

  return chain;
}

/* --------------------------------------------------------------- decisions */

export type Decision = "APPROVED" | "RETURNED" | "REJECTED";

export async function decideOnClaim(
  claimId: string,
  stepId: string,
  actorCode: string,
  decision: Decision,
  remarks: string,
) {
  const step = await db.approvalStep.findUniqueOrThrow({ where: { id: stepId } });
  const claim = await db.claim.findUniqueOrThrow({ where: { id: claimId }, include: { approvals: true } });

  if (step.claimId !== claimId) throw new Error("That approval step is not on this claim.");
  if (step.decision !== "PENDING") throw new Error("That step has already been decided.");
  if (step.approverCode !== actorCode) throw new Error("This step is with someone else.");
  if (claim.employeeCode === actorCode) {
    throw new Error("An approver cannot approve their own claim (policy 2.2).");
  }

  // Sequential: every earlier step must be settled first.
  const earlierPending = claim.approvals.filter((a) => a.level < step.level && a.decision === "PENDING");
  if (earlierPending.length > 0) throw new Error("An earlier approval is still open.");

  await db.approvalStep.update({
    where: { id: stepId },
    data: { decision, remarks, decidedAt: new Date() },
  });

  if (decision === "RETURNED") {
    // Policy 2.3 - back to the employee for correction, same Travel Request ID.
    await db.claim.update({ where: { id: claimId }, data: { status: "RETURNED" } });
    await db.claimLine.updateMany({ where: { claimId }, data: { status: "SUGGESTED" } });
    await db.approvalStep.deleteMany({ where: { claimId, decision: "PENDING" } });
  } else if (decision === "REJECTED") {
    await db.claim.update({ where: { id: claimId }, data: { status: "REJECTED" } });
    await db.approvalStep.deleteMany({ where: { claimId, decision: "PENDING" } });
  } else {
    await advanceAfterApproval(claimId, step.role);
  }

  await audit("CLAIM", claimId, actorCode, decision, { level: step.level, role: step.role, remarks });
}

async function advanceAfterApproval(claimId: string, role: string) {
  const claim = await db.claim.findUniqueOrThrow({ where: { id: claimId }, include: { approvals: true } });
  const stillOpen = claim.approvals.filter((a) => a.decision === "PENDING");

  if (role === "Finance - verification") {
    await db.claim.update({
      where: { id: claimId },
      data: {
        status: "QUEUED_FOR_PAYMENT",
        verifiedAt: new Date(),
        paymentRunDate: nextPaymentRun(new Date()),
      },
    });
    return;
  }

  if (role === "Finance - payment released") {
    await db.claim.update({
      where: { id: claimId },
      data: {
        status: "PAID",
        paidAt: new Date(),
        paymentRef: `NEFT/${new Date().getFullYear()}/${claim.claimNo.slice(-6)}`,
      },
    });
    await db.travelRequest.update({
      where: { id: claim.travelRequestId },
      data: { status: "SETTLED" },
    });
    return;
  }

  if (stillOpen.length === 0) {
    await db.claim.update({ where: { id: claimId }, data: { status: "VERIFIED" } });
  }
}

/* ------------------------------------------------------- employee's edits */

export async function setLineStatus(lineId: string, status: "CONFIRMED" | "REMOVED", actorCode: string) {
  const line = await db.claimLine.update({ where: { id: lineId }, data: { status } });
  await recalculate(line.claimId);
  await audit("CLAIM", line.claimId, actorCode, status === "REMOVED" ? "LINE_REMOVED" : "LINE_CONFIRMED", {
    line: line.description,
    amount: line.gross,
  });
  return line;
}

export async function setAttendees(lineId: string, attendees: string[], actorCode: string) {
  const line = await db.claimLine.update({
    where: { id: lineId },
    data: { attendeesJson: JSON.stringify(attendees) },
  });
  if (attendees.length > 0) {
    await db.flag.updateMany({
      where: { lineId, code: "ENTERTAINMENT_ATTENDEES_MISSING" },
      data: {
        resolved: true,
        resolutionNote: `Attendees recorded: ${attendees.join(", ")}`,
      },
    });
  }
  await audit("CLAIM", line.claimId, actorCode, "ATTENDEES_RECORDED", { attendees });
  return line;
}

export async function resolveFlag(flagId: string, note: string, actorCode: string) {
  const flag = await db.flag.update({
    where: { id: flagId },
    data: { resolved: true, resolutionNote: note },
  });
  if (flag.claimId) {
    await audit("CLAIM", flag.claimId, actorCode, "FLAG_RESOLVED", { code: flag.code, note });
  }
  return flag;
}

export async function addManualLine(
  claimId: string,
  input: {
    section: "LODGING" | "TRANSPORT" | "OTHER";
    head: string;
    description: string;
    lineDate?: string;
    gross: number;
    paidBy: "Employee" | "Company";
  },
  actorCode: string,
) {
  const last = await db.claimLine.findFirst({ where: { claimId }, orderBy: { sortOrder: "desc" } });
  const line = await db.claimLine.create({
    data: {
      claimId,
      section: input.section,
      head: input.head,
      description: input.description,
      lineDate: input.lineDate ? new Date(input.lineDate) : null,
      paidBy: input.paidBy,
      gross: round2(input.gross),
      disallowed: 0,
      allowed: round2(input.gross),
      reason: "Added by the employee.",
      status: "CONFIRMED",
      sortOrder: (last?.sortOrder ?? 0) + 1,
    },
  });

  // Policy 5.2 - a line with no proof behind it cannot be paid.
  await db.flag.create({
    data: {
      claimId,
      lineId: line.id,
      code: "MISSING_PROOF",
      severity: "BLOCK",
      message: `"${line.description}" was added by hand and has no supporting document. Attach one or remove the line.`,
      policyRef: "5.2",
    },
  });

  await recalculate(claimId);
  await audit("CLAIM", claimId, actorCode, "LINE_ADDED", {
    description: input.description,
    gross: input.gross,
  });
  return line;
}

/* ------------------------------------------------------------------ views */

export async function claimWithEverything(claimId: string) {
  return db.claim.findUnique({
    where: { id: claimId },
    include: {
      employee: true,
      travelRequest: {
        include: { employee: true, category: true, approvals: { include: { approver: true } } },
      },
      lines: { include: { document: true, flags: true }, orderBy: { sortOrder: "asc" } },
      approvals: { include: { approver: true }, orderBy: { level: "asc" } },
      flags: true,
    },
  });
}

export async function claimsVisibleTo(actor: { empCode: string; isFinance: boolean; isAdmin: boolean }) {
  if (actor.isFinance || actor.isAdmin) {
    return db.claim.findMany({
      include: { employee: true, travelRequest: true, approvals: true },
      orderBy: { createdAt: "desc" },
    });
  }
  const reports = await db.employee.findMany({ where: { managerCode: actor.empCode } });
  const codes = [actor.empCode, ...reports.map((r) => r.empCode)];
  return db.claim.findMany({
    where: { employeeCode: { in: codes } },
    include: { employee: true, travelRequest: true, approvals: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function pendingApprovalsFor(empCode: string) {
  return db.approvalStep.findMany({
    where: { approverCode: empCode, decision: "PENDING", claimId: { not: null } },
    include: {
      claim: { include: { employee: true, travelRequest: true, flags: true, approvals: true } },
    },
    orderBy: { createdAt: "asc" },
  });
}

/** The engine's view of a claim, recomputed for display without storing anything. */
export function summariseFlags(flags: { severity: string; resolved: boolean }[]) {
  return {
    blocking: flags.filter((f) => f.severity === "BLOCK" && !f.resolved).length,
    warnings: flags.filter((f) => f.severity === "WARN" && !f.resolved).length,
    notes: flags.filter((f) => f.severity === "INFO").length,
  };
}

export type { EngineResult, ProposedLine };

/**
 * The employee tells the app what an unreadable bill was. The document stays
 * attached as the proof reference, the blocking flag is cleared, and the line
 * carries a note saying a human priced it - because an auditor should be able
 * to tell that apart from something the reader extracted.
 */
export async function confirmUnreadableDocument(
  documentId: string,
  input: { amount: number; head: string; description: string; lineDate?: string },
  actorCode: string,
) {
  const doc = await db.document.findUniqueOrThrow({
    where: { id: documentId },
    include: { travelRequest: { include: { claims: true } } },
  });
  if (!doc.travelRequest) throw new Error("That document is not attached to a trip.");
  if (doc.travelRequest.employeeCode !== actorCode) {
    throw new Error("Only the person who made the trip can price its bills.");
  }

  const claim = doc.travelRequest.claims.find((c) => ["DRAFT", "RETURNED"].includes(c.status));
  if (!claim) throw new Error("There is no open settlement on this trip.");

  const section = SECTION_BY_HEAD[input.head] ?? "OTHER";
  const last = await db.claimLine.findFirst({
    where: { claimId: claim.id },
    orderBy: { sortOrder: "desc" },
  });

  await db.claimLine.create({
    data: {
      claimId: claim.id,
      section,
      head: input.head,
      description: input.description,
      lineDate: input.lineDate ? new Date(input.lineDate) : doc.sentAt,
      paidBy: "Employee",
      gross: round2(input.amount),
      disallowed: 0,
      allowed: round2(input.amount),
      reason: "Added by the employee.",
      status: "CONFIRMED",
      sortOrder: (last?.sortOrder ?? 0) + 1,
      documentId: doc.id,
    },
  });

  await db.document.update({
    where: { id: doc.id },
    data: {
      needsReview: false,
      parsedBy: "manual",
      classification: CLASSIFICATION_BY_HEAD[input.head] ?? "UNKNOWN",
      extractedJson: JSON.stringify({
        ...JSON.parse(doc.extractedJson),
        amount: round2(input.amount),
        merchant: input.description,
        notes: ["Priced by the employee; the reader could not."],
      }),
    },
  });

  await db.flag.updateMany({
    where: { claimId: claim.id, code: "DOCUMENT_NEEDS_REVIEW", detail: doc.id, resolved: false },
    data: { resolved: true, resolutionNote: `Priced by hand: ${input.description}` },
  });

  await recalculate(claim.id);
  await audit("CLAIM", claim.id, actorCode, "DOCUMENT_PRICED", {
    document: doc.filename,
    amount: input.amount,
    head: input.head,
  });

  return claim.id;
}

const SECTION_BY_HEAD: Record<string, "LODGING" | "TRANSPORT" | "OTHER"> = {
  Lodging: "LODGING",
  "Local conveyance": "TRANSPORT",
  "Air travel": "TRANSPORT",
  Meals: "OTHER",
  "Business entertainment": "OTHER",
  Other: "OTHER",
};

const CLASSIFICATION_BY_HEAD: Record<string, string> = {
  Lodging: "HOTEL_INVOICE",
  "Local conveyance": "CAB_RECEIPT",
  "Air travel": "FLIGHT_BOOKING",
  Meals: "MEAL_BILL",
  "Business entertainment": "ENTERTAINMENT_BILL",
};

/**
 * Takes a piece of evidence off a trip: the wrong bill, someone else's, or one
 * nothing could read and the employee cannot place. The claim is redrafted
 * without it. The audit trail keeps the fact that it was here and who removed it.
 */
export async function removeDocument(documentId: string, actorCode: string) {
  const doc = await db.document.findUniqueOrThrow({
    where: { id: documentId },
    include: { travelRequest: true },
  });
  if (!doc.travelRequest) throw new Error("That document is not attached to a trip.");
  if (doc.travelRequest.employeeCode !== actorCode) {
    throw new Error("Only the person who made the trip can remove its evidence.");
  }

  const claim = await db.claim.findFirst({
    where: { travelRequestId: doc.travelRequestId ?? "", status: { in: ["DRAFT", "RETURNED"] } },
  });
  if (!claim) throw new Error("There is no open settlement on this trip.");

  // Its lines go with it: a claim line with no proof behind it cannot be paid.
  await db.claimLine.deleteMany({ where: { claimId: claim.id, documentId: doc.id } });
  await db.flag.deleteMany({ where: { claimId: claim.id, code: "DOCUMENT_NEEDS_REVIEW", detail: doc.id } });
  await db.document.delete({ where: { id: doc.id } });

  await audit("CLAIM", claim.id, actorCode, "EVIDENCE_REMOVED", {
    document: doc.filename,
    classification: doc.classification,
  });

  await redraft(doc.travelRequest.trqId, actorCode, "REDRAFTED");
  return claim.id;
}

/**
 * Runs the evidence back through the policy engine without adding anything.
 *
 * Needed because the verdicts are derived: when a rule is corrected, or the same
 * bill turns out to have arrived twice, a claim sitting in draft should be able
 * to pick that up without the employee re-uploading their trip.
 */
export async function recheckClaim(claimId: string, actorCode: string) {
  const claim = await db.claim.findUniqueOrThrow({
    where: { id: claimId },
    include: { travelRequest: true },
  });
  if (claim.employeeCode !== actorCode) {
    throw new Error("Only the person who made the trip can re-run its checks.");
  }
  if (!["DRAFT", "RETURNED"].includes(claim.status)) {
    throw new Error("This settlement has been filed, so its checks are fixed as they were.");
  }

  await redraft(claim.travelRequest.trqId, actorCode, "RECHECKED");
  return claim.id;
}
