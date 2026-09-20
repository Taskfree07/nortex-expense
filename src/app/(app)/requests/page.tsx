import Link from "next/link";
import { requireActor } from "@/lib/session";
import { db } from "@/lib/db";
import { REQUEST_STATUS } from "@/lib/ui";
import { formatDate } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { EmptyState, LinkButton, PageHeader, Panel, Pill } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function RequestsPage() {
  const actor = await requireActor();

  const requests = await db.travelRequest.findMany({
    where: actor.isFinance || actor.isAdmin ? {} : { employeeCode: actor.empCode },
    include: { employee: true, claims: true, approvals: true },
    orderBy: { fromDate: "desc" },
  });

  return (
    <>
      <PageHeader
        title="Travel requests"
        lede="Every trip starts here. The Travel Request ID is what the bookings, the bills, the settlement and the payment all hang off."
        actions={
          <LinkButton href="/requests/new" variant="primary">
            Raise a travel request
          </LinkButton>
        }
      />

      {requests.length === 0 ? (
        <EmptyState
          title="No trips yet"
          body="Raise a request and it goes to your Reporting Manager, plus anyone else the approval matrix names for the amount."
          action={
            <LinkButton href="/requests/new" variant="primary">
              Raise a travel request
            </LinkButton>
          }
        />
      ) : (
        <Panel>
          <div className="table-scroll">
            <table className="ledger">
              <thead>
                <tr>
                  <th>Request</th>
                  <th>Trip</th>
                  <th>Dates</th>
                  <th className="amount">Estimate</th>
                  <th className="amount">Advance</th>
                  <th>State</th>
                  <th>Settlement</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((request) => {
                  const status = REQUEST_STATUS[request.status] ?? {
                    label: request.status,
                    tone: "neutral" as const,
                  };
                  const claim = request.claims[0];
                  return (
                    <tr key={request.id}>
                      <td>
                        <Link
                          href={`/requests/${request.trqId}`}
                          className="ident text-stamp hover:underline"
                        >
                          {request.trqId}
                        </Link>
                        <div className="mt-0.5 text-xs text-ink-faint">{request.employee.name}</div>
                      </td>
                      <td>
                        <div className="text-ink">{request.destination}</div>
                        <div className="mt-0.5 text-xs text-ink-faint">{request.purpose}</div>
                      </td>
                      <td className="whitespace-nowrap text-ink-soft">
                        {formatDate(request.fromDate)}
                        <div className="text-xs text-ink-faint">to {formatDate(request.toDate)}</div>
                      </td>
                      <td className="amount">{formatINR(request.estimatedTotal)}</td>
                      <td className="amount">
                        {request.advanceDisbursed > 0 ? (
                          formatINR(request.advanceDisbursed)
                        ) : request.advanceRequested > 0 ? (
                          <span className="text-ink-faint">
                            {formatINR(request.advanceRequested)} asked
                          </span>
                        ) : (
                          <span className="text-ink-faint">—</span>
                        )}
                      </td>
                      <td>
                        <Pill tone={status.tone}>{status.label}</Pill>
                      </td>
                      <td>
                        {claim ? (
                          <Link href={`/claims/${claim.id}`} className="ident text-stamp hover:underline">
                            {claim.claimNo}
                          </Link>
                        ) : request.status === "APPROVED" ? (
                          <Link
                            href={`/requests/${request.trqId}`}
                            className="text-xs text-stamp hover:underline"
                          >
                            Not filed yet
                          </Link>
                        ) : (
                          <span className="text-xs text-ink-faint">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </>
  );
}
