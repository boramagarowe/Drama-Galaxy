// Secure Kdrammer brain — keeps your Gemini key hidden on the server.
// The website POSTs { text } here; this asks Gemini and returns clean picks.
const SYS = `You are Kdrammer, an expert guide for TV dramas worldwide — K-dramas, C-dramas, J-dramas, Thai, Turkish, and beyond. The user describes what they feel like watching. Recommend the 4-5 REAL dramas that best match. Favor genuine fit over fame — include lesser-known gems. Do NOT recommend pornographic or explicitly erotic titles.
Return ONLY a valid JSON array. Each element: {"title": exact English title (TMDB-style), "year": release year number, "match": integer 50-100 fit score, "reason": one short specific sentence}. Order highest match first. Interpret moods thoughtfully (e.g. "rainy sunday" -> cozy, healing, slow-burn).`;

module.exports = async (req, res) => {
  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }
  try {
    let body = req.body;
    if (typeof body === "string") { try { body = JSON.parse(body || "{}"); } catch { body = {}; } }
    const text = ((body && body.text) || "").toString().slice(0, 500);
    if (!text.trim()) { res.status(400).json({ error: "no text" }); return; }

    const r = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + process.env.GEMINI_KEY,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYS }] },
          contents: [{ role: "user", parts: [{ text }] }],
          generationConfig: { temperature: 0.8, responseMimeType: "application/json" }
        })
      }
    );
    if (!r.ok) { res.status(r.status).json({ error: "gemini " + r.status }); return; }
    const d = await r.json();
    const out = d?.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
    let arr;
    try { arr = JSON.parse(out.replace(/```json|```/g, "").trim()); } catch { arr = []; }
    res.status(200).json({ recommendations: Array.isArray(arr) ? arr : [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
