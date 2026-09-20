const key = process.env.K;
const models = ["gemini-flash-latest", "gemini-3.6-flash", "gemini-2.5-flash"];
for (const m of models) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({ contents: [{ parts: [{ text: "reply with ok" }] }] }),
  });
  if (res.ok) { console.log(`${m} -> OK`); continue; }
  const j = await res.json().catch(() => ({}));
  console.log(`${m} -> ${res.status} ${String(j.error?.message ?? "").replace(/\s+/g, " ").slice(0, 120)}`);
}
