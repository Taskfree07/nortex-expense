import pg from "pg";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

const trips = await c.query(`
  select t.id, t."trqId", t.destination, t.status, e.name
  from "TravelRequest" t join "Employee" e on e."empCode"=t."employeeCode"
  order by t."createdAt" desc limit 6`);
console.log("=== recent trips ===");
console.table(trips.rows);

const trip = trips.rows.find((r) => /goa/i.test(r.destination)) ?? trips.rows[0];
if (!trip) { console.log("no trips"); await c.end(); process.exit(0); }
console.log(`\n=== ${trip.trqId} ${trip.destination} (${trip.name}) ===`);

const claims = await c.query(`select id, "claimNo", status, "grossEmployee", disallowed, "netClaim", payable from "Claim" where "travelRequestId"=$1`, [trip.id]);
console.table(claims.rows);

for (const cl of claims.rows) {
  const flags = await c.query(`select code, severity, resolved, message, "lineId" from "Flag" where "claimId"=$1 order by severity`, [cl.id]);
  console.log(`\nflags on ${cl.claimNo}:`);
  for (const f of flags.rows)
    console.log(`  [${f.severity}]${f.resolved ? " (resolved)" : ""} ${f.code}  lineId=${f.lineId ? "yes" : "none"}\n      ${f.message.slice(0, 150)}`);

  const lines = await c.query(`select head, description, gross, allowed, status, "documentId" from "ClaimLine" where "claimId"=$1 order by "sortOrder"`, [cl.id]);
  console.log(`\nlines on ${cl.claimNo}:`);
  for (const l of lines.rows)
    console.log(`  ${l.status.padEnd(9)} ${l.head.padEnd(22)} ${String(l.gross).padStart(9)}  proof=${l.documentId ? "yes" : "NO"}  ${l.description.slice(0, 45)}`);
}

const docs = await c.query(`select filename, classification, "parsedBy", "needsReview", excluded, "excludeReason" from "Document" where "travelRequestId"=$1`, [trip.id]);
console.log("\ndocuments:");
for (const d of docs.rows)
  console.log(`  ${d.needsReview ? "NEEDS REVIEW" : d.excluded ? "excluded   " : "ok         "} ${d.classification.padEnd(20)} ${d.parsedBy.padEnd(7)} ${d.filename}`);
await c.end();
