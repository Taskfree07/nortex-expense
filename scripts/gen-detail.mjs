for (const [label, key] of [["new", process.env.NEW_KEY], ["old", process.env.OLD_KEY]]) {
  for (const version of ["v1beta", "v1"]) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/${version}/models/gemini-2.5-flash:generateContent`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({ contents: [{ parts: [{ text: "say ok" }] }] }),
      },
    );
    const body = (await res.text()).replace(/\s+/g, " ");
    console.log(`[${label}] ${version} -> ${res.status} ${res.ok ? "OK" : body.slice(0, 220)}`);
  }
}
