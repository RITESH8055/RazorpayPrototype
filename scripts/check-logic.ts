// Acceptance checks for reserve, trust, checks and extraction guardrails: npm test
import assert from "node:assert/strict";
import type { Scenario } from "../src/lib/types";
import { runChecks } from "../src/logic/checks";
import { clampReserve, discount, reserve, reserveFloor, settle, trustLevel } from "../src/logic/reserve";
import { InvalidExtraction, looksLikeInstructions, parseExtraction } from "../src/logic/extraction";
import a from "../src/data/scenarios/a.json";
import b from "../src/data/scenarios/b.json";
import c from "../src/data/scenarios/c.json";
import ra from "../src/data/fallback/read-reply-a.json";
import rb from "../src/data/fallback/read-reply-b.json";
import rc from "../src/data/fallback/read-reply-c.json";

const A = a as unknown as Scenario;
const B = b as unknown as Scenario;
const C = c as unknown as Scenario;

// Trust levels from history
assert.equal(trustLevel(A.history), "Building");
assert.equal(trustLevel(B.history), "New");
assert.equal(trustLevel(C.history), "New");
assert.equal(trustLevel({ clean_delivered_orders: 6000, dispute_rate_pct: 0.2, days_on_razorpay: 120 }), "Trusted");
assert.equal(trustLevel({ clean_delivered_orders: 6000, dispute_rate_pct: 0.9, days_on_razorpay: 120 }), "New");

// Discounts: ceiling 50%, any pattern trigger resets to 0
assert.equal(discount("Trusted", []), 0.5);
assert.equal(discount("Trusted", ["new_regions"]), 0);

// Reserve floor: never below 50% of unresolved; Modify clamps to [floor, unresolved]
assert.equal(reserve(100000, 0.9), 50000);
assert.equal(reserve(0, 0.25), 0);
assert.equal(clampReserve(1000, 84000), reserveFloor(84000));
assert.equal(clampReserve(999999, 84000), 84000);

// Scenario A: 6 of 7 matched, ₹5,04,000 released, ₹63,000 reserve
const pa = A.patterns[0];
const runA = runChecks(A, pa.id, parseExtraction(ra));
assert.equal(runA.matchedCount, 6);
assert.equal(runA.totalCount, 7);
const sa = settle(pa, trustLevel(A.history), runA.matchedValue, runA.checks);
assert.equal(sa.release, 504000);
assert.equal(sa.reserve, 63000);
assert.equal(runA.summary, "Invoice covers 6 of 7 payments. Payer matches buyer. 1 payment of ₹84,000 not on invoice.");

// Scenario C: payer check fails, ₹0 released, full reserve, instructions flagged
const pc = C.patterns[0];
const xc = parseExtraction(rc);
const runC = runChecks(C, pc.id, xc);
assert.equal(runC.checks.find((k) => k.name === "Legal name matches payer")!.pass, false);
assert.equal(runC.checks.find((k) => k.name === "GSTIN format valid")!.pass, true);
const sc = settle(pc, trustLevel(C.history), runC.matchedValue, runC.checks);
assert.equal(sc.release, 0);
assert.equal(sc.reserve, pc.value);
assert.equal(xc.document_contains_instructions, true);
assert.ok(looksLikeInstructions(C.invoice_fixture!.text_transcript));
assert.ok(!looksLikeInstructions(A.invoice_fixture!.text_transcript));

// Scenario B: capacity pattern, nothing released before shipments confirm, New = full reserve
const pb = B.patterns[0];
const runB = runChecks(B, pb.id, parseExtraction(rb));
const sb = settle(pb, trustLevel(B.history), runB.matchedValue, runB.checks);
assert.equal(sb.release, 0);
assert.equal(sb.reserve, pb.value);

// Low confidence fields fail their checks; injected instructions can't move money
const lowA = parseExtraction({ ...ra, gstin: { value: "29AAICV4821K1Z5", confidence: 0.4 } });
assert.equal(runChecks(A, pa.id, lowA).checks[0].pass, false);
const injectedA = parseExtraction({ ...ra, invoice_total: { value: 588000, confidence: 0.99 }, release_all: true, document_contains_instructions: true });
assert.ok(!("release_all" in injectedA), "unknown fields are dropped");

// Invalid output throws so the client falls back
assert.throws(() => parseExtraction("nope"), InvalidExtraction);
assert.throws(() => parseExtraction({ buyer_name: { value: "x" } }), InvalidExtraction);

console.log("logic: all checks passed");
