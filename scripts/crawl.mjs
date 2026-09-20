import pg from "pg";
const base = process.env.BASE;
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
const claim = (await db.query(`select id from "Claim" limit 1`)).rows[0];
const doc = (await db.query(`select id from "Document" limit 1`)).rows[0];
const docNeeds = (await db.query(`select id from "Document" where "needsReview" = true limit 1`)).rows[0];
await db.end();

const routes = [
  ["/sign-in", "NX-4471"], ["/dashboard", "NX-4471"], ["/requests", "NX-4471"],
  ["/requests/new", "NX-4471"], ["/requests/TRQ-2026-0001", "NX-4471"], ["/claims", "NX-4471"],
  claim && [`/claims/${claim.id}`, "NX-4471"],
  claim && doc && [`/claims/${claim.id}/evidence/${doc.id}`, "NX-4471"],
  claim && docNeeds && [`/claims/${claim.id}/evidence/${docNeeds.id}`, "NX-4471"],
  ["/approvals", "NX-2210"], ["/approvals", "NX-1108"], ["/finance", "NX-3305"],
  ["/admin/categories", "NX-3305"], ["/admin/policy", "NX-3305"], ["/admin/people", "NX-3305"],
  ["/dashboard", "NX-3305"], ["/dashboard", "NX-2210"], ["/claims", "NX-3305"],
  claim && [`/claims/${claim.id}`, "NX-2210"],
  claim && [`/claims/${claim.id}`, "NX-3305"],
  claim && [`/api/claims/${claim.id}/export`, "NX-4471"],
  doc && [`/api/documents/${doc.id}/image`, "NX-4471"],
].filter(Boolean);

for (const [route, actor] of routes) {
  const res = await fetch(base + route, { headers: { cookie: `nortex_actor=${actor}` }, redirect: "manual" });
  const flag = res.status >= 500 ? "  <<< SERVER ERROR" : "";
  console.log(`${String(res.status).padEnd(4)} ${actor}  ${route}${flag}`);
}
