// Secure Kdrammer brain. Tries several Gemini models until one works.
// GET  /api/gemini           -> health check (is the key set?)
// GET  /api/gemini?models=1  -> lists the models your key can actually use
// POST /api/gemini { text }  -> returns { recommendations: [...] }
const SYS = "You are Kdrammer, an expert guide for TV dramas worldwide - K-dramas, C-dramas, J-dramas, Thai, Turkish, and beyond. The user describes what they feel like watching. Recommend the 4-5 REAL dramas that best match. Favor genuine fit over fame - include lesser-known gems. Do NOT recommend pornographic or explicitly erotic titles. Return ONLY a valid JSON array. Each element: {\"title\": exact English title (TMDB-style), \"year\": release year number, \"match\": integer 50-100 fit score, \"reason\": one short specific sentence}. Order highest match first. Interpret moods thoughtfully (e.g. 'rainy sunday' -> cozy, healing, slow-burn).";

const MODELS = ["gemini-2.5-flash", "gemini-flash-latest", "gemini-2.0-flash", "gemini-2.5-flash-lite", "gemini-1.5-flash"];
const BASE = "https://generativelanguage.googleapis.com/v1beta";

function readJson(req) {
  return new Promise((resolve) => {
    if (req.body && typeof req.body === "object") return resolve(req.body);
    if (typeof req.body === "string") { try { return resolve(JSON.parse(req.body || "{}")); } catch { return resolve({}); } }
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => { try { resolve(JSON.parse(data || "{}")); } catch { resolve({}); } });
    req.on("error", () => resolve({}));
  });
}

async function callModel(model, text) {
  const r = await fetch(BASE + "/models/" + model + ":generateContent?key=" + process.env.GEMINI_KEY, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYS }] },
      contents: [{ role: "user", parts: [{ text }] }],
      generationConfig: { temperature: 0.8, responseMimeType: "application/json" }
    })
  });
  const raw = await r.text();
  return { ok: r.ok, status: r.status, raw };
}

module.exports = async (req, res) => {
  if (req.method === "GET") {
    if (req.query && req.query.models !== undefined) {
      try {
        const r = await fetch(BASE + "/models?key=" + process.env.GEMINI_KEY);
        const d = await r.json();
        res.status(200).json({ hasGeminiKey: !!process.env.GEMINI_KEY, models: (d.models || []).map((m) => m.name), error: d.error || null });
      } catch (e) { res.status(200).json({ error: e.message }); }
      return;
    }
    res.status(200).json({ status: "Kdrammer backend is alive", hasGeminiKey: !!process.env.GEMINI_KEY });
    return;
  }
  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }

  try {
    if (!process.env.GEMINI_KEY) { res.status(200).json({ recommendations: [], error: "no_key" }); return; }
    const body = await readJson(req);
    const text = String((body && body.text) || "").slice(0, 500);
    if (!text.trim()) { res.status(200).json({ recommendations: [], error: "no_text" }); return; }

    let lastErr = "";
    for (const model of MODELS) {
      const { ok, status, raw } = await callModel(model, text);
      if (ok) {
        let d = {};
        try { d = JSON.parse(raw); } catch {}
        const out = (d && d.candidates && d.candidates[0] && d.candidates[0].content && d.candidates[0].content.parts && d.candidates[0].content.parts[0] && d.candidates[0].content.parts[0].text) || "[]";
        let arr = [];
        try { arr = JSON.parse(out.replace(/```json|```/g, "").trim()); } catch {}
        res.status(200).json({ recommendations: Array.isArray(arr) ? arr : [], model });
        return;
      }
      lastErr = status + ": " + raw.slice(0, 150);
      if (status !== 404) break; // a non-404 (bad key / region / quota) won't be fixed by another model
    }
    res.status(200).json({ recommendations: [], error: "all_models_failed", detail: lastErr });
  } catch (e) {
    res.status(200).json({ recommendations: [], error: "server", detail: String(e.message).slice(0, 200) });
  }
};
