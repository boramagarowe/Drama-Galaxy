// Secure Kdrammer brain. Uses the highest-free-limit Gemini models, thinking off for speed.
// GET  /api/gemini           -> health check
// POST /api/gemini { text }  -> returns { recommendations: [...] }
const SYS = "You are Kdrammer, an expert guide for TV dramas worldwide - K-dramas, C-dramas, J-dramas, Thai, Turkish, and beyond. The user describes what they feel like watching. Recommend the 4-5 REAL dramas that best match. Favor genuine fit over fame - include lesser-known gems. Do NOT recommend pornographic or explicitly erotic titles. Return ONLY a valid JSON array. Each element: {\"title\": exact English title (TMDB-style), \"year\": release year number, \"match\": integer 50-100 fit score, \"reason\": one short specific sentence}. Order highest match first. Interpret moods thoughtfully (e.g. 'rainy sunday' -> cozy, healing, slow-burn).";

// Full Flash first (smartest). If it's rate-limited, auto-drop to Flash-Lite (higher free limits).
const MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-flash-latest", "gemini-flash-lite-latest"];
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
      generationConfig: {
        temperature: 0.8,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 0 }
      }
    })
  });
  const raw = await r.text();
  return { ok: r.ok, status: r.status, raw };
}

module.exports = async (req, res) => {
  if (req.method === "GET") {
    res.status(200).json({ status: "Kdrammer backend is alive" });
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
      lastErr = status + ": " + raw.slice(0, 120);
      // 404 (wrong name) or 429 (rate-limited) -> try the next model. Other errors -> stop.
      if (status !== 404 && status !== 429) break;
    }
    res.status(200).json({ recommendations: [], error: "all_models_failed", detail: lastErr });
  } catch (e) {
    res.status(200).json({ recommendations: [], error: "server", detail: String(e.message).slice(0, 200) });
  }
};
