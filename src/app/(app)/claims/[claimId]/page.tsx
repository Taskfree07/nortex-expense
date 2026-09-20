import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActor } from "@/lib/session";
import { db } from "@/lib/db";
import { claimWithEverything } from "@/lib/services/claim-service";
import { decide } from "@/app/actions";
import { CLAIM_STATUS, CLASSIFICATION_LABEL, SEVERITY_TONE } from "@/lib/ui";
import { formatDate, formatDateTime } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import {
  ClauseTag,
  EmptyState,
  MarginNote,
  Money,
  PageHeader,
  Panel,
  Pill,
  SettlementStrip,
  Stepper,
  buttonStyles,
} from "@/components/ui";
import {
  AddLineForm,
  AttendeesForm,
  LineActions,
  ResolveFlagForm,
  SubmitClaimButton,
} from "@/components/claim-forms";
import { DecisionForm } from "@/components/decision-form";

export const dynamic = "force-dynamic";

const SECTIONS = [
  {
    key: "LODGING",
    number: 1,
    title: "Lodging",
    hint: "Room tariff, its taxes, and anything the hotel added.",
  },
  {
    key: "TRANSPORT",
    number: 2,
    title: "Travel and transportation",
    hint: "Flights are recorded but not reimbursed - the company was billed directly.",
  },
  {
    key: "OTHER",
    number: 3,
    title: "Other expenses",
    hint: "Meals, business entertainment, and anything disallowed.",
  },
] as const;

export default async function ClaimPage({ params }: PageProps<"/claims/[claimId]">) {
  const { claimId } = await params;
  const actor = await requireActor();
  const claim = await claimWithEverything(claimId);
  if (!claim) notFound();

  const audit = await db.auditEvent.findMany({
    where: { entity: "CLAIM", entityId: claim.id },
    include: { actor: true },
    orderBy: { at: "asc" },
  });
  const documents = await db.document.findMany({
    where: { travelRequestId: claim.travelRequestId },
    orderBy: { filename: "asc" },
  });

  const status = CLAIM_STATUS[claim.status] ?? { label: claim.status, tone: "neutral" as const };
  const isOwner = claim.employeeCode === actor.empCode;
  const editable = isOwner && ["DRAFT", "RETURNED"].includes(claim.status);
  const myStep = claim.approvals.find((a) => a.approverCode === actor.empCode && a.decision === "PENDING");
  const waitingOn = claim.approvals.find((a) => a.decision === "PENDING");

  const openFlags = claim.flags.filter((f) => !f.resolved);
  const blocking = openFlags.filter((f) => f.severity === "BLOCK");
  const warnings = openFlags.filter((f) => f.severity === "WARN");
  const notes = claim.flags.filter((f) => f.severity === "INFO");
  const resolved = claim.flags.filter((f) => f.resolved);

  const stages = JSON.parse(claim.travelRequest.category.stagesJson) as {
    key: string;
    label: string;
    hint: string;
  }[];
  const stageIndex = currentStage(claim.status);

  return (
    <>
      <PageHeader
        title={claim.claimNo}
        lede={`${claim.travelRequest.destination} · ${claim.employee.name} · ${formatDate(
          claim.travelRequest.fromDate,
        )} to ${formatDate(claim.travelRequest.toDate)} · against ${claim.travelRequest.trqId}`}
        actions={
          <>
            <Pill tone={status.tone}>{status.label}</Pill>
            <a href={`/api/claims/${claim.id}/export`} className={buttonStyles.secondary}>
              Download the form
            </a>
          </>
        }
      />

      <div className="border border-rule bg-card px-5 py-4">
        <Stepper
          stages={stages.map((s) => ({
            ...s,
            waitingOn: waitingOn?.approver
              ? `${waitingOn.approver.name}, ${waitingOn.role.toLowerCase()}`
              : null,
          }))}
          currentIndex={stageIndex}
        />
      </div>

      <div className="mt-6">
        <SettlementStrip
          items={[
            { label: "Claim total, paid by you", value: claim.grossEmployee },
            { label: "Disallowed", value: claim.disallowed, note: "Shown, not dropped" },
            {
              label: "Advance adjusted",
              value: claim.advanceApplied,
              note: claim.travelRequest.advanceRef ?? undefined,
            },
            claim.recoverable > 0
              ? {
                  label: "Recoverable from you",
                  value: claim.recoverable,
                  note: "Deducted from payroll",
                  emphasis: true,
                }
              : { label: "Payable to you", value: claim.payable, note: paymentNote(claim), emphasis: true },
          ]}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="min-w-0 space-y-6">
          {SECTIONS.map((section) => {
            const lines = claim.lines.filter((l) => l.section === section.key);
            if (lines.length === 0) return null;

            return (
              <Panel key={section.key} number={section.number} title={section.title} hint={section.hint}>
                <div className="table-scroll">
                  <table className="ledger">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>What it was</th>
                        <th>Paid by</th>
                        <th className="amount">Amount</th>
                        <th className="amount">Disallowed</th>
                        <th className="amount">Claimed</th>
                        <th>Proof</th>
                        {editable ? <th className="text-right">Edit</th> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((line) => {
                        const attendees = JSON.parse(line.attendeesJson) as string[];
                        const refs = JSON.parse(line.policyRefsJson) as string[];
                        const needsAttendees = line.flags.some(
                          (f) => f.code === "ENTERTAINMENT_ATTENDEES_MISSING" && !f.resolved,
                        );
                        return (
                          <tr key={line.id} className={line.status === "REMOVED" ? "removed" : undefined}>
                            <td className="whitespace-nowrap text-ink-soft">
                              {line.lineDate ? formatDate(line.lineDate) : "—"}
                            </td>
                            <td>
                              <div className="text-ink">{line.description}</div>
                              <div className="mt-0.5 flex flex-wrap items-center gap-2">
                                <span className="text-xs text-ink-faint">{line.head}</span>
                                {refs.map((ref) => (
                                  <ClauseTag key={ref} clause={ref} />
                                ))}
                              </div>
                              {line.reason ? (
                                <p className="mt-1 max-w-md text-xs leading-relaxed text-ink-soft">
                                  {line.reason}
                                </p>
                              ) : null}
                              {attendees.length > 0 ? (
                                <p className="mt-1 text-xs text-ink-soft">With: {attendees.join(", ")}</p>
                              ) : null}
                              {editable && needsAttendees ? (
                                <AttendeesForm lineId={line.id} attendees={attendees} />
                              ) : null}
                            </td>
                            <td className="whitespace-nowrap text-ink-soft">{line.paidBy}</td>
                            <td className="amount">{formatINR(line.gross)}</td>
                            <td className="amount">
                              {line.disallowed > 0 ? (
                                <span className="text-rust">{formatINR(line.disallowed)}</span>
                              ) : (
                                <span className="text-ink-faint">—</span>
                              )}
                            </td>
                            <td className="amount font-medium">
                              {line.paidBy === "Company" ? (
                                <span className="text-ink-faint">not claimed</span>
                              ) : (
                                formatINR(line.status === "REMOVED" ? 0 : line.allowed)
                              )}
                            </td>
                            <td>
                              {line.document ? (
                                <Link
                                  href={`/claims/${claim.id}/evidence/${line.document.id}`}
                                  className="ident text-stamp hover:underline"
                                >
                                  {proofRef(line.document)}
                                </Link>
                              ) : (
                                <span className="text-xs text-rust">none</span>
                              )}
                            </td>
                            {editable ? (
                              <td>
                                <LineActions lineId={line.id} status={line.status} />
                              </td>
                            ) : null}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Panel>
            );
          })}

          {claim.lines.length === 0 ? (
            <EmptyState
              title="Nothing drafted yet"
              body="Read the inbox for this trip and the lines will appear here."
            />
          ) : null}

          {editable ? (
            <div className="border border-dashed border-rule-strong bg-card px-5 py-4">
              <AddLineForm claimId={claim.id} />
              <p className="mt-2 text-xs text-ink-faint">
                Anything added by hand starts without a proof reference, and policy 5.2 will hold it until
                you attach one.
              </p>
            </div>
          ) : null}

          <Panel number={4} title="Settlement summary" hint="The same arithmetic as the paper form.">
            <div className="table-scroll">
              <table className="ledger">
                <tbody>
                  <SummaryRow label="Total claim, paid by you" value={claim.grossEmployee} />
                  <SummaryRow
                    label="Paid by the company (recorded, not reimbursed)"
                    value={claim.grossCompany}
                    muted
                  />
                  <SummaryRow label="Less: disallowed" value={claim.disallowed} negative />
                  <SummaryRow label="Net reimbursable claim" value={claim.netClaim} strong />
                  <SummaryRow label="Less: advance drawn" value={claim.advanceApplied} negative />
                  <SummaryRow label="Amount payable to you" value={claim.payable} strong />
                  <SummaryRow label="Amount recoverable from you" value={claim.recoverable} />
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel number={5} title="Approval and finance processing">
            {claim.approvals.length === 0 ? (
              <p className="px-5 py-4 text-sm text-ink-soft">
                The chain is set when the settlement is filed: it follows the claimed value.
              </p>
            ) : (
              <ul className="divide-y divide-rule">
                {claim.approvals.map((step) => (
                  <li key={step.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <div className="text-sm text-ink">
                        <span className="ident mr-2 text-ink-faint">{step.level}</span>
                        {step.role}
                        {step.approver ? (
                          <span className="text-ink-soft"> · {step.approver.name}</span>
                        ) : null}
                      </div>
                      <div className="mt-0.5 max-w-lg text-xs leading-relaxed text-ink-faint">
                        {step.skipReason ?? step.requiredBecause}
                      </div>
                      {step.remarks ? (
                        <p className="mt-1.5 border-l-2 border-rule-strong pl-3 text-sm text-ink-soft">
                          “{step.remarks}”
                        </p>
                      ) : null}
                    </div>
                    <div className="text-right">
                      <Pill tone={decisionTone(step.decision)}>{decisionLabel(step.decision)}</Pill>
                      {step.decidedAt ? (
                        <div className="mt-1 text-xs text-ink-faint">{formatDate(step.decidedAt)}</div>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {myStep ? (
              <div className="border-t border-rule bg-paper px-5 py-4">
                <DecisionForm
                  action={decide}
                  stepId={myStep.id}
                  claimId={claim.id}
                  label={`Your decision as ${myStep.role}`}
                />
              </div>
            ) : null}
          </Panel>

          <Panel
            title="What was read from the inbox"
            hint="Every message, and what happened to it."
            className="scroll-mt-8"
          >
            <div id="evidence" />
            <div className="table-scroll">
              <table className="ledger">
                <thead>
                  <tr>
                    <th>Message</th>
                    <th>Read as</th>
                    <th className="amount">Amount</th>
                    <th>Outcome</th>
                  </tr>
                </thead>
                <tbody>
                  {documents.map((doc) => {
                    const extracted = JSON.parse(doc.extractedJson) as { amount?: number };
                    return (
                      <tr key={doc.id} className={doc.excluded ? "removed" : undefined}>
                        <td>
                          <Link
                            href={`/claims/${claim.id}/evidence/${doc.id}`}
                            className="text-ink hover:text-stamp hover:underline"
                          >
                            {doc.subject || doc.filename}
                          </Link>
                          <div className="mt-0.5 text-xs text-ink-faint">
                            {doc.fromAddr} · {doc.sentAt ? formatDate(doc.sentAt) : ""}
                          </div>
                        </td>
                        <td className="whitespace-nowrap text-ink-soft">
                          {CLASSIFICATION_LABEL[doc.classification] ?? doc.classification}
                          <div className="text-xs text-ink-faint">
                            {doc.parsedBy === "gemini" ? "read by Gemini" : "read by rules"} ·{" "}
                            {Math.round(doc.confidence * 100)}%
                          </div>
                        </td>
                        <td className="amount">
                          {extracted.amount !== undefined ? formatINR(extracted.amount) : "—"}
                        </td>
                        <td className="max-w-xs text-xs leading-relaxed text-ink-soft">
                          {doc.excluded ? doc.excludeReason : "Claimed"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="Audit trail" hint="Retained for 8 years under the Companies Act.">
            <ol className="divide-y divide-rule">
              {audit.map((event) => (
                <li
                  key={event.id}
                  className="flex items-baseline justify-between gap-4 px-5 py-2.5 text-sm"
                >
                  <span className="text-ink">
                    {humanEvent(event.action)}
                    {event.actor ? <span className="text-ink-soft"> · {event.actor.name}</span> : null}
                  </span>
                  <span className="whitespace-nowrap text-xs text-ink-faint">
                    {formatDateTime(event.at)}
                  </span>
                </li>
              ))}
            </ol>
          </Panel>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-8 lg:self-start">
          {editable ? (
            <div className="border border-rule bg-card px-5 py-4">
              <div className="text-sm font-semibold text-ink">Ready to file?</div>
              <p className="mt-1 text-xs leading-relaxed text-ink-soft">
                Due by {claim.dueBy ? formatDate(claim.dueBy) : "—"}, seven days from the date you got back.
              </p>
              <div className="mt-3">
                <SubmitClaimButton claimId={claim.id} blocking={blocking.length} />
              </div>
            </div>
          ) : null}

          <div className="border border-rule bg-card">
            <div className="border-b border-rule px-5 py-3">
              <h2 className="text-sm font-semibold text-ink">Policy checks</h2>
              <p className="mt-0.5 text-xs text-ink-faint">
                {blocking.length} blocking · {warnings.length} to look at · {notes.length} noted
              </p>
            </div>

            <div className="space-y-4 px-5 py-4">
              {blocking.length + warnings.length === 0 ? (
                <p className="text-sm text-moss">Everything checks out against the policy.</p>
              ) : null}

              {[...blocking, ...warnings].map((flag) => (
                <MarginNote
                  key={flag.id}
                  severity={flag.severity}
                  message={flag.message}
                  clause={flag.policyRef}
                >
                  {editable ? <ResolveFlagForm flagId={flag.id} /> : null}
                </MarginNote>
              ))}

              {notes.length > 0 ? (
                <details className="text-sm">
                  <summary className="cursor-pointer text-xs text-ink-soft">
                    {notes.length} thing{notes.length === 1 ? "" : "s"} the reader set aside
                  </summary>
                  <div className="mt-3 space-y-3">
                    {notes.map((flag) => (
                      <MarginNote
                        key={flag.id}
                        severity="INFO"
                        message={flag.message}
                        clause={flag.policyRef}
                      />
                    ))}
                  </div>
                </details>
              ) : null}

              {resolved.length > 0 ? (
                <details className="text-sm">
                  <summary className="cursor-pointer text-xs text-ink-soft">
                    {resolved.length} check{resolved.length === 1 ? "" : "s"} cleared
                  </summary>
                  <div className="mt-3 space-y-3">
                    {resolved.map((flag) => (
                      <MarginNote
                        key={flag.id}
                        severity={flag.severity}
                        message={flag.message}
                        clause={flag.policyRef}
                        resolved
                        resolutionNote={flag.resolutionNote}
                      />
                    ))}
                  </div>
                </details>
              ) : null}
            </div>
          </div>

          <div className="border border-rule bg-card px-5 py-4">
            <div className="text-xs text-ink-soft">Where the money is</div>
            <p className="mt-1 text-sm leading-relaxed text-ink">{whereTheMoneyIs(claim, waitingOn)}</p>
          </div>
        </aside>
      </div>
    </>
  );
}

type ClaimShape = NonNullable<Awaited<ReturnType<typeof claimWithEverything>>>;

function paymentNote(claim: ClaimShape) {
  if (claim.status === "PAID") return `Paid ${claim.paidAt ? formatDate(claim.paidAt) : ""}`;
  if (claim.paymentRunDate) return `In the run on ${formatDate(claim.paymentRunDate)}`;
  return "After approval and verification";
}

function whereTheMoneyIs(claim: ClaimShape, waitingOn: ClaimShape["approvals"][number] | undefined) {
  if (claim.status === "PAID") {
    return `Paid on ${formatDate(claim.paidAt)} against ${claim.paymentRef}. Nothing left to do.`;
  }
  if (claim.status === "QUEUED_FOR_PAYMENT") {
    return `Verified by Finance and queued. Payment runs on ${formatDate(claim.paymentRunDate)}.`;
  }
  if (claim.status === "RETURNED") {
    return "Sent back to you with remarks. Fix what was asked and file it again against the same request.";
  }
  if (claim.status === "REJECTED") return "Rejected. The remarks on the approval step say why.";
  if (waitingOn?.approver) {
    return `With ${waitingOn.approver.name} for ${waitingOn.role.toLowerCase()}. Nothing is needed from you right now.`;
  }
  if (claim.status === "DRAFT") return "Drafted from your inbox. Check the lines and file it.";
  return "Moving through its approval chain.";
}

function SummaryRow({
  label,
  value,
  strong,
  muted,
  negative,
}: {
  label: string;
  value: number;
  strong?: boolean;
  muted?: boolean;
  negative?: boolean;
}) {
  return (
    <tr>
      <td className={strong ? "font-medium text-ink" : muted ? "text-ink-faint" : "text-ink-soft"}>
        {label}
      </td>
      <td className="amount">
        <Money
          value={value}
          muted={muted}
          className={strong ? "font-semibold" : negative && value > 0 ? "text-rust" : undefined}
        />
      </td>
    </tr>
  );
}

function proofRef(doc: { filename: string; invoiceHint?: string }) {
  return doc.filename.replace(/\.eml$/, "").replace(/^\d+_/, "");
}

function currentStage(status: string) {
  return (
    {
      DRAFT: 3,
      RETURNED: 3,
      SUBMITTED: 4,
      UNDER_REVIEW: 4,
      VERIFIED: 4,
      QUEUED_FOR_PAYMENT: 5,
      PAID: 6,
      REJECTED: 4,
    }[status] ?? 3
  );
}

function decisionTone(decision: string) {
  if (decision === "APPROVED") return "moss" as const;
  if (decision === "REJECTED") return "rust" as const;
  if (decision === "RETURNED") return "amber" as const;
  if (decision === "SKIPPED") return "neutral" as const;
  return "stamp" as const;
}

function decisionLabel(decision: string) {
  return (
    {
      PENDING: "Waiting",
      APPROVED: "Approved",
      REJECTED: "Rejected",
      RETURNED: "Sent back",
      SKIPPED: "Skipped",
    }[decision] ?? decision
  );
}

function humanEvent(action: string) {
  return (
    {
      INBOX_IMPORTED: "Inbox read and settlement drafted",
      SUBMITTED: "Settlement filed",
      APPROVED: "Approved",
      RETURNED: "Sent back for correction",
      REJECTED: "Rejected",
      LINE_REMOVED: "Line removed",
      LINE_CONFIRMED: "Line put back",
      LINE_ADDED: "Line added by hand",
      ATTENDEES_RECORDED: "Attendees recorded",
      FLAG_RESOLVED: "Check cleared",
    }[action] ?? action.toLowerCase().replace(/_/g, " ")
  );
}
