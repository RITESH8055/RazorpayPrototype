import type { AnalysisResult, Evidence, Features, Merchant, Recommendation } from "./types";
import { applyGuardrails } from "./guardrails";

const CLIENT_TIMEOUT_MS = 8500; // proxy times out at 8s; this is a safety net

/** Calls the proxy. Any failure (no key, timeout, invalid JSON, guardrail parse error) loads the scripted fallback. */
export async function runAnalysis(
  features: Features,
  evidence: Evidence[],
  merchant: Merchant,
  fallback: Recommendation,
): Promise<AnalysisResult> {
  const ids = evidence.map((e) => e.id);
  const started = performance.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CLIENT_TIMEOUT_MS);
  let fallbackReason: string;
  try {
    const res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: ctrl.signal,
      body: JSON.stringify({
        features,
        evidence,
        merchant: { name: merchant.name, category: merchant.category, days_on_razorpay: merchant.daysOnRazorpay },
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.message ?? `Proxy returned ${res.status}`);
    const guarded = applyGuardrails(body.recommendation, ids);
    return { source: "live", latencyMs: Math.round(performance.now() - started), ...guarded };
  } catch (err) {
    fallbackReason = err instanceof DOMException && err.name === "AbortError" ? "Timed out" : err instanceof Error ? err.message : "Unknown error";
  } finally {
    clearTimeout(timer);
  }
  const guarded = applyGuardrails(structuredClone(fallback), ids);
  return { source: "fallback", fallbackReason, latencyMs: Math.round(performance.now() - started), ...guarded };
}

/** Scripted result used before an analysis has been run (e.g. for the merchant view). */
export function precomputed(evidence: Evidence[], fallback: Recommendation): AnalysisResult {
  return { source: "fallback", fallbackReason: "Pre-computed", latencyMs: 0, ...applyGuardrails(structuredClone(fallback), evidence.map((e) => e.id)) };
}
