import Link from "next/link";
import { redirect } from "next/navigation";
import { requireActor } from "@/lib/session";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/dates";
import { nextPaymentRun } from "@/lib/dates";
import { formatINR, round2 } from "@/lib/money";
import { EmptyState, PageHeader, Panel, Pill } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function FinancePage() {
  const actor = await requireActor();
  if (!actor.isFinance) redirect("/dashboard");

  const claims = await db.claim.findMany({
    include: { employee: true, travelRequest: true, approvals: true },
    orderBy: { updatedAt: "desc" },
  });

  const toVerify = claims.filter((c) =>
    c.approvals.some((a) => a.role === "Finance - verification" && a.decision === "PENDING"),
  );
  const queued = claims.filter((c) => c.status === "QUEUED_FOR_PAYMENT");
  const paid = claims.filter((c) => c.status === "PAID");

  const queuedTotal = round2(queued.reduce((s, c) => s + c.payable, 0));
  const recoveries = round2(claims.reduce((s, c) => s + c.recoverable, 0));
  const run = nextPaymentRun(new Date());

  // What the organisation actually spends on, from the claim lines themselves.
  const byHead = await db.claimLine.groupBy({
    by: ["head"],
    where: { paidBy: "Employee", status: { not: "REMOVED" } },
    _sum: { allowed: true },
  });
  const spend = byHead
    .map((row) => ({ head: row.head, total: round2(row._sum.allowed ?? 0) }))
    .filter((row) => row.total > 0)
    .sort((a, b) => b.total - a.total);
  const largest = spend[0]?.total ?? 1;

  return (
    <>
      <PageHeader
        title="Payments"
        lede={`Verified claims are paid in the run on the 10th and the 25th. The next run is ${formatDate(run)}.`}
      />

      <div className="grid gap-px border border-rule bg-rule sm:grid-cols-4">
        <Tile label="To verify" value={String(toVerify.length)} note="Required on every claim" />
        <Tile label="Queued for payment" value={formatINR(queuedTotal)} note={`${queued.length} claim(s)`} />
        <Tile label="Recoverable from employees" value={formatINR(recoveries)} note="Adjusted through payroll" />
        <Tile label="Paid" value={String(paid.length)} note="Closed and on the record" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel title="Waiting on Finance" hint="Business approvals are done; verification is the last check before payment.">
          {toVerify.length === 0 ? (
            <div className="px-5 py-6">
              <EmptyState title="Nothing to verify" body="Everything approved has already been through Finance." />
            </div>
          ) : (
            <ClaimRows claims={toVerify} />
          )}
        </Panel>

        <Panel title="Queued for payment" hint={`Releases on ${formatDate(run)}.`}>
          {queued.length === 0 ? (
            <div className="px-5 py-6">
              <EmptyState title="The queue is empty" body="Verified claims land here until the run date." />
            </div>
          ) : (
            <ClaimRows claims={queued} />
          )}
        </Panel>
      </div>

      <Panel className="mt-6" title="Where the money goes" hint="Across every claim line that has been confirmed.">
        {spend.length === 0 ? (
          <div className="px-5 py-6">
            <EmptyState title="Nothing claimed yet" body="Spend by head appears once claims are filed." />
          </div>
        ) : (
          <ul className="space-y-2 px-5 py-4">
            {spend.map((row) => (
              <li key={row.head} className="grid grid-cols-[10rem_1fr_7rem] items-center gap-3 text-sm">
                <span className="text-ink-soft">{row.head}</span>
                <span className="h-2 bg-paper">
                  <span
                    className="block h-2 bg-stamp"
                    style={{ width: `${Math.max(2, (row.total / largest) * 100)}%` }}
                  />
                </span>
                <span className="num text-right text-ink">{formatINR(row.total)}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}

function Tile({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="bg-card px-5 py-4">
      <div className="text-xs text-ink-soft">{label}</div>
      <div className="num mt-1 text-xl font-semibold tracking-tight text-ink">{value}</div>
      <div className="mt-0.5 text-xs text-ink-faint">{note}</div>
    </div>
  );
}

function ClaimRows({
  claims,
}: {
  claims: {
    id: string;
    claimNo: string;
    payable: number;
    netClaim: number;
    paymentRunDate: Date | null;
    employee: { name: string };
    travelRequest: { destination: string; trqId: string };
  }[];
}) {
  return (
    <ul className="divide-y divide-rule">
      {claims.map((claim) => (
        <li key={claim.id}>
          <Link
            href={`/claims/${claim.id}`}
            className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-paper"
          >
            <div>
              <div className="flex items-center gap-2">
                <span className="ident text-ink">{claim.claimNo}</span>
                {claim.paymentRunDate ? <Pill tone="moss">{formatDate(claim.paymentRunDate)}</Pill> : null}
              </div>
              <div className="mt-0.5 text-xs text-ink-faint">
                {claim.employee.name} · {claim.travelRequest.destination}
              </div>
            </div>
            <div className="text-right">
              <div className="num text-sm font-medium text-ink">{formatINR(claim.payable)}</div>
              <div className="text-xs text-ink-faint">of {formatINR(claim.netClaim)} claimed</div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
