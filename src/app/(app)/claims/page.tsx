import Link from "next/link";
import { requireActor } from "@/lib/session";
import { claimsVisibleTo } from "@/lib/services/claim-service";
import { db } from "@/lib/db";
import { CLAIM_STATUS } from "@/lib/ui";
import { formatDate } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { EmptyState, LinkButton, PageHeader, Panel, Pill } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ClaimsPage() {
  const actor = await requireActor();
  const claims = await claimsVisibleTo(actor);
  const flags = await db.flag.groupBy({
    by: ["claimId", "severity"],
    where: { resolved: false, claimId: { in: claims.map((c) => c.id) } },
    _count: true,
  });

  const blockingByClaim = new Map<string, number>();
  for (const row of flags) {
    if (row.severity !== "BLOCK" || !row.claimId) continue;
    blockingByClaim.set(row.claimId, row._count);
  }

  return (
    <>
      <PageHeader
        title="Claims"
        lede={
          actor.isFinance
            ? "Every settlement in the organisation, with where it sits and what it is waiting on."
            : "What you have claimed, where it is, and what it is waiting on."
        }
        actions={<LinkButton href="/requests" variant="secondary">Travel requests</LinkButton>}
      />

      {claims.length === 0 ? (
        <EmptyState
          title="No claims yet"
          body="Open an approved travel request and read its inbox. The settlement is drafted from there."
          action={<LinkButton href="/requests" variant="primary">Go to travel requests</LinkButton>}
        />
      ) : (
        <Panel>
          <table className="ledger">
            <thead>
              <tr>
                <th>Claim</th>
                <th>Trip</th>
                <th className="amount">Net claim</th>
                <th className="amount">Payable</th>
                <th>State</th>
                <th>Waiting on</th>
                <th>Checks</th>
              </tr>
            </thead>
            <tbody>
              {claims.map((claim) => {
                const status = CLAIM_STATUS[claim.status] ?? { label: claim.status, tone: "neutral" as const };
                const waiting = claim.approvals.find((a) => a.decision === "PENDING");
                const blocking = blockingByClaim.get(claim.id) ?? 0;
                return (
                  <tr key={claim.id}>
                    <td>
                      <Link href={`/claims/${claim.id}`} className="ident text-stamp hover:underline">
                        {claim.claimNo}
                      </Link>
                      <div className="mt-0.5 text-xs text-ink-faint">{claim.employee.name}</div>
                    </td>
                    <td>
                      <div className="text-ink">{claim.travelRequest.destination}</div>
                      <div className="mt-0.5 text-xs text-ink-faint">
                        <span className="ident">{claim.travelRequest.trqId}</span> ·{" "}
                        {formatDate(claim.travelRequest.fromDate)}
                      </div>
                    </td>
                    <td className="amount">{formatINR(claim.netClaim)}</td>
                    <td className="amount">
                      {claim.recoverable > 0 ? (
                        <span className="text-rust">({formatINR(claim.recoverable)})</span>
                      ) : (
                        formatINR(claim.payable)
                      )}
                    </td>
                    <td>
                      <Pill tone={status.tone}>{status.label}</Pill>
                    </td>
                    <td className="text-ink-soft">
                      {claim.status === "PAID"
                        ? "—"
                        : waiting?.role
                          ? waiting.role
                          : claim.status === "DRAFT"
                            ? claim.employee.name
                            : "—"}
                    </td>
                    <td>
                      {blocking > 0 ? (
                        <Pill tone="rust">{blocking} blocking</Pill>
                      ) : (
                        <span className="text-xs text-ink-faint">clear</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
      )}
    </>
  );
}
