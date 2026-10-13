// Deterministic checks (PRD v0.2, B9). The model only extracts fields; code decides what matches.
import type { Check, Extraction, Order, Scenario } from "../lib/types";
import { PAYER_CHECK } from "./reserve";

export const LOW_CONFIDENCE = 0.6;
import { fmtDate, inr } from "../lib/format";

const GSTIN_RE = /^[0-3][0-9][A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/** Lower-case, expand legal suffixes and strip punctuation so "Pvt Ltd" equals "Private Limited". */
export function normaliseName(name: string) {
  return name
    .toLowerCase()
    .replace(/\bpvt\b\.?/g, "private")
    .replace(/\bltd\b\.?/g, "limited")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function gstinFormat(gstin: string, confidence: number): Check {
  if (confidence < LOW_CONFIDENCE) return { name: "GSTIN format valid", pass: false, independent: false, detail: "GSTIN read with low confidence." };
  const ok = GSTIN_RE.test(gstin.trim().toUpperCase());
  return { name: "GSTIN format valid", pass: ok, independent: false, detail: ok ? `${gstin} has a valid 15-character structure.` : `"${gstin || "none"}" is not a valid GSTIN structure.` };
}

export function gstinRegistry(gstin: string, buyerName: string, confidence: number, registry: Scenario["registry_fixture"]): Check {
  const name = "GSTIN registry status and legal name";
  if (confidence < LOW_CONFIDENCE) return { name, pass: false, independent: true, detail: "Not checked: GSTIN read with low confidence." };
  if (gstin.trim().toUpperCase() !== registry.gstin) return { name, pass: false, independent: true, detail: `${gstin || "No GSTIN"} not found in the registry.` };
  const active = registry.status === "Active";
  const sameName = normaliseName(buyerName) === normaliseName(registry.legal_name);
  return {
    name,
    pass: active && sameName,
    independent: true,
    detail: `${registry.status}; legal name "${registry.legal_name}"${sameName ? ", matches the invoice buyer." : `, differs from invoice buyer "${buyerName}".`}`,
  };
}

/** Payer names come from the buyer's bank, not the merchant. Personal cards from many people fail. */
export function payerMatch(legalName: string, payments: Order[]): Check {
  const payers = [...new Set(payments.map((p) => p.payer_name ?? "Unknown"))];
  const cards = new Set(payments.filter((p) => p.method === "card").map((p) => p.card_fp));
  const matching = payments.filter((p) => p.payer_name && normaliseName(p.payer_name) === normaliseName(legalName));
  if (matching.length === payments.length) {
    return { name: PAYER_CHECK, pass: true, independent: true, detail: `All ${payments.length} payments come from "${payers[0]}" (${payments[0].method ?? "card"}), which matches ${legalName}.` };
  }
  const why = cards.size > 1 ? `paid from ${cards.size} personal cards by ${payers.length} different people` : `payer "${payers[0]}"`;
  return { name: PAYER_CHECK, pass: false, independent: true, detail: `${matching.length} of ${payments.length} payments match ${legalName}; ${why}.` };
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
    gstinRegistry(x.gstin.value, x.buyer_name.value, Math.min(x.gstin.confidence, x.buyer_name.confidence), s.registry_fixture),
    payerMatch(s.registry_fixture.legal_name, payments),
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
