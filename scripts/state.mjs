import pg from "pg";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const r = await c.query(`select t."trqId", t.destination, t.status, e.name, count(cl.id)::int as claims
                         from "TravelRequest" t join "Employee" e on e."empCode"=t."employeeCode"
                         left join "Claim" cl on cl."travelRequestId"=t.id
                         group by 1,2,3,4 order by 1`);
console.table(r.rows);
const d = await c.query(`select count(*)::int as docs from "Document"`);
console.log("documents:", d.rows[0].docs);
await c.end();
