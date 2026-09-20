import pg from "pg";
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const t = await client.query(`select table_name from information_schema.tables where table_schema='public' order by 1`);
console.log("tables:", t.rows.map(r => r.table_name).join(", ") || "(none)");
for (const table of ["Employee", "TravelRequest", "Category", "Claim"]) {
  try {
    const r = await client.query(`select count(*)::int as n from "${table}"`);
    console.log(`  ${table}: ${r.rows[0].n}`);
  } catch (e) { console.log(`  ${table}: ${e.message.split("\n")[0]}`); }
}
await client.end();
