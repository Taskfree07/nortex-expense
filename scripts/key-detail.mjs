const keys = { new: process.env.NEW_KEY, old: process.env.OLD_KEY };
for (const [label, key] of Object.entries(keys)) {
  if (!key) continue;
  const list = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=3", {
    headers: { "x-goog-api-key": key },
  });
  const body = await list.text();
  console.log(`\n[${label}] list models -> ${list.status}`);
  if (list.ok) {
    console.log("   models:", (body.match(/"name": "models\/[^"]+"/g) || []).slice(0, 3).join(", "));
  } else {
    console.log("   ", body.replace(/\s+/g, " ").slice(0, 300));
  }
}
