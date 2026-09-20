const models = ["gemini-3.6-flash", "gemini-2.5-flash", "gemini-flash-latest", "gemini-2.5-flash-lite"];
for (const [label, key] of [["new", process.env.NEW_KEY], ["old", process.env.OLD_KEY]]) {
  const usable = [];
  for (const m of models) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({ contents: [{ parts: [{ text: "ok" }] }] }),
    });
    usable.push(`${m}=${res.status}`);
  }
  console.log(`[${label}]`, usable.join("  "));
}
