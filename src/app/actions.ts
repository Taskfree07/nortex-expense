"use server";

/**
 * Every mutation the interface can make. Each one re-reads who is acting from
 * the cookie rather than trusting anything the form sent, and each one writes to
 * the audit trail through the service layer.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { ACTOR_COOKIE, requireActor } from "@/lib/session";
import { db } from "@/lib/db";
import { round2 } from "@/lib/money";
import { inclusiveDays } from "@/lib/dates";
import { ADVANCE_CAP_RATIO, classifyCity, requiredApprovalRoles } from "@/lib/policy/config";
import { resolveApprovalChain } from "@/lib/policy/approvals";
import {
  addManualLine,
  decideOnClaim,
  importInboxForRequest,
  resolveFlag,
  setAttendees,
  setLineStatus,
  submitClaim,
  type Decision,
} from "@/lib/services/claim-service";

export async function signIn(formData: FormData) {
  const empCode = String(formData.get("empCode") ?? "");
  const person = await db.employee.findUnique({ where: { empCode } });
  if (!person) throw new Error("No such employee.");

  const store = await cookies();
  store.set(ACTOR_COOKIE, empCode, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  redirect("/dashboard");
}

export async function signOut() {
  const store = await cookies();
  store.delete(ACTOR_COOKIE);
  redirect("/sign-in");
}

/** Raises a travel request and puts it in front of the approvers the matrix names. */
export async function createTravelRequest(formData: FormData) {
  const actor = await requireActor();

  const fromDate = new Date(`${String(formData.get("fromDate"))}T00:00:00+05:30`);
  const toDate = new Date(`${String(formData.get("toDate"))}T00:00:00+05:30`);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    throw new Error("Give the dates you are travelling between.");
  }
  if (toDate < fromDate) throw new Error("The return date cannot be before the departure date.");

  const destination = String(formData.get("destination") ?? "").trim();
  if (!destination) throw new Error("Say where you are going.");

  const estimate = [
    {
      head: "Air / Rail",
      basis: "Return, economy",
      estimate: Number(formData.get("estAir") ?? 0),
      borneBy: "Company",
    },
    {
      head: "Lodging",
      basis: "Per policy",
      estimate: Number(formData.get("estLodging") ?? 0),
      borneBy: String(formData.get("lodgingBorneBy") ?? "Employee"),
    },
    {
      head: "Local conveyance",
      basis: "Actuals",
      estimate: Number(formData.get("estConveyance") ?? 0),
      borneBy: "Employee",
    },
    {
      head: "Meals / allowance",
      basis: "As per policy",
      estimate: Number(formData.get("estMeals") ?? 0),
      borneBy: "Employee",
    },
  ];
  const estimatedTotal = round2(estimate.reduce((s, e) => s + e.estimate, 0));
  const employeeBorne = round2(
    estimate.filter((e) => e.borneBy === "Employee").reduce((s, e) => s + e.estimate, 0),
  );
  const advanceRequested = Number(formData.get("advanceRequested") ?? 0);

  if (advanceRequested > round2(employeeBorne * ADVANCE_CAP_RATIO)) {
    throw new Error(
      `An advance may not exceed 60% of the employee-borne estimate (policy 1.2). That is ${round2(
        employeeBorne * ADVANCE_CAP_RATIO,
      ).toFixed(2)} here.`,
    );
  }

  const count = await db.travelRequest.count();
  const travelType = formData.get("travelType") === "INTERNATIONAL" ? "INTERNATIONAL" : "DOMESTIC";
  const destinationCity = destination.split("/")[0].trim();

  const request = await db.travelRequest.create({
    data: {
      trqId: `TRQ-2026-${String(count + 1).padStart(4, "0")}`,
      employeeCode: actor.empCode,
      categoryCode: "DOM_TRAVEL",
      purpose: String(formData.get("purpose") ?? "").trim() || "Business travel",
      destination,
      cityClass: classifyCity(destinationCity),
      travelType,
      mode: String(formData.get("mode") ?? "Flight"),
      costCentre: actor.costCentre,
      fromDate,
      toDate,
      days: inclusiveDays(fromDate, toDate),
      estimateJson: JSON.stringify(estimate),
      estimatedTotal,
      advanceRequested,
      status: "PENDING_APPROVAL",
    },
  });

  const staff = await db.employee.findMany();
  const chain = resolveApprovalChain(
    {
      empCode: actor.empCode,
      name: actor.name,
      email: actor.email,
      role: actor.role,
      designation: actor.designation,
      department: actor.department,
      managerCode: actor.managerCode,
    },
    new Map(
      staff.map((s) => [
        s.empCode,
        {
          empCode: s.empCode,
          name: s.name,
          email: s.email,
          role: s.role,
          designation: s.designation,
          department: s.department,
          managerCode: s.managerCode,
        },
      ]),
    ),
    requiredApprovalRoles(estimatedTotal, travelType === "INTERNATIONAL"),
    `An estimate of ${estimatedTotal.toFixed(2)} falls in this band of the approval matrix (policy 2).`,
  ).filter((step) => !step.role.startsWith("Finance -"));

  for (const step of chain) {
    await db.approvalStep.create({
      data: {
        travelRequestId: request.id,
        level: step.level,
        role: step.role,
        approverCode: step.approverCode,
        decision: step.skipped ? "SKIPPED" : "PENDING",
        requiredBecause: step.requiredBecause,
        skipReason: step.skipReason,
      },
    });
  }

  await db.auditEvent.create({
    data: {
      entity: "TRAVEL_REQUEST",
      entityId: request.id,
      actorCode: actor.empCode,
      action: "REQUEST_RAISED",
      detailJson: JSON.stringify({ estimatedTotal, advanceRequested }),
    },
  });

  revalidatePath("/requests");
  redirect(`/requests/${request.trqId}`);
}

/** An approver's decision on the request itself (not the settlement). */
export async function decideOnRequest(formData: FormData) {
  const actor = await requireActor();
  const stepId = String(formData.get("stepId") ?? "");
  const decision = String(formData.get("decision") ?? "") as Decision;
  const remarks = String(formData.get("remarks") ?? "").trim();

  const step = await db.approvalStep.findUniqueOrThrow({
    where: { id: stepId },
    include: { travelRequest: true },
  });
  if (!step.travelRequestId || !step.travelRequest)
    throw new Error("That step is not on a travel request.");
  if (step.approverCode !== actor.empCode) throw new Error("This step is with someone else.");
  if (step.travelRequest.employeeCode === actor.empCode) {
    throw new Error("You cannot approve your own request (policy 2.2).");
  }
  if ((decision === "RETURNED" || decision === "REJECTED") && !remarks) {
    throw new Error("Remarks are required when you send a request back or reject it.");
  }

  await db.approvalStep.update({
    where: { id: stepId },
    data: { decision, remarks, decidedAt: new Date() },
  });

  const siblings = await db.approvalStep.findMany({ where: { travelRequestId: step.travelRequestId } });
  const stillPending = siblings.filter((s) => s.id !== stepId && s.decision === "PENDING");

  let status = step.travelRequest.status;
  if (decision === "REJECTED") status = "REJECTED";
  else if (decision === "RETURNED") status = "RETURNED";
  else if (stillPending.length === 0) status = "APPROVED";

  await db.travelRequest.update({ where: { id: step.travelRequestId }, data: { status } });
  await db.auditEvent.create({
    data: {
      entity: "TRAVEL_REQUEST",
      entityId: step.travelRequestId,
      actorCode: actor.empCode,
      action: decision,
      detailJson: JSON.stringify({ role: step.role, remarks }),
    },
  });

  revalidatePath(`/requests/${step.travelRequest.trqId}`);
  revalidatePath("/approvals");
}

/** Finance releases the advance against an approved request (policy 1.2). */
export async function disburseAdvance(formData: FormData) {
  const actor = await requireActor();
  if (!actor.isFinance) throw new Error("Only Finance disburses advances.");

  const trqId = String(formData.get("trqId") ?? "");
  const request = await db.travelRequest.findUniqueOrThrow({ where: { trqId } });
  if (request.status !== "APPROVED") throw new Error("The request is not approved yet.");

  const count = await db.travelRequest.count({ where: { advanceDisbursed: { gt: 0 } } });
  await db.travelRequest.update({
    where: { trqId },
    data: {
      advanceDisbursed: request.advanceRequested,
      advanceRef: `ADV/2026/${String(600 + count + 1).padStart(4, "0")}`,
    },
  });
  await db.auditEvent.create({
    data: {
      entity: "TRAVEL_REQUEST",
      entityId: request.id,
      actorCode: actor.empCode,
      action: "ADVANCE_DISBURSED",
      detailJson: JSON.stringify({ amount: request.advanceRequested }),
    },
  });

  revalidatePath(`/requests/${trqId}`);
}

/** Admin: move the value at which an approver joins the chain. */
export async function updateThresholds(formData: FormData) {
  const actor = await requireActor();
  if (!actor.isAdmin) throw new Error("Only an administrator can change a category.");

  const code = String(formData.get("code") ?? "");
  const approvers = JSON.parse(String(formData.get("approvers") ?? "[]")) as {
    level: number;
    role: string;
    thresholdAbove: number;
  }[];

  if (approvers.some((a) => !Number.isFinite(a.thresholdAbove) || a.thresholdAbove < 0)) {
    throw new Error("Thresholds must be zero or more.");
  }
  const ascending = approvers.every(
    (a, i) => i === 0 || a.thresholdAbove >= approvers[i - 1].thresholdAbove,
  );
  if (!ascending) throw new Error("Each level's threshold must be at least the one below it.");

  const category = await db.category.update({
    where: { code },
    data: { approversJson: JSON.stringify(approvers), version: { increment: 1 } },
  });

  await db.auditEvent.create({
    data: {
      entity: "CATEGORY",
      entityId: code,
      actorCode: actor.empCode,
      action: "THRESHOLDS_CHANGED",
      detailJson: JSON.stringify({ approvers, version: category.version }),
    },
  });

  revalidatePath("/admin/categories");
}

export async function importInbox(formData: FormData) {
  const actor = await requireActor();
  const trqId = String(formData.get("trqId") ?? "");
  const { claimId } = await importInboxForRequest(trqId, actor.empCode);
  revalidatePath("/claims");
  redirect(`/claims/${claimId}`);
}

export async function confirmLine(formData: FormData) {
  const actor = await requireActor();
  const lineId = String(formData.get("lineId") ?? "");
  const status = String(formData.get("status") ?? "CONFIRMED") as "CONFIRMED" | "REMOVED";
  const line = await setLineStatus(lineId, status, actor.empCode);
  revalidatePath(`/claims/${line.claimId}`);
}

export async function recordAttendees(formData: FormData) {
  const actor = await requireActor();
  const lineId = String(formData.get("lineId") ?? "");
  const attendees = String(formData.get("attendees") ?? "")
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const line = await setAttendees(lineId, attendees, actor.empCode);
  revalidatePath(`/claims/${line.claimId}`);
}

export async function clearFlag(formData: FormData) {
  const actor = await requireActor();
  const flagId = String(formData.get("flagId") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  if (!note) throw new Error("Say what was done about it before clearing the check.");
  const flag = await resolveFlag(flagId, note, actor.empCode);
  if (flag.claimId) revalidatePath(`/claims/${flag.claimId}`);
}

export async function addLine(formData: FormData) {
  const actor = await requireActor();
  const claimId = String(formData.get("claimId") ?? "");
  await addManualLine(
    claimId,
    {
      section: String(formData.get("section") ?? "OTHER") as "LODGING" | "TRANSPORT" | "OTHER",
      head: String(formData.get("head") ?? "Other"),
      description: String(formData.get("description") ?? ""),
      lineDate: String(formData.get("lineDate") ?? "") || undefined,
      gross: Number(formData.get("gross") ?? 0),
      paidBy: "Employee",
    },
    actor.empCode,
  );
  revalidatePath(`/claims/${claimId}`);
}

export async function submit(formData: FormData) {
  const actor = await requireActor();
  const claimId = String(formData.get("claimId") ?? "");
  await submitClaim(claimId, actor.empCode);
  revalidatePath(`/claims/${claimId}`);
  revalidatePath("/approvals");
}

export async function decide(formData: FormData) {
  const actor = await requireActor();
  const claimId = String(formData.get("claimId") ?? "");
  const stepId = String(formData.get("stepId") ?? "");
  const decision = String(formData.get("decision") ?? "") as Decision;
  const remarks = String(formData.get("remarks") ?? "").trim();

  if ((decision === "RETURNED" || decision === "REJECTED") && !remarks) {
    throw new Error("Remarks are required when you send a claim back or reject it (policy 2.3).");
  }

  await decideOnClaim(claimId, stepId, actor.empCode, decision, remarks);
  revalidatePath(`/claims/${claimId}`);
  revalidatePath("/approvals");
  revalidatePath("/finance");
  revalidatePath("/dashboard");
}
