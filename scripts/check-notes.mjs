import pg from "pg";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const r = await c.query(`select filename, "extractedJson" from "Document" where filename like '12_%'`);
const e = JSON.parse(r.rows[0].extractedJson);
console.log("notes:", JSON.stringify(e.notes, null, 2));
await c.end();
