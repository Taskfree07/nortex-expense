import pg from "pg";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const r = await c.query(`
  select d.filename, d.classification, d."parsedBy", d.fingerprint, d.excluded, d."needsReview", d."extractedJson"
  from "Document" d join "TravelRequest" t on t.id=d."travelRequestId"
  where t."trqId"='TRQ-2026-0002' order by d.filename`);
for (const d of r.rows) {
  const e = JSON.parse(d.extractedJson);
  console.log(`\n${d.filename}`);
  console.log(`  class=${d.classification} by=${d.parsedBy} excluded=${d.excluded} needsReview=${d.needsReview}`);
  console.log(`  fingerprint=${d.fingerprint}`);
  console.log(`  merchant="${e.merchant}" amount=${e.amount} invoiceNo="${e.invoiceNo}" occurredAt=${e.occurredAt}`);
}
await c.end();
