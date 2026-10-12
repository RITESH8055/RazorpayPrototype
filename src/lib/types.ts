export type ScenarioId = "a" | "b" | "c";
export type Label = "explained" | "partly_explained" | "unexplained";
export type AiAction = "partial_release" | "hold_and_request" | "hold";
export type FinalAction = AiAction | "full_release";

export interface Order {
  id: string;
  hour: number;
  amount: number;
  is_new_customer: boolean;
  coupon: string | null;
  card_fp: string;
  device_fp: string;
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
  baseline: { source: "account_aggregator" | "category_peers"; label: string; hourly: number[] };
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
  learning: { approve: string; modify: string };
}

export type SourceId = "mca" | "gst" | "bank" | "razorpay";
export type SourceStatus = "verified" | "consented" | "not_consented" | "withdrawn" | "pending_reverification";

export interface ProfileSource {
  id: SourceId;
  name: string;
  via: string;
  status: SourceStatus;
  pulledOn: string | null;
  withdrawable: boolean;
  details: { label: string; value: string }[];
}

export interface Merchant {
  id: string;
  name: string;
  category: string;
  city: string;
  incorporated: string;
  daysOnRazorpay: number;
  usualDailyGmv: number;
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

export interface Recommendation {
  label: Label;
  confidence: number;
  reasons: Reason[];
  recommended_action: AiAction;
  partial_release_pct: number;
  reserve_days: number;
  evidence_requests: string[];
  merchant_message: string;
}

export interface GuardrailFlag {
  rule: string;
  detail: string;
}

export interface AnalysisResult {
  source: "live" | "fallback";
  fallbackReason?: string;
  latencyMs: number;
  recommendation: Recommendation;
  droppedReasons: Reason[];
  flags: GuardrailFlag[];
  insufficientEvidence: boolean;
}

export type DecisionKind = "approve" | "modify" | "override";

export interface Decision {
  kind: DecisionKind;
  action: FinalAction;
  releasePct: number;
  reserveDays: number;
  overrideReason?: string;
  overrideNote?: string;
  aiLabel: Label;
  aiAction: AiAction;
  aiSource: "live" | "fallback";
  decidedBy: string;
  secondsToDecision: number;
  at: string;
}
