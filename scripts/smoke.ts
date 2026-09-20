import { importInboxForRequest, submitClaim, claimWithEverything } from "../src/lib/services/claim-service";
import { db } from "../src/lib/db";

async function main() {
  const { claimId } = await importInboxForRequest("TRQ-2026-0001", "NX-4471");
  let claim = await claimWithEverything(claimId);
  console.log("claim", claim!.claimNo, "lines", claim!.lines.length);
  console.log("totals", {
    gross: claim!.grossEmployee, company: claim!.grossCompany, disallowed: claim!.disallowed,
    net: claim!.netClaim, advance: claim!.advanceApplied, payable: claim!.payable,
  });
  console.log("blocking flags:");
  for (const f of claim!.flags.filter(f => f.severity === "BLOCK")) console.log("  -", f.code, "|", f.message.slice(0, 80));

  try { await submitClaim(claimId, "NX-4471"); } catch (e) { console.log("submit refused ->", (e as Error).message.slice(0, 120)); }

  // Resolve the two entertainment blocks the way an employee would, then submit.
  const entLine = claim!.lines.find(l => l.head === "Business entertainment")!;
  await db.flag.updateMany({ where: { lineId: entLine.id }, data: { resolved: true, resolutionNote: "HoD approval obtained retrospectively; attendees recorded." } });
  const chain = await submitClaim(claimId, "NX-4471");
  console.log("chain:", chain.map(c => `${c.level}. ${c.role} -> ${c.approverName}`).join(" | "));
  claim = await claimWithEverything(claimId);
  console.log("status", claim!.status, "due", claim!.dueBy?.toISOString().slice(0,10));
}
main().finally(() => db.$disconnect());
