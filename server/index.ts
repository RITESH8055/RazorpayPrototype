// Minimal proxy: the browser never sees ANTHROPIC_API_KEY.
// POST /api/analyze { features, evidence, merchant } -> { recommendation (raw, unguarded), latencyMs }
// The client applies the guardrails and falls back to the scripted result on any error.
import "dotenv/config";
import express from "express";
import Anthropic from "@anthropic-ai/sdk";

const PORT = Number(process.env.PORT ?? 8787);
const MODEL = "claude-sonnet-5-5"; // chosen in the PRD for latency
const TIMEOUT_MS = 8000;

const SYSTEM_PROMPT = `You assist a payments risk analyst at an Indian payment gateway. A young D2C merchant's sales spiked during a festive sale and a volume trigger fired. Judge whether the spike's shape is explained by the merchant's category, live offer and real demand, and recommend a settlement action for the analyst to approve.

Rules:
- Use only the numbers in the provided features and evidence. Do not compute, estimate or invent new numbers.
- Every reason must cite one or more evidence IDs from the provided list (for example "E2"). Cite only IDs that support the claim.
- label: "explained" when category pattern, offer and demand signals account for the spike's shape; "partly_explained" when demand is real but material doubts remain; "unexplained" when the shape does not fit the category, offer or demand signals.
- recommended_action must be one of "partial_release", "hold_and_request", "hold". Full release is never yours to recommend; only an analyst can choose it.
- partial_release_pct is at most 80 and is 0 for holds. reserve_days is how long the remaining amount stays held (30 to 60).
- evidence_requests: the specific documents the analyst should request. Empty when none are needed.
- merchant_message: one or two plain sentences to the merchant. Do not reveal fraud signals or what evidence is missing.
- confidence is your calibrated probability (0 to 1) that the label is correct.
- Give 3 to 5 reasons, most important first, each one sentence.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["label", "confidence", "reasons", "recommended_action", "partial_release_pct", "reserve_days", "evidence_requests", "merchant_message"],
  properties: {
    label: { type: "string", enum: ["explained", "partly_explained", "unexplained"] },
    confidence: { type: "number" },
    reasons: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "evidence_ids"],
        properties: { text: { type: "string" }, evidence_ids: { type: "array", items: { type: "string" } } },
      },
    },
    recommended_action: { type: "string" },
    partial_release_pct: { type: "number" },
    reserve_days: { type: "integer" },
    evidence_requests: { type: "array", items: { type: "string" } },
    merchant_message: { type: "string" },
  },
};

const app = express();
app.use(express.json({ limit: "200kb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, hasKey: Boolean(process.env.ANTHROPIC_API_KEY), model: MODEL });
});

app.post("/api/analyze", async (req, res) => {
  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(503).json({ error: "no_api_key", message: "ANTHROPIC_API_KEY is not set" });
    return;
  }
  const { features, evidence, merchant } = req.body ?? {};
  if (!features || !Array.isArray(evidence)) {
    res.status(400).json({ error: "bad_request", message: "features and evidence are required" });
    return;
  }

  const client = new Anthropic({ timeout: TIMEOUT_MS, maxRetries: 0 });
  const started = Date.now();
  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      messages: [
        {
          role: "user",
          content: `Merchant: ${JSON.stringify(merchant)}\n\nComputed features (numbers come only from here):\n${JSON.stringify(features, null, 2)}\n\nEvidence (cite by id):\n${evidence
            .map((e: { id: string; title: string; text: string }) => `${e.id} [${e.title}]: ${e.text}`)
            .join("\n")}\n\nReturn the recommendation JSON.`,
        },
      ],
    });

    if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") {
      res.status(502).json({ error: "bad_stop", message: `Model stopped: ${response.stop_reason}` });
      return;
    }
    const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      res.status(502).json({ error: "invalid_json", message: "Model returned invalid JSON" });
      return;
    }
    res.json({ recommendation: parsed, latencyMs: Date.now() - started, model: response.model });
  } catch (err) {
    const latencyMs = Date.now() - started;
    if (err instanceof Anthropic.APIConnectionTimeoutError) {
      res.status(504).json({ error: "timeout", message: `No response within ${TIMEOUT_MS / 1000}s`, latencyMs });
    } else if (err instanceof Anthropic.AuthenticationError) {
      res.status(502).json({ error: "auth", message: "API key rejected", latencyMs });
    } else if (err instanceof Anthropic.RateLimitError) {
      res.status(502).json({ error: "rate_limited", message: "Rate limited", latencyMs });
    } else if (err instanceof Anthropic.APIError) {
      res.status(502).json({ error: "api_error", message: `API error ${err.status ?? ""}`.trim(), latencyMs });
    } else {
      res.status(500).json({ error: "server_error", message: "Unexpected proxy error", latencyMs });
    }
  }
});

app.listen(PORT, () => {
  console.log(`Hold Resolver proxy on http://localhost:${PORT} (API key ${process.env.ANTHROPIC_API_KEY ? "found" : "missing: fallback mode"})`);
});
