// Shared analysis call used by the local Express proxy (server/index.ts) and the
// Vercel functions (api/). The browser never sees ANTHROPIC_API_KEY.
import Anthropic from "@anthropic-ai/sdk";

export const MODEL = "claude-sonnet-5-5"; // chosen in the PRD for latency
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

export interface ProxyResult {
  status: number;
  body: Record<string, unknown>;
}

export const hasKey = () => Boolean(process.env.ANTHROPIC_API_KEY);

/** Returns the raw (unguarded) recommendation; the client applies guardrails and falls back on any error. */
export async function analyze(input: unknown): Promise<ProxyResult> {
  if (!hasKey()) return { status: 503, body: { error: "no_api_key", message: "ANTHROPIC_API_KEY is not set" } };
  const { features, evidence, merchant } = (input ?? {}) as { features?: unknown; evidence?: unknown; merchant?: unknown };
  if (!features || !Array.isArray(evidence)) return { status: 400, body: { error: "bad_request", message: "features and evidence are required" } };

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
      return { status: 502, body: { error: "bad_stop", message: `Model stopped: ${response.stop_reason}` } };
    }
    const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    try {
      return { status: 200, body: { recommendation: JSON.parse(text), latencyMs: Date.now() - started, model: response.model } };
    } catch {
      return { status: 502, body: { error: "invalid_json", message: "Model returned invalid JSON" } };
    }
  } catch (err) {
    const latencyMs = Date.now() - started;
    if (err instanceof Anthropic.APIConnectionTimeoutError) return { status: 504, body: { error: "timeout", message: `No response within ${TIMEOUT_MS / 1000}s`, latencyMs } };
    if (err instanceof Anthropic.AuthenticationError) return { status: 502, body: { error: "auth", message: "API key rejected", latencyMs } };
    if (err instanceof Anthropic.RateLimitError) return { status: 502, body: { error: "rate_limited", message: "Rate limited", latencyMs } };
    if (err instanceof Anthropic.APIError) return { status: 502, body: { error: "api_error", message: `API error ${err.status ?? ""}`.trim(), latencyMs } };
    return { status: 500, body: { error: "server_error", message: "Unexpected proxy error", latencyMs } };
  }
}
