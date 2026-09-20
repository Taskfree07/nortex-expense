import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActor } from "@/lib/session";
import { db } from "@/lib/db";
import { REQUEST_STATUS } from "@/lib/ui";
import { formatDate, formatDateTime, addDays } from "@/lib/dates";
import { formatINR, round2 } from "@/lib/money";
import { ADVANCE_CAP_RATIO } from "@/lib/policy/config";
import { decideOnRequest, disburseAdvance, importInbox } from "@/app/actions";
import { buttonStyles, LinkButton, Money, PageHeader, Panel, Pill } from "@/components/ui";
import { DecisionForm } from "@/components/decision-form";
import { EvidenceUpload } from "@/components/evidence-upload";
import { cn } from "@/lib/ui";
import { SAMPLE_TRIP_ID } from "@/lib/sample";

export const dynamic = "force-dynamic";

// Reading an inbox calls out to the model for each photographed bill.
export const maxDuration = 60;

export default async function RequestPage({ params }: PageProps<"/requests/[trqId]">) {
  const { trqId } = await params;
  const actor = await requireActor();

  const request = await db.travelRequest.findUnique({
    where: { trqId },
    include: {
      employee: true,
      category: true,
      approvals: { include: { approver: true }, orderBy: { level: "asc" } },
      claims: true,
      documents: true,
    },
  });
  if (!request) notFound();

  const estimates: { head: string; basis: string; estimate: number; borneBy: string }[] = JSON.parse(
    request.estimateJson,
  );
  const employeeBorne = round2(
    estimates.filter((e) => e.borneBy === "Employee").reduce((s, e) => s + e.estimate, 0),
  );
  const advanceCap = round2(employeeBorne * ADVANCE_CAP_RATIO);
  const status = REQUEST_STATUS[request.status] ?? { label: request.status, tone: "neutral" as const };

  const myStep = request.approvals.find(
    (a) => a.approverCode === actor.empCode && a.decision === "PENDING",
  );
  const isOwner = request.employeeCode === actor.empCode;
  const claim = request.claims[0];
  // The pack's inbox belongs to the pack's trip. Every other trip brings its own.
  const isSampleTrip = request.trqId === SAMPLE_TRIP_ID;
  const audit = await db.auditEvent.findMany({
    where: { entity: "TRAVEL_REQUEST", entityId: request.id },
    include: { actor: true },
    orderBy: { at: "asc" },
  });

  return (
    <>
      <PageHeader
        title={request.destination}
        lede={`${request.purpose} · ${formatDate(request.fromDate)} to ${formatDate(request.toDate)} · ${request.days} days`}
        actions={
          <>
            <Pill tone={status.tone}>{status.label}</Pill>
            {claim ? (
              <LinkButton href={`/claims/${claim.id}`} variant="primary">
                Open settlement {claim.claimNo}
              </LinkButton>
            ) : null}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="min-w-0 space-y-6">
          <Panel number={1} title="Who is travelling">
            <dl className="grid gap-x-8 gap-y-3 px-5 py-4 sm:grid-cols-2">
              <Detail label="Employee" value={`${request.employee.name} (${request.employee.empCode})`} />
              <Detail label="Designation" value={request.employee.designation} />
              <Detail label="Department" value={request.employee.department} />
              <Detail label="Cost centre" value={request.costCentre} />
              <Detail label="Travel request ID" value={request.trqId} mono />
              <Detail label="Category" value={`${request.category.name} · v${request.category.version}`} />
            </dl>
          </Panel>

          <Panel number={2} title="What it was expected to cost">
            <div className="table-scroll">
              <table className="ledger">
                <thead>
                  <tr>
                    <th>Head</th>
                    <th>Basis</th>
                    <th>Borne by</th>
                    <th className="amount">Estimate</th>
                  </tr>
                </thead>
                <tbody>
                  {estimates.map((row) => (
                    <tr key={row.head}>
                      <td className="text-ink">{row.head}</td>
                      <td className="text-ink-soft">{row.basis}</td>
                      <td className="text-ink-soft">{row.borneBy}</td>
                      <td className="amount">{formatINR(row.estimate)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={3} className="font-medium text-ink">
                      Total estimated cost
                    </td>
                    <td className="amount font-semibold">{formatINR(request.estimatedTotal)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-rule px-5 py-3 text-sm">
              <span className="text-ink-soft">
                Advance requested · ceiling is 60% of the {formatINR(employeeBorne)} you bear
              </span>
              <span className="flex items-baseline gap-2">
                <Money value={request.advanceRequested} className="font-medium" />
                {request.advanceRequested > advanceCap ? (
                  <Pill tone="amber">above the {formatINR(advanceCap)} ceiling</Pill>
                ) : null}
              </span>
            </div>
          </Panel>

          <Panel
            number={3}
            title="Approvals"
            hint="Policy 2: the chain is set by the value and the travel type."
          >
            <ul className="divide-y divide-rule">
              {request.approvals.map((step) => (
                <li key={step.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <div className="text-sm text-ink">
                      <span className="ident mr-2 text-ink-faint">{step.level}</span>
                      {step.role}
                      {step.approver ? (
                        <span className="text-ink-soft"> · {step.approver.name}</span>
                      ) : null}
                    </div>
                    <div className="mt-0.5 text-xs text-ink-faint">
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

            {myStep ? (
              <div className="border-t border-rule bg-paper px-5 py-4">
                <DecisionForm
                  action={decideOnRequest}
                  stepId={myStep.id}
                  label={`Your decision as ${myStep.role}`}
                />
              </div>
            ) : null}
          </Panel>

          <Panel title="What happened" hint="Everything on this request, in order.">
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
          <div className="border border-rule bg-card px-5 py-4">
            <div className="text-xs text-ink-soft">Advance</div>
            <div className="num mt-1 text-xl font-semibold text-ink">
              {formatINR(request.advanceDisbursed)}
            </div>
            <p className="mt-1 text-xs leading-relaxed text-ink-faint">
              {request.advanceDisbursed > 0
                ? `Credited against ${request.advanceRef}. It is adjusted against this trip's settlement; anything left over comes back through payroll.`
                : "Nothing disbursed yet."}
            </p>
            {actor.isFinance && request.status === "APPROVED" && request.advanceDisbursed === 0 ? (
              <form action={disburseAdvance} className="mt-3">
                <input type="hidden" name="trqId" value={request.trqId} />
                <button type="submit" className={buttonStyles.secondary}>
                  Release {formatINR(request.advanceRequested)}
                </button>
              </form>
            ) : null}
          </div>

          {isOwner && request.status === "APPROVED" ? (
            <div className="border border-stamp/30 bg-stamp-wash px-5 py-4">
              <div className="text-sm font-semibold text-ink">Settle this trip</div>
              <p className="mt-1 text-xs leading-relaxed text-ink-soft">
                Bring this trip&apos;s evidence in. Each file is read, matched to{" "}
                <span className="ident">{request.trqId}</span>, checked against the policy, and drafted onto
                the settlement form for you to confirm.
              </p>
              <p className="mt-2 text-xs text-ink-faint">
                Due by {formatDate(addDays(request.toDate, 7))} — 7 days from the date you got back.
              </p>
              <div className="mt-3">
                <EvidenceUpload trqId={request.trqId} hasEvidence={request.documents.length > 0} />
              </div>

              {isSampleTrip ? (
                <form action={importInbox} className="mt-4 border-t border-stamp/20 pt-3">
                  <input type="hidden" name="trqId" value={request.trqId} />
                  <p className="text-xs leading-relaxed text-ink-faint">
                    This is the sample trip from the pack, so its inbox ships with the app: 15 messages and
                    two photographed bills.
                  </p>
                  <button type="submit" className={cn(buttonStyles.secondary, "mt-2")}>
                    {claim ? "Load the sample inbox again" : "Load the sample inbox"}
                  </button>
                </form>
              ) : null}
            </div>
          ) : null}

          {request.documents.length > 0 ? (
            <div className="border border-rule bg-card px-5 py-4">
              <div className="text-xs text-ink-soft">Evidence on file</div>
              <div className="num mt-1 text-xl font-semibold text-ink">{request.documents.length}</div>
              <p className="mt-1 text-xs text-ink-faint">
                {request.documents.filter((d) => d.excluded).length} set aside as duplicates, notices or
                someone else&apos;s.
              </p>
              {claim ? (
                <Link
                  href={`/claims/${claim.id}#evidence`}
                  className="mt-2 inline-block text-xs text-stamp hover:underline"
                >
                  See what was read
                </Link>
              ) : null}
            </div>
          ) : null}
        </aside>
      </div>
    </>
  );
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-ink-faint">{label}</dt>
      <dd className={`mt-0.5 text-sm text-ink ${mono ? "ident" : ""}`}>{value}</dd>
    </div>
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
      REQUEST_RAISED: "Request raised",
      APPROVED: "Approved",
      RETURNED: "Sent back",
      REJECTED: "Rejected",
      ADVANCE_DISBURSED: "Advance credited",
    }[action] ?? action.toLowerCase().replace(/_/g, " ")
  );
}
