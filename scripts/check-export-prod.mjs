import pg from "pg";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const r = await c.query(`select id, "claimNo", "netClaim", payable, status from "Claim" limit 1`);
const claim = r.rows[0];
console.log("claim:", claim.claimNo, claim.status, "net", claim.netClaim, "payable", claim.payable);
const res = await fetch(`${process.env.BASE}/api/claims/${claim.id}/export`, { headers: { cookie: "nortex_actor=NX-4471" } });
console.log("export:", res.status, res.headers.get("content-type")?.slice(0, 55), (await res.arrayBuffer()).byteLength, "bytes");
await c.end();
