const key = process.env.GEMINI_API_KEY;
const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=5", {
  headers: { "x-goog-api-key": key },
});
console.log("list models:", res.status);
const body = await res.text();
console.log(body.slice(0, 400));
