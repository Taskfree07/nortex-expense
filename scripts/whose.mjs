import pg from "pg";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const r = await c.query(`select c.id, c."claimNo", c."employeeCode", e.name, c.status from "Claim" c join "Employee" e on e."empCode"=c."employeeCode"`);
console.table(r.rows);
await c.end();
