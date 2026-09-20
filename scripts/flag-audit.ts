import { importInboxForRequest } from "../src/lib/services/claim-service";
import { db } from "../src/lib/db";

async function main() {
  
  const { claimId } = await importInboxForRequest("TRQ-2026-0001", "NX-4471");
  const flags = await db.flag.findMany({ where: { claimId }, orderBy: { code: "asc" } });
  
  console.log(`total flags: ${flags.length}`);
  const counts = new Map<string, number>();
  for (const f of flags) counts.set(f.code, (counts.get(f.code) ?? 0) + 1);
  for (const [code, n] of [...counts].sort((a, b) => b[1] - a[1])) {
    const sample = flags.find((f) => f.code === code)!;
    console.log(`${n > 1 ? "REPEATED x" + n : "         1"}  ${sample.severity.padEnd(5)} ${code}`);
  }
  console.log("\n--- by severity ---");
  for (const s of ["BLOCK", "WARN", "INFO"]) console.log(s, flags.filter((f) => f.severity === s).length);
  await db.$disconnect();
  
}

main();
