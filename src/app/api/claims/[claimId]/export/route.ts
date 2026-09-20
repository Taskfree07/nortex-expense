import { NextResponse } from "next/server";
import { requireActor } from "@/lib/session";
import { claimWithEverything } from "@/lib/services/claim-service";
import { buildSettlementWorkbook, type ExportClaim } from "@/lib/excel/export";

export async function GET(_request: Request, { params }: RouteContext<"/api/claims/[claimId]/export">) {
  const { claimId } = await params;
  const actor = await requireActor();

  const claim = await claimWithEverything(claimId);
  if (!claim) return NextResponse.json({ error: "No such claim" }, { status: 404 });

  const maySee =
    actor.isFinance ||
    actor.isAdmin ||
    claim.employeeCode === actor.empCode ||
    claim.approvals.some((a) => a.approverCode === actor.empCode);
  if (!maySee) return NextResponse.json({ error: "Not yours to download" }, { status: 403 });

  const buffer = await buildSettlementWorkbook(claim as unknown as ExportClaim);

  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${claim.claimNo}-settlement.xlsx"`,
      "cache-control": "no-store",
    },
  });
}
