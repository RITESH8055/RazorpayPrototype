// Deterministic checks (PRD v0.2, B9). The model only extracts fields; code decides what matches.
import type { Check, Extraction, Order, Scenario } from "../lib/types";
import { GSTIN_CHECK, PAYER_CHECK, REGISTRY_CHECK } from "./reserve";
import registryData from "../data/registry.json";

export interface RegistryEntry {
  gstin: string;
  status: string;
  legal_name: string;
}
/** Synthetic GSTN registry (all companies fictional). Government-controlled in production. */
export const REGISTRY = registryData as RegistryEntry[];

export const LOW_CONFIDENCE = 0.6;

/** Short names for log lines and verdicts. */
export const CHECK_SHORT: Record<string, string> = {
  [GSTIN_CHECK]: "GSTIN format",
  [REGISTRY_CHECK]: "GSTIN registry",
  [PAYER_CHECK]: "payer mismatch",
  "Invoice total vs pattern value": "invoice total",
  "Quantity vs orders": "quantity",
  "Delivery addresses match courier data": "courier addresses",
};
import { fmtDate, inr } from "./format";

const GSTIN_RE = /^[0-3][0-9][A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/** Lower-case, expand legal suffixes and strip punctuation so "Pvt Ltd" and "(P) Ltd" equal "Private Limited". */
export function normaliseName(name: string) {
  return name
    .toLowerCase()
    .replace(/\(\s*p\s*\)/g, " private ")
    .replace(/\bpvt\b\.?/g, "private")
    .replace(/\bltd\b\.?/g, "limited")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function gstinFormat(gstin: string, confidence: number): Check {
  if (confidence < LOW_CONFIDENCE) return { name: GSTIN_CHECK, pass: false, independent: false, detail: gstin ? "GSTIN read with low confidence." : "No GSTIN in the reply." };
  const ok = GSTIN_RE.test(gstin.trim().toUpperCase());
  return { name: GSTIN_CHECK, pass: ok, independent: false, detail: ok ? `${gstin} has a valid 15-character structure.` : `"${gstin || "none"}" is not a valid GSTIN structure.` };
}

export function gstinRegistry(gstin: string, buyerName: string, confidence: number, registry: RegistryEntry[]): Check {
  const name = REGISTRY_CHECK;
  if (confidence < LOW_CONFIDENCE) return { name, pass: false, independent: true, detail: "Not checked: GSTIN or buyer read with low confidence." };
  const entry = registry.find((r) => r.gstin === gstin.trim().toUpperCase());
  if (!entry) return { name, pass: false, independent: true, detail: `${gstin || "No GSTIN"} not found in the registry.` };
  const active = entry.status === "Active";
  const sameName = normaliseName(buyerName) === normaliseName(entry.legal_name);
  return {
    name,
    pass: active && sameName,
    independent: true,
    detail: `${entry.status}; legal name "${entry.legal_name}"${sameName ? ", matches the document's buyer." : `, differs from the document's buyer "${buyerName || "none"}".`}`,
  };
}

/**
 * Payer names come from the buyer's bank, not the merchant. Every payment in the pattern must
 * come from the buyer the document names. Personal cards from many people fail.
 */
export function payerMatch(docBuyer: string, confidence: number, payments: Order[]): Check {
  const payers = [...new Set(payments.map((p) => p.payer_name ?? "Unknown"))];
  const cards = new Set(payments.filter((p) => (p.method ?? "card") === "card").map((p) => p.card_fp));
  if (confidence < LOW_CONFIDENCE || !docBuyer.trim()) {
    return { name: PAYER_CHECK, pass: false, independent: true, detail: "Document names no clear buyer to match against the payers." };
  }
  const matching = payments.filter((p) => p.payer_name && normaliseName(p.payer_name) === normaliseName(docBuyer));
  if (matching.length === payments.length) {
    return { name: PAYER_CHECK, pass: true, independent: true, detail: `All ${payments.length} payments come from "${payers[0]}" (${payments[0].method ?? "card"}), the buyer on the document.` };
  }
  const why = cards.size > 1 ? `paid from ${cards.size} personal cards by ${payers.length} different people` : `payer is "${payers[0]}"`;
  return { name: PAYER_CHECK, pass: false, independent: true, detail: `${matching.length} of ${payments.length} payments come from "${docBuyer}"; ${why}.` };
}

/** Which payments the invoice total covers. Equal-or-smaller payments are matched until the total is used up. */
export function totalMatch(invoiceTotal: number, confidence: number, payments: Order[]) {
  const sorted = [...payments].sort((a, b) => a.amount - b.amount || a.id.localeCompare(b.id));
  const matched: Order[] = [];
  let left = confidence < LOW_CONFIDENCE ? 0 : invoiceTotal;
  for (const p of sorted) {
    if (p.amount <= left + 1) {
      matched.push(p);
      left -= p.amount;
    }
  }
  const matchedValue = matched.reduce((a, p) => a + p.amount, 0);
  const total = payments.reduce((a, p) => a + p.amount, 0);
  const unmatched = payments.filter((p) => !matched.includes(p));
  const check: Check = {
    name: "Invoice total vs pattern value",
    pass: confidence >= LOW_CONFIDENCE && matched.length > 0 && Math.abs(left) <= 1,
    independent: false,
    detail:
      confidence < LOW_CONFIDENCE
        ? "Invoice total read with low confidence."
        : `Invoice ${inr(invoiceTotal)} covers ${matched.length} of ${payments.length} payments (${inr(matchedValue)} of ${inr(total)}).`,
  };
  return { check, matchedIds: matched.map((p) => p.id), matchedValue, unmatched, unmatchedValue: total - matchedValue };
}

export function quantityMatch(quantity: number, confidence: number, orders: Order[]): Check {
  const name = "Quantity vs orders";
  if (confidence < LOW_CONFIDENCE) return { name, pass: false, independent: false, detail: "Quantity read with low confidence." };
  const perOrder = quantity / Math.max(1, orders.length);
  const pass = quantity >= orders.length && perOrder <= 50;
  return { name, pass, independent: false, detail: `${quantity} units across ${orders.length} orders (${perOrder.toFixed(1)} per order).` };
}

export function addressMatch(addresses: string[], orderIds: string[], courier: Scenario["courier_fixture"]): Check {
  const name = "Delivery addresses match courier data";
  const shipTo = orderIds.map((id) => courier.orders[id]?.address).filter((a): a is string => !!a);
  const declared = new Set(addresses.map(normaliseName));
  const hits = shipTo.filter((a) => declared.has(normaliseName(a))).length;
  const distinct = new Set(shipTo).size;
  const share = shipTo.length ? hits / shipTo.length : 0;
  return {
    name,
    pass: share >= 0.8,
    independent: true,
    detail: `${hits} of ${shipTo.length} courier bookings go to an address on the invoice (${distinct} distinct courier address${distinct === 1 ? "" : "es"}).`,
  };
}

/** Capacity patterns: the reply is a dispatch commitment, verified against courier data. */
export function courierProgress(courier: Scenario["courier_fixture"]): Check {
  const pct = Math.round(courier.shipped_share * 100);
  return { name: "Courier progress on spike orders", pass: courier.shipped_share >= 0.6, independent: true, detail: `${pct}% of spike orders already handed to the courier.` };
}

/** Repeat buyers legitimately reuse cards; a new customer's card used 3+ times is the signal. */
export function payerSpread(payments: Order[]): Check {
  const all = new Set(payments.map((p) => p.card_fp));
  const fresh = new Map<string, number>();
  for (const p of payments) if (p.is_new_customer) fresh.set(p.card_fp, (fresh.get(p.card_fp) ?? 0) + 1);
  const repeated = [...fresh.values()].filter((n) => n >= 3).length;
  return {
    name: "Payer spread (Razorpay network)",
    pass: repeated === 0,
    independent: true,
    detail: repeated === 0 ? `${payments.length} payments from ${all.size} different payers; no new-customer card used 3+ times.` : `${repeated} new-customer cards used 3+ times.`,
  };
}

export interface CheckRun {
  checks: Check[];
  matchedValue: number;
  matchedCount: number;
  totalCount: number;
  unmatchedValue: number;
  unmatchedOrders: Order[];
  summary: string;
}

export function runChecks(s: Scenario, patternId: string, x: Extraction): CheckRun {
  const pattern = s.patterns.find((p) => p.id === patternId)!;
  const ids = new Set(pattern.order_ids);
  const payments = s.orders.filter((o) => ids.has(o.id));

  if (pattern.kind === "capacity") {
    const checks = [quantityMatch(x.quantity_total.value, x.quantity_total.confidence, payments), courierProgress(s.courier_fixture), payerSpread(payments)];
    return {
      checks,
      matchedValue: 0,
      matchedCount: 0,
      totalCount: payments.length,
      unmatchedValue: pattern.value,
      unmatchedOrders: payments,
      summary: `Merchant commits to ship ${x.quantity_total.value} orders${/^\d{4}-\d{2}-\d{2}$/.test(x.invoice_date.value) ? ` by ${fmtDate(x.invoice_date.value)}` : ""}. ${checks.filter((c) => c.pass).length} of ${checks.length} checks pass. Releases as the courier confirms pickups.`,
    };
  }

  const total = totalMatch(x.invoice_total.value, x.invoice_total.confidence, payments);
  const checks = [
    gstinFormat(x.gstin.value, x.gstin.confidence),
    gstinRegistry(x.gstin.value, x.buyer_name.value, Math.min(x.gstin.confidence, x.buyer_name.confidence), [s.registry_fixture, ...REGISTRY]),
    payerMatch(x.buyer_name.value, x.buyer_name.confidence, payments),
    total.check,
    quantityMatch(x.quantity_total.value, x.quantity_total.confidence, payments),
    addressMatch(x.delivery_addresses, pattern.order_ids, s.courier_fixture),
  ];
  const payer = checks[2];
  const parts = [`Invoice covers ${total.matchedIds.length} of ${payments.length} payments.`, payer.pass ? "Payer matches buyer." : "Payer does not match buyer."];
  if (total.unmatched.length) parts.push(`${total.unmatched.length} payment${total.unmatched.length > 1 ? "s" : ""} of ${inr(total.unmatchedValue)} not on invoice.`);
  if (!checks[5].pass) parts.push("Courier addresses differ from the invoice.");
  return {
    checks,
    matchedValue: total.matchedValue,
    matchedCount: total.matchedIds.length,
    totalCount: payments.length,
    unmatchedValue: total.unmatchedValue,
    unmatchedOrders: total.unmatched,
    summary: parts.join(" "),
  };
}
