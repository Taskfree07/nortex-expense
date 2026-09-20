import pg from "pg";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const r = await c.query(`select filename, "parsedBy", confidence, "imagePath", substring("extractedJson" from 1 for 90) as extract
                         from "Document" where "imagePath" is not null order by filename`);
for (const row of r.rows) console.log(row.filename, "|", row.parsedBy, "|", row.confidence, "|", row.imagePath);
const n = await c.query(`select "parsedBy", count(*)::int as n from "Document" group by 1`);
console.log("all documents by reader:", n.rows);
await c.end();
