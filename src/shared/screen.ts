// Spike screen: decides whether a sale spike settles on time, gets one question, or is held
// for analyst review. Rules over computed signals; no model is involved and no model output
// feeds this decision. Thresholds are assumed placeholders, set on a development seed only
// (see scripts/run-decision-evals.ts) and frozen before the test seed is scored.
import type { SourceId, TriggerFlag, TrustLevel } from "../lib/types";
import { discount, reserve, reserveFloor, trustLevel } from "./reserve";

/** Where each signal comes from. "public" is public web data (social posts); "razorpay" is always on. */
export type SignalSource = SourceId | "public";

/** A group of spike orders that share a trait, with its value. Built from Razorpay order data. */
export interface Segment {
  kind: "repeated_cards" | "cross_border" | "refund_prone" | "bulk_buyer";
  orders: number;
  value: number;
}

/** Everything the screen may read for one sale, grouped by source. */
export interface SaleSignals {
  razorpay: {
    days_on_razorpay: number;
    clean_delivered_orders: number;
    dispute_rate_pct: number;
    /** Spike-day orders ÷ 30-day daily average. The fixed rule reads only this. */
    volume_multiple: number;
    baseline_daily_value: number;
    spike_value: number;
    new_customer_share: number;
    repeated_card_share: number;
    repeated_device_share: number;
    cross_border_share: number;
    cross_border_share_baseline: number;
    refund_rate: number;
    refund_rate_baseline: number;
    aov_shift_pct: number;
    night_share: number;
    night_share_baseline: number;
    coupon_match_rate: number | null;
    segments: Segment[];
  };
  /** Account Aggregator: last year's inflow in the same season, as a multiple of the usual month. */
  bank: { seasonal_inflow_multiple: number } | null;
  /** GST returns: does filed turnover support selling at this scale? */
  gst: { turnover_supports_scale: boolean } | null;
  /** Company registry: age of the company. */
  mca: { company_age_days: number } | null;
  public: { social_lead_hours: number | null; never_received_posts: number };
}

export interface SaleCase {
  /** Sources the merchant consented to for this sale. Razorpay and public data are always usable. */
  consent: Record<"bank" | "gst" | "mca", boolean>;
  /** The merchant's declared sale, if any. */
  declaration: { volume_multiple_min: number; volume_multiple_max: number } | null;
  signals: SaleSignals;
}

export type ScreenDecision = "settle" | "ask" | "hold";

export interface ScreenResult {
  decision: ScreenDecision;
  risk_flags: string[];
  corroborators: string[];
  trigger_flags: TriggerFlag[];
  requires_review: boolean;
  /** Value that waits on the merchant's answer or the analyst. Settles on time otherwise. */
  at_risk_value: number;
  trust: TrustLevel;
  reserve: number;
  question: string | null;
  /** Sources actually read, for the consent guardrail. */
  read: SignalSource[];
}

export const SCREEN_RULES = {
  repeatedCardShare: 0.1,
  repeatedDeviceShare: 0.15,
  crossBorderJump: 0.15,
  refundMultiple: 3,
  refundJump: 0.04,
  aovShiftPct: 60,
  nightJump: 0.2,
  neverReceived: 2,
  envelopeSlack: 0.2,
  couponMatch: 0.25,
  volumeAttention: 3,
  newCustomerShare: 0.7,
} as const;

/** The fixed rule this screen is compared against: hold if volume exceeds 3× the 30-day average. */
export const FIXED_RULE_MULTIPLE = 3;
export function fixedRuleHolds(c: SaleCase) {
  return c.signals.razorpay.volume_multiple > FIXED_RULE_MULTIPLE;
}

/** Reads a source only if consent allows it, and records every read. */
function gate(c: SaleCase) {
  const read = new Set<SignalSource>();
  function use<K extends keyof SaleSignals>(source: K): SaleSignals[K] | null {
    const id = source as string;
    if ((id === "bank" || id === "gst" || id === "mca") && !c.consent[id]) return null;
    read.add(source as SignalSource);
    return c.signals[source];
  }
  return { use, read };
}

const lakhs = (n: number) => `₹${(n / 100000).toFixed(n >= 1e6 ? 1 : 2)} lakh`;

export function screenSale(c: SaleCase): ScreenResult {
  const R = SCREEN_RULES;
  const { use, read } = gate(c);
  const rp = use("razorpay")!;
  const pub = use("public")!;
  const bank = use("bank");
  const gst = use("gst");
  const mca = use("mca");

  const flags: string[] = [];
  const triggers = new Set<TriggerFlag>();
  if (rp.repeated_card_share >= R.repeatedCardShare || rp.repeated_device_share >= R.repeatedDeviceShare) {
    flags.push("card_device_cluster");
    triggers.add("new_card_device_cluster");
  }
  if (rp.cross_border_share - rp.cross_border_share_baseline >= R.crossBorderJump) {
    flags.push("cross_border_burst");
    triggers.add("new_regions");
  }
  if (rp.refund_rate >= Math.max(R.refundMultiple * rp.refund_rate_baseline, rp.refund_rate_baseline + R.refundJump)) flags.push("refund_spike");
  if (rp.aov_shift_pct >= R.aovShiftPct) {
    flags.push("order_value_outside_history");
    triggers.add("order_value_outside_history");
  }
  if (rp.night_share - rp.night_share_baseline >= R.nightJump) flags.push("odd_hours");
  if (pub.never_received_posts >= R.neverReceived) flags.push("never_received_posts");
  if (gst && !gst.turnover_supports_scale) flags.push("gst_turnover_too_small");

  const corroborators: string[] = [];
  const d = c.declaration;
  if (d && rp.volume_multiple >= d.volume_multiple_min * (1 - R.envelopeSlack) && rp.volume_multiple <= d.volume_multiple_max * (1 + R.envelopeSlack)) corroborators.push("inside_declared_plan");
  if (rp.coupon_match_rate !== null && rp.coupon_match_rate >= R.couponMatch) corroborators.push("offer_coupon_used");
  if (pub.social_lead_hours !== null && pub.social_lead_hours >= 1) corroborators.push("social_buzz_came_first");
  if (bank && bank.seasonal_inflow_multiple >= rp.volume_multiple * 0.5) corroborators.push("same_season_last_year");
  if (gst?.turnover_supports_scale) corroborators.push("gst_turnover_supports_scale");
  if (mca && mca.company_age_days >= 3 * 365) corroborators.push("established_company");

  // Mostly new customers with nothing that explains them (no plan, offer, buzz or history).
  if (rp.new_customer_share >= R.newCustomerShare && corroborators.length === 0) flags.push("unexplained_new_customers");

  // Bigger orders and a few repeat cards usually describe the same group (one bulk buyer),
  // so they count as one family of evidence, not two.
  const families = new Set(flags.map((f) => (f === "card_device_cluster" || f === "order_value_outside_history" ? "cluster" : f)));
  const hard = flags.some((f) => f === "cross_border_burst" || f === "refund_spike" || f === "never_received_posts");
  const excess = Math.max(0, rp.spike_value - rp.baseline_daily_value);
  const segValue = (kinds: Segment["kind"][]) => rp.segments.filter((s) => kinds.includes(s.kind)).reduce((a, s) => a + s.value, 0);
  const flaggedKinds: Segment["kind"][] = [
    ...(flags.includes("card_device_cluster") || flags.includes("order_value_outside_history") ? (["repeated_cards", "bulk_buyer"] as const) : []),
    ...(flags.includes("cross_border_burst") ? (["cross_border"] as const) : []),
    ...(flags.includes("refund_spike") ? (["refund_prone"] as const) : []),
  ];

  let decision: ScreenDecision;
  let atRisk = 0;
  if (hard || families.size >= 2) {
    // Independent risk signals at once: hold the spike day for the analyst.
    decision = "hold";
    atRisk = rp.spike_value;
  } else if (families.size === 1) {
    // One kind of risk signal: ask one question about that group of orders; the rest settles.
    decision = "ask";
    atRisk = segValue(flaggedKinds) || excess;
  } else if (rp.volume_multiple >= R.volumeAttention && corroborators.length === 0) {
    // A big spike with nothing that explains it: ask whether it is a sale.
    decision = "ask";
    atRisk = excess;
  } else {
    decision = "settle";
  }
  atRisk = Math.min(Math.round(atRisk), rp.spike_value);

  const trust = trustLevel(rp);
  const triggerFlags = [...triggers];
  const disc = discount(trust, triggerFlags);
  const res = decision === "settle" ? 0 : Math.max(reserve(atRisk, disc), reserveFloor(atRisk));

  return {
    decision,
    risk_flags: flags,
    corroborators,
    trigger_flags: triggerFlags,
    // A pattern change always goes to an analyst; so does every hold.
    requires_review: triggerFlags.length > 0 || decision === "hold",
    at_risk_value: decision === "settle" ? 0 : atRisk,
    trust,
    reserve: res,
    question: decision === "settle" ? null : questionFor(flags, decision, atRisk, rp),
    read: [...read],
  };
}

/**
 * The one question the merchant sees. Pattern level only: it names a group of orders and its
 * value, never a customer, card, device, address or contact detail, and never says why we worry.
 */
export function questionFor(flags: string[], decision: ScreenDecision, value: number, rp: SaleSignals["razorpay"]): string {
  const v = lakhs(value);
  const seg = (k: Segment["kind"]) => rp.segments.find((s) => s.kind === k);
  if (flags.includes("cross_border_burst")) return `Some orders (${v}) were paid with cards issued outside India. Are you selling abroad for this sale?`;
  if (flags.includes("refund_spike")) return `Refunds are higher than usual this week. What changed: a product issue, or a new returns policy?`;
  if (flags.includes("card_device_cluster") || flags.includes("order_value_outside_history")) {
    const s = seg("bulk_buyer") ?? seg("repeated_cards");
    return s ? `These ${s.orders} orders (${lakhs(s.value)}) look like one large purchase. Is this a bulk or corporate order?` : `Orders are bigger than your usual (${v}). Is this a bulk order?`;
  }
  if (flags.includes("never_received_posts")) return `A few buyers say their order hasn't arrived. When will the pending orders ship?`;
  if (flags.includes("odd_hours")) return `Many orders came in late at night. Did you run a midnight offer?`;
  if (flags.includes("gst_turnover_too_small")) return `Sales this week are much higher than usual for your business. Is this a planned sale or event?`;
  return decision === "ask" ? `Orders are ${rp.volume_multiple}× your usual (${v} above a normal day). Are you running a sale?` : `We're reviewing this week's orders (${v}). Anything we should know?`;
}
