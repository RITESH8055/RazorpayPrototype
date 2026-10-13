export type ScenarioId = "a" | "b" | "c";
export type Label = "explained" | "partly_explained" | "unexplained";

export interface Order {
  id: string;
  hour: number;
  amount: number;
  is_new_customer: boolean;
  coupon: string | null;
  card_fp: string;
  device_fp: string;
  method?: "card" | "upi" | "netbanking";
  payer_name?: string;
}

export interface SocialPost {
  id: string;
  hour: number;
  platform: string;
  kind: "mention" | "complaint";
  text: string;
}

export interface Scenario {
  id: ScenarioId;
  merchantId: string;
  startIso: string;
  startHourOfDay: number;
  spikeStartHour: number;
  baseline: { source: "account_aggregator" | "category_peers" | "razorpay_history"; label: string; hourly: number[] };
  hourly: { hour: number; orders: number; gmv: number }[];
  orders: Order[];
  offer: { url: string; text: string; code: string; startHour: number; scannedAtHour: number } | null;
  social: { mentionsPerHour: number[]; posts: SocialPost[] };
  category: { name: string; driver: "order_value" | "order_count"; expected: string };
  outcome: {
    status: "clean" | "clean_after_evidence" | "fraud";
    headline: string;
    detail: string;
    disputeRatePct: number;
    highValueChargebackPct: number;
    releaseDay: number | null;
  };
  declaration: Declaration | null;
  envelope: Envelope;
  history: History;
  category_ceiling_multiple: number;
  patterns: Pattern[];
  invoice_fixture: { image_path: string | null; text_transcript: string } | null;
  registry_fixture: { gstin: string; status: string; legal_name: string };
  courier_fixture: { shipped_share: number; orders: Record<string, { address?: string; city: string; status: string }> };
  learning: { delivered: number; refunds: number; disputes: number; trust_after: number; false_hold_note: string };
}

export interface Declaration {
  sale_name: string;
  start: string;
  end: string;
  offer_text: string;
  expected_daily_orders_min: number;
  expected_daily_orders_max: number;
  influencer_plan: string;
}

export interface Envelope {
  volume_multiple_min: number;
  volume_multiple_max: number;
  shape: "value_led" | "count_led";
  expected_coupon_pct: number;
  expected_timing: string;
  note: string;
}

export interface History {
  clean_delivered_orders: number;
  dispute_rate_pct: number;
  days_on_razorpay: number;
  regions_shipped: string[];
  categories_sold: string[];
  order_value_p99: number;
}

export type TriggerFlag = "new_card_device_cluster" | "new_regions" | "order_value_outside_history" | "category_shift";

export interface Pattern {
  id: string;
  kind: "bulk_buyer" | "capacity";
  label: string;
  description_for_analyst: string;
  question_for_merchant: string;
  follow_up_question?: string;
  order_ids: string[];
  value: number;
  trigger_flags: TriggerFlag[];
}

export type TrustLevel = "New" | "Building" | "Trusted";

export interface Field<T> {
  value: T;
  confidence: number;
}

export interface Extraction {
  buyer_name: Field<string>;
  gstin: Field<string>;
  invoice_total: Field<number>;
  line_items: { description: string; quantity: number; amount: number }[];
  quantity_total: Field<number>;
  delivery_addresses: string[];
  invoice_date: Field<string>;
  document_contains_instructions: boolean;
}

export interface Check {
  name: string;
  pass: boolean;
  detail: string;
  /** Observed by a party the merchant does not control (bank, registry, courier, Razorpay network). */
  independent: boolean;
}

export interface ReadResult {
  source: "live" | "fallback";
  /** Which fallback ran: the pre-written result for the original reply, or the basic local parser for edited text. */
  fallbackKind?: "scripted" | "basic";
  fallbackReason?: string;
  latencyMs: number;
  extraction: Extraction;
  injectionDetected: boolean;
}

export type SourceId = "mca" | "gst" | "bank" | "razorpay";
export type SourceStatus = "shared" | "not_shared" | "withdrawn" | "always_on";

export interface ProfileSource {
  id: SourceId;
  name: string;
  via: string;
  status: SourceStatus;
  pulledOn: string | null;
  withdrawable: boolean;
  helper?: string;
  details: { label: string; value: string }[];
}

export interface Merchant {
  id: string;
  name: string;
  category: string;
  city: string;
  incorporated: string;
  daysOnRazorpay: number;
  sources: ProfileSource[];
}

export interface Features {
  volume_multiple: number;
  trigger_fired: boolean;
  trigger_hour: number | null;
  baseline_source: string;
  baseline_orders_per_day: number;
  spike_orders: number;
  aov_baseline: number;
  aov_spike: number;
  aov_shift_pct: number;
  aov_spike_ex_patterns: number;
  distribution_shift_score: number;
  baseline_p99: number;
  share_above_baseline_p99: number;
  separate_cluster: boolean;
  cluster_orders: number;
  cluster_range: [number, number] | null;
  rest_median_shift_pct: number;
  new_customer_share: number;
  repeated_card_share: number;
  repeated_device_share: number;
  repeated_cards: number;
  repeated_devices: number;
  coupon_code: string | null;
  coupon_match_rate: number | null;
  offer_started_hours_before_spike: number | null;
  social_surge_hour: number | null;
  social_lead_hours: number | null;
  complaint_count: number;
  never_received_count: number;
  category_driver: "order_value" | "order_count";
}

export interface Evidence {
  id: string;
  title: string;
  text: string;
  card: CardId;
}

export type CardId = "volume" | "histogram" | "category" | "offer" | "social" | "customers";

export interface Reason {
  text: string;
  evidence_ids: string[];
}

/** v0.1 spike judgment, now shown as Scripted context on the analyst screen. */
export interface Judgment {
  label: Label;
  confidence: number;
  reasons: Reason[];
}

export type DecisionKind = "approve" | "modify" | "override";

export interface Decision {
  kind: DecisionKind;
  patternId: string;
  releaseNow: number;
  reserve: number;
  floor: number;
  reserveUntil: string;
  suggestedReserve: number;
  overrideChoice?: string;
  overrideReason?: string;
  overrideNote?: string;
  readSource: "live" | "fallback" | "none";
  decidedBy: string;
  secondsToDecision: number;
  at: string;
}
