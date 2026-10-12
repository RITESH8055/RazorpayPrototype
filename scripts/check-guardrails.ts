// Acceptance checks for the code-enforced guardrails: npm test
import assert from "node:assert/strict";
import { applyGuardrails, GENERAL_WARNING, InvalidRecommendation } from "../src/lib/guardrails";
import fa from "../src/data/fallback/a.json";
import fb from "../src/data/fallback/b.json";
import fc from "../src/data/fallback/c.json";

const IDS = Array.from({ length: 10 }, (_, i) => `E${i + 1}`);
const base = () => structuredClone(fa) as Record<string, unknown>;

// full_release is blocked and downgraded
let r = applyGuardrails({ ...base(), recommended_action: "full_release", partial_release_pct: 100 }, IDS);
assert.equal(r.recommendation.recommended_action, "partial_release");
assert.equal(r.recommendation.partial_release_pct, 80);

// release capped at 80
r = applyGuardrails({ ...base(), partial_release_pct: 95 }, IDS);
assert.equal(r.recommendation.partial_release_pct, 80);

// confidence below 0.6 forces hold_and_request
r = applyGuardrails({ ...base(), confidence: 0.55 }, IDS);
assert.equal(r.recommendation.recommended_action, "hold_and_request");
assert.equal(r.insufficientEvidence, true);
assert.equal(r.recommendation.partial_release_pct, 0);

// reasons citing nothing or unknown IDs are dropped
r = applyGuardrails(
  { ...base(), reasons: [{ text: "ok", evidence_ids: ["E2"] }, { text: "none", evidence_ids: [] }, { text: "bad", evidence_ids: ["E99"] }] },
  IDS,
);
assert.deepEqual(r.recommendation.reasons.map((x) => x.text), ["ok"]);
assert.equal(r.droppedReasons.length, 2);

// merchant never sees specifics for partly explained / unexplained
for (const f of [fb, fc]) {
  r = applyGuardrails(structuredClone(f), IDS);
  assert.equal(r.recommendation.merchant_message, GENERAL_WARNING);
}
r = applyGuardrails(base(), IDS);
assert.notEqual(r.recommendation.merchant_message, GENERAL_WARNING);

// invalid output throws so the caller falls back
assert.throws(() => applyGuardrails({ label: "maybe" }, IDS), InvalidRecommendation);
assert.throws(() => applyGuardrails("not json", IDS), InvalidRecommendation);

// fallbacks produce the expected results
assert.equal(applyGuardrails(structuredClone(fa), IDS).recommendation.recommended_action, "partial_release");
assert.equal(applyGuardrails(structuredClone(fb), IDS).recommendation.recommended_action, "hold_and_request");
assert.equal(applyGuardrails(structuredClone(fc), IDS).recommendation.recommended_action, "hold");
for (const f of [fa, fb, fc]) assert.equal(applyGuardrails(structuredClone(f), IDS).droppedReasons.length, 0);

console.log("guardrails: all checks passed");
