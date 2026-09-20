import Link from "next/link";
import { requireActor } from "@/lib/session";
import { db } from "@/lib/db";
import { claimsVisibleTo, pendingApprovalsFor } from "@/lib/services/claim-service";
import { CLAIM_STATUS } from "@/lib/ui";
import { formatDate } from "@/lib/dates";
import { formatINR, round2 } from "@/lib/money";
import { EmptyState, LinkButton, Money, PageHeader, Panel, Pill } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const actor = await requireActor();
  const [claims, approvals, requests] = await Promise.all([
    claimsVisibleTo(actor),
    pendingApprovalsFor(actor.empCode),
    db.travelRequest.findMany({
      where: actor.isFinance || actor.isAdmin ? {} : { employeeCode: actor.empCode },
      include: { claims: true, employee: true },
      orderBy: { fromDate: "desc" },
    }),
  ]);

  const mine = claims.filter((c) => c.employeeCode === actor.empCode);
  const needsYou = mine.filter((c) => ["DRAFT", "RETURNED"].includes(c.status));
  const inFlight = mine.filter((c) =>
    ["UNDER_REVIEW", "VERIFIED", "QUEUED_FOR_PAYMENT"].includes(c.status),
  );
  const paidToMe = round2(mine.filter((c) => c.status === "PAID").reduce((s, c) => s + c.payable, 0));

  const advanceOutstanding = round2(
    requests
      .filter((r) => r.employeeCode === actor.empCode && r.status !== "SETTLED")
      .reduce((s, r) => s + r.advanceDisbursed, 0),
  );

  const unsettledRequests = requests.filter(
    (r) => r.employeeCode === actor.empCode && r.status === "APPROVED" && r.claims.length === 0,
  );

  const toVerify = actor.isFinance
    ? claims.filter((c) => c.status === "UNDER_REVIEW" || c.status === "VERIFIED")
    : [];
  const queued = actor.isFinance ? claims.filter((c) => c.status === "QUEUED_FOR_PAYMENT") : [];

  return (
    <>
      <PageHeader
        title={`Good to see you, ${actor.name.split(" ")[0]}`}
        lede={`${actor.designation} · cost centre ${actor.costCentre} · ${scopeLine(actor)}`}
        actions={
          <LinkButton href="/requests/new" variant="primary">
            Raise a travel request
          </LinkButton>
        }
      />

      <div className="grid gap-px border border-rule bg-rule sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          label="Needs you"
          value={String(needsYou.length + (unsettledRequests.length || 0))}
          note={
            needsYou.length
              ? `${needsYou.length} settlement to file`
              : unsettledRequests.length
                ? "A trip is waiting to be settled"
                : "Nothing waiting on you"
          }
          href="/claims"
        />
        <Tile
          label="With someone else"
          value={String(inFlight.length)}
          note={inFlight.length ? "Submitted and moving" : "No claims in flight"}
          href="/claims"
        />
        <Tile
          label="Advance to settle"
          value={formatINR(advanceOutstanding)}
          note={advanceOutstanding ? "Adjusted against your next claim" : "Nothing drawn"}
          href="/requests"
        />
        <Tile
          label={actor.isApprover || actor.isFinance ? "For you to decide" : "Reimbursed to you"}
          value={actor.isApprover || actor.isFinance ? String(approvals.length) : formatINR(paidToMe)}
          note={
            actor.isApprover || actor.isFinance
              ? approvals.length
                ? "Waiting on your decision"
                : "Your queue is clear"
              : "Paid out so far"
          }
          href={actor.isApprover || actor.isFinance ? "/approvals" : "/claims"}
        />
      </div>

      {unsettledRequests.length > 0 ? (
        <Panel
          className="mt-6"
          title="A trip is waiting to be settled"
          hint="Policy 5.1 gives you 7 calendar days from the date you got back."
        >
          <ul className="divide-y divide-rule">
            {unsettledRequests.map((request) => (
              <li key={request.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div>
                  <div className="text-sm font-medium text-ink">
                    {request.destination} · {formatDate(request.fromDate)} to {formatDate(request.toDate)}
                  </div>
                  <div className="mt-0.5 text-xs text-ink-soft">
                    <span className="ident">{request.trqId}</span> · advance drawn{" "}
                    {formatINR(request.advanceDisbursed)}
                  </div>
                </div>
                <LinkButton href={`/requests/${request.trqId}`} variant="primary">
                  Settle this trip
                </LinkButton>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {actor.isFinance ? (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Panel
            title="To verify"
            hint="Finance verification is required on every claim, whatever its value."
          >
            <ClaimList claims={toVerify} empty="Nothing to verify right now." />
          </Panel>
          <Panel title="Queued for payment" hint="Paid in the run on the 10th and the 25th.">
            <ClaimList claims={queued} empty="The payment queue is empty." />
          </Panel>
        </div>
      ) : null}

      <Panel
        className="mt-6"
        title={actor.isFinance || actor.isAdmin ? "Everything in the organisation" : "Your claims"}
        hint="Newest first."
        actions={
          <Link href="/claims" className="text-xs text-stamp hover:underline">
            See all
          </Link>
        }
      >
        <ClaimList
          claims={claims.slice(0, 6)}
          empty="No claims yet. Import a trip's inbox to make the first one."
          showOwner
        />
      </Panel>
    </>
  );
}

function scopeLine(actor: { isFinance: boolean; isApprover: boolean; department: string }) {
  if (actor.isFinance) return "Organisation-wide view";
  if (actor.isApprover) return "You and your reports";
  return `${actor.department} · your own claims`;
}

function Tile({ label, value, note, href }: { label: string; value: string; note: string; href: string }) {
  return (
    <Link href={href} className="bg-card px-5 py-4 transition-colors hover:bg-paper">
      <div className="text-xs text-ink-soft">{label}</div>
      <div className="num mt-1 text-xl font-semibold tracking-tight text-ink">{value}</div>
      <div className="mt-0.5 text-xs text-ink-faint">{note}</div>
    </Link>
  );
}

type ClaimRow = {
  id: string;
  claimNo: string;
  status: string;
  netClaim: number;
  payable: number;
  createdAt: Date;
  employee: { name: string };
  travelRequest: { destination: string; trqId: string };
};

function ClaimList({
  claims,
  empty,
  showOwner,
}: {
  claims: ClaimRow[];
  empty: string;
  showOwner?: boolean;
}) {
  if (claims.length === 0) {
    return (
      <div className="px-5 py-6">
        <EmptyState title="Nothing here yet" body={empty} />
      </div>
    );
  }

  return (
    <ul className="divide-y divide-rule">
      {claims.map((claim) => {
        const status = CLAIM_STATUS[claim.status] ?? { label: claim.status, tone: "neutral" as const };
        return (
          <li key={claim.id}>
            <Link
              href={`/claims/${claim.id}`}
              className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-paper"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="ident text-ink">{claim.claimNo}</span>
                  <Pill tone={status.tone}>{status.label}</Pill>
                </div>
                <div className="mt-0.5 truncate text-xs text-ink-soft">
                  {claim.travelRequest.destination}
                  {showOwner ? ` · ${claim.employee.name}` : ""} · filed {formatDate(claim.createdAt)}
                </div>
              </div>
              <div className="text-right">
                <Money value={claim.netClaim} className="text-sm font-medium" />
                <div className="text-xs text-ink-faint">
                  {claim.payable > 0 ? `${formatINR(claim.payable)} payable` : "nothing payable"}
                </div>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
