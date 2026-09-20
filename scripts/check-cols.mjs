import pg from "pg";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const r = await c.query(`select column_name from information_schema.columns where table_name='Document' and column_name in ('fileData','mimeType','needsReview')`);
console.log("new columns in Neon:", r.rows.map(x => x.column_name).join(", ") || "(missing)");
const t = await c.query(`select t."trqId", e.name, count(d.id)::int docs from "TravelRequest" t join "Employee" e on e."empCode"=t."employeeCode" left join "Document" d on d."travelRequestId"=t.id group by 1,2 order by 1`);
console.table(t.rows);
await c.end();
