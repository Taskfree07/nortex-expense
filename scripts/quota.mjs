const key = process.env.GEMINI_API_KEY;
for (const model of ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash"]) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({ contents: [{ parts: [{ text: "Reply with the single word: ok" }] }] }),
  });
  const t = await res.text();
  if (res.ok) console.log(model, "-> OK");
  else {
    const m = t.match(/"quotaId":\s*"([^"]+)"/)?.[1] ?? "";
    const v = t.match(/"quotaValue":\s*"([^"]+)"/)?.[1] ?? "";
    const retry = t.match(/"retryDelay":\s*"([^"]+)"/)?.[1] ?? "";
    console.log(model, "->", res.status, m, v ? `limit ${v}` : "", retry ? `retry in ${retry}` : "");
  }
}
