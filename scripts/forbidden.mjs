const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent", {
  method: "POST",
  headers: { "content-type": "application/json", "x-goog-api-key": process.env.NEW_KEY },
  body: JSON.stringify({ contents: [{ parts: [{ text: "ok" }] }] }),
});
const j = await res.json();
console.log("status:", res.status);
console.log("message:", j.error?.message);
console.log("reason :", j.error?.details?.map((d) => d.reason || d["@type"]).join(", "));
