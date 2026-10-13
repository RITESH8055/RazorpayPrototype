// Local dev proxy. On Vercel the same logic runs as functions in api/.
import "dotenv/config";
import express from "express";
import { analyze, hasKey, MODEL } from "./analyze.js";

const PORT = Number(process.env.PORT ?? 8787);
const app = express();
app.use(express.json({ limit: "200kb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, hasKey: hasKey(), model: MODEL });
});

app.post("/api/analyze", async (req, res) => {
  const { status, body } = await analyze(req.body);
  res.status(status).json(body);
});

app.listen(PORT, () => {
  console.log(`Hold Resolver proxy on http://localhost:${PORT} (API key ${hasKey() ? "found" : "missing: fallback mode"})`);
});
