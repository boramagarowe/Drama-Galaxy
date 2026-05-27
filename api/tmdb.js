// Secure TMDB proxy — keeps your TMDB token hidden on the server.
// The website calls /api/tmdb?path=/discover/tv&...  and this adds the token.
module.exports = async (req, res) => {
  try {
    const { path = "", ...rest } = req.query;
    if (typeof path !== "string" || !path.startsWith("/")) {
      res.status(400).json({ error: "bad path" });
      return;
    }
    const url = new URL("https://api.themoviedb.org/3" + path);
    Object.entries(rest).forEach(([k, v]) => {
      if (v != null) url.searchParams.set(k, Array.isArray(v) ? v[0] : v);
    });
    const r = await fetch(url, {
      headers: { Authorization: "Bearer " + process.env.TMDB_TOKEN, accept: "application/json" }
    });
    const data = await r.json();
    // cache successful reads at the edge to save quota & speed things up
    if (r.ok) res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=86400");
    res.status(r.status).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
