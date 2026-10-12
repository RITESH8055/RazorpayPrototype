// Guardrails enforced in code, never trusted to the model (PRD section 8).
// Applied identically to live model output and to scripted fallback results.
import type { AiAction, GuardrailFlag, Label, Reason, Recommendation } from "./types";

export const MAX_RELEASE_PCT = 80; // assumed cap for the prototype
export const MIN_CONFIDENCE = 0.6;
export const GENERAL_WARNING =
  "Your sales are well above your usual level. A review of your settlements may follow. Keep order invoices and delivery proofs ready so the review can move quickly.";

const LABELS: Label[] = ["explained", "partly_explained", "unexplained"];
const ACTIONS: AiAction[] = ["partial_release", "hold_and_request", "hold"];

export class InvalidRecommendation extends Error {}

/** Validates the raw shape. Throws InvalidRecommendation so the caller can fall back. */
export function parseRecommendation(raw: unknown): Recommendation & { recommended_action: string } {
  if (!raw || typeof raw !== "object") throw new InvalidRecommendation("Not a JSON object");
  const r = raw as Record<string, unknown>;
  if (!LABELS.includes(r.label as Label)) throw new InvalidRecommendation(`Unknown label: ${String(r.label)}`);
  if (typeof r.confidence !== "number" || Number.isNaN(r.confidence)) throw new InvalidRecommendation("Missing confidence");
  if (typeof r.recommended_action !== "string") throw new InvalidRecommendation("Missing recommended_action");
  if (!Array.isArray(r.reasons)) throw new InvalidRecommendation("Missing reasons");
  return {
    label: r.label as Label,
    confidence: Math.min(1, Math.max(0, r.confidence)),
    reasons: r.reasons
      .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
      .map((x) => ({
        text: String(x.text ?? ""),
        evidence_ids: Array.isArray(x.evidence_ids) ? x.evidence_ids.map(String) : [],
      })),
    recommended_action: r.recommended_action as AiAction,
    partial_release_pct: typeof r.partial_release_pct === "number" ? r.partial_release_pct : 0,
    reserve_days: typeof r.reserve_days === "number" ? Math.max(0, Math.round(r.reserve_days)) : 30,
    evidence_requests: Array.isArray(r.evidence_requests) ? r.evidence_requests.map(String) : [],
    merchant_message: typeof r.merchant_message === "string" ? r.merchant_message : "",
  };
}

export function applyGuardrails(raw: unknown, validEvidenceIds: string[]) {
  const rec = parseRecommendation(raw);
  const flags: GuardrailFlag[] = [];
  const valid = new Set(validEvidenceIds);

  // 1. The AI can never recommend full release. Downgrade to partial release.
  if (!ACTIONS.includes(rec.recommended_action)) {
    flags.push({
      rule: "No full release",
      detail: `Model returned "${rec.recommended_action}". Downgraded to partial_release; full release is analyst-only.`,
    });
    rec.recommended_action = "partial_release";
    if (!rec.partial_release_pct) rec.partial_release_pct = MAX_RELEASE_PCT;
  }

  // 2. Release percentage capped.
  if (rec.partial_release_pct > MAX_RELEASE_PCT) {
    flags.push({ rule: "Release cap", detail: `Release ${rec.partial_release_pct}% capped at ${MAX_RELEASE_PCT}%.` });
    rec.partial_release_pct = MAX_RELEASE_PCT;
  }
  rec.partial_release_pct = Math.max(0, Math.round(rec.partial_release_pct));

  // 3. Every reason must cite at least one existing evidence ID.
  const kept: Reason[] = [];
  const dropped: Reason[] = [];
  for (const reason of rec.reasons) {
    const ids = reason.evidence_ids.filter((id) => valid.has(id));
    if (ids.length === 0 || ids.length !== reason.evidence_ids.length || !reason.text.trim()) dropped.push(reason);
    else kept.push(reason);
  }
  if (dropped.length) {
    flags.push({
      rule: "Evidence citations",
      detail: `${dropped.length} reason${dropped.length > 1 ? "s" : ""} dropped for citing no evidence or unknown IDs.`,
    });
  }
  rec.reasons = kept;

  // 4. Low confidence (or no surviving reasons) forces hold and request, routed to the analyst.
  let insufficientEvidence = false;
  if (rec.confidence < MIN_CONFIDENCE || kept.length === 0) {
    insufficientEvidence = true;
    if (rec.recommended_action !== "hold_and_request") {
      flags.push({
        rule: "Low confidence",
        detail: `Confidence ${rec.confidence.toFixed(2)} is below ${MIN_CONFIDENCE} or no valid reasons. Forced hold_and_request: insufficient evidence.`,
      });
    }
    rec.recommended_action = "hold_and_request";
    if (rec.evidence_requests.length === 0) rec.evidence_requests = ["Insufficient evidence: analyst to specify requests"];
  }

  // Holds release nothing.
  if (rec.recommended_action !== "partial_release") rec.partial_release_pct = 0;

  // 5. Merchant never sees specific gaps unless the spike is explained.
  if (rec.label !== "explained" || rec.recommended_action !== "partial_release") {
    if (rec.merchant_message && rec.merchant_message !== GENERAL_WARNING) {
      flags.push({ rule: "Merchant message", detail: "Specific merchant message replaced with the general warning." });
    }
    rec.merchant_message = GENERAL_WARNING;
  }

  return { recommendation: rec as Recommendation, droppedReasons: dropped, flags, insufficientEvidence };
}
