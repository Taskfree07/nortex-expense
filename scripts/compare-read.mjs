import pg from "pg";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const docs = await c.query(`select filename, "parsedBy", "extractedJson" from "Document" where "imagePath" is not null order by filename`);
for (const d of docs.rows) {
  const e = JSON.parse(d.extractedJson);
  console.log(`\n=== ${d.filename} (${d.parsedBy})`);
  console.log("  amount:", e.amount, "| subTotal:", e.subTotal, "| taxTotal:", e.taxTotal, "| nights:", e.nights, "| tariffPerNight:", e.tariffPerNight);
  console.log("  lines:", (e.folioLines ?? []).map((l) => `${l.description}=${l.amount}`).join(" | "));
}
const lines = await c.query(`select cl.section, cl.head, cl.description, cl.gross, cl.disallowed, cl.allowed
                             from "ClaimLine" cl join "Claim" c on c.id=cl."claimId"
                             where c."claimNo"='CLM-2026-000005' or c.id=(select id from "Claim" order by "createdAt" desc limit 1)
                             order by cl."sortOrder"`);
console.log("\n=== claim lines ===");
for (const l of lines.rows) console.log(`  ${l.head.padEnd(24)} gross ${String(l.gross).padStart(10)}  disallowed ${String(l.disallowed).padStart(8)}  allowed ${String(l.allowed).padStart(10)}  ${l.description.slice(0, 50)}`);
await c.end();
