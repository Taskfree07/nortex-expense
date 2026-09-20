import Link from "next/link";
import { requireActor } from "@/lib/session";
import { db } from "@/lib/db";
import { pendingApprovalsFor } from "@/lib/services/claim-service";
import { formatDate } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { EmptyState, LinkButton, PageHeader, Panel, Pill } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  const actor = await requireActor();

  const [claimSteps, requestSteps] = await Promise.all([
    pendingApprovalsFor(actor.empCode),
    db.approvalStep.findMany({
      where: { approverCode: actor.empCode, decision: "PENDING", travelRequestId: { not: null } },
      include: { travelRequest: { include: { employee: true } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Approvals"
        lede="What is waiting on you, with the parts worth looking at called out. Nothing here is decided for you."
      />

      {requestSteps.length > 0 ? (
        <Panel className="mb-6" title="Travel requests" hint="Approve before anything is booked (policy 1.1).">
          <ul className="divide-y divide-rule">
            {requestSteps.map((step) => (
              <li key={step.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div>
                  <div className="text-sm text-ink">
                    {step.travelRequest!.employee.name} · {step.travelRequest!.destination}
                  </div>
                  <div className="mt-0.5 text-xs text-ink-faint">
                    <span className="ident">{step.travelRequest!.trqId}</span> ·{" "}
                    {formatDate(step.travelRequest!.fromDate)} to {formatDate(step.travelRequest!.toDate)} ·
                    estimate {formatINR(step.travelRequest!.estimatedTotal)}
                  </div>
                </div>
                <LinkButton href={`/requests/${step.travelRequest!.trqId}`} variant="primary">
                  Review the request
                </LinkButton>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {claimSteps.length === 0 && requestSteps.length === 0 ? (
        <EmptyState title="Your queue is clear" body="Nothing is waiting on your decision right now." />
      ) : null}

      <div className="space-y-6">
        {claimSteps.map((step) => {
          const claim = step.claim!;
          const open = claim.flags.filter((f) => !f.resolved);
          const blocking = open.filter((f) => f.severity === "BLOCK");
          const warnings = open.filter((f) => f.severity === "WARN");

          return (
            <Panel
              key={step.id}
              title={`${claim.employee.name} · ${claim.travelRequest.destination}`}
              hint={`${step.role} · filed ${claim.submittedAt ? formatDate(claim.submittedAt) : "—"}`}
              actions={
                <Link href={`/claims/${claim.id}`} className="text-sm text-stamp hover:underline">
                  Open {claim.claimNo}
                </Link>
              }
            >
              <div className="grid gap-px bg-rule sm:grid-cols-4">
                <Cell label="Net claim" value={formatINR(claim.netClaim)} />
                <Cell label="Disallowed already" value={formatINR(claim.disallowed)} />
                <Cell label="Advance adjusted" value={formatINR(claim.advanceApplied)} />
                <Cell
                  label={claim.recoverable > 0 ? "Recoverable" : "Payable"}
                  value={formatINR(claim.recoverable > 0 ? claim.recoverable : claim.payable)}
                />
              </div>

              <div className="px-5 py-4">
                <h3 className="text-xs font-medium text-ink">Worth checking</h3>
                {warnings.length + blocking.length === 0 ? (
                  <p className="mt-1.5 text-sm text-moss">
                    Every policy check passed. The disallowed amount is already out of the total.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {[...blocking, ...warnings].slice(0, 4).map((flag) => (
                      <li key={flag.id} className="flex items-start gap-2 text-sm">
                        <Pill tone={flag.severity === "BLOCK" ? "rust" : "amber"}>
                          {flag.severity === "BLOCK" ? "blocking" : "look"}
                        </Pill>
                        <span className="text-ink-soft">{flag.message}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-3 text-xs text-ink-faint">
                  Built from this claim&apos;s lines and the policy verdicts on them. Open the claim to
                  approve, send it back with remarks, or reject it.
                </p>
              </div>
            </Panel>
          );
        })}
      </div>
    </>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card px-5 py-3">
      <div className="text-xs text-ink-soft">{label}</div>
      <div className="num mt-0.5 text-base text-ink">{value}</div>
    </div>
  );
}
