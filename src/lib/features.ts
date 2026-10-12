// All numbers the AI sees are computed here. The model never computes numbers itself.
import type { Evidence, Features, Merchant, Order, Scenario } from "./types";

const TRIGGER_MULTIPLE = 3; // assumed placeholder (PRD section 8)
const TRIGGER_CONSECUTIVE_HOURS = 3;
const REPEAT_THRESHOLD = 3; // a card or device used 3+ times in the spike window

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

function quantile(sorted: number[], q: number) {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** Kolmogorov-Smirnov statistic between two samples: 0 = same shape, 1 = no overlap. */
function ksStatistic(a: number[], b: number[]) {
  const sa = [...a].sort((x, y) => x - y);
  const sb = [...b].sort((x, y) => x - y);
  let i = 0;
  let j = 0;
  let d = 0;
  while (i < sa.length && j < sb.length) {
    const v = Math.min(sa[i], sb[j]);
    while (i < sa.length && sa[i] <= v) i++;
    while (j < sb.length && sb[j] <= v) j++;
    d = Math.max(d, Math.abs(i / sa.length - j / sb.length));
  }
  return d;
}

function repeated(orders: Order[], key: "card_fp" | "device_fp", universe: Order[]) {
  const counts = new Map<string, number>();
  for (const o of universe) counts.set(o[key], (counts.get(o[key]) ?? 0) + 1);
  const hot = new Set([...counts].filter(([, n]) => n >= REPEAT_THRESHOLD).map(([k]) => k));
  const hits = orders.filter((o) => hot.has(o[key]));
  const distinct = new Set(hits.map((o) => o[key]));
  return { share: orders.length ? hits.length / orders.length : 0, distinct: distinct.size };
}

export function splitOrders(s: Scenario) {
  return {
    baseline: s.orders.filter((o) => o.hour < s.spikeStartHour),
    spike: s.orders.filter((o) => o.hour >= s.spikeStartHour),
  };
}

export function triggerHour(s: Scenario): number | null {
  const over = s.hourly.map((h) => h.orders > TRIGGER_MULTIPLE * Math.max(1, s.baseline.hourly[(h.hour + s.startHourOfDay) % 24]));
  for (let h = 0; h + TRIGGER_CONSECUTIVE_HOURS <= over.length; h++) {
    if (over.slice(h, h + TRIGGER_CONSECUTIVE_HOURS).every(Boolean)) return h;
  }
  return null;
}

export function socialSurgeHour(s: Scenario): number | null {
  const m = s.social.mentionsPerHour;
  const base = mean(m.slice(0, 48));
  const bar = Math.max(3 * base, base + 5);
  for (let h = 0; h + 1 < m.length; h++) if (m[h] >= bar && m[h + 1] >= bar) return h;
  return null;
}

export function computeFeatures(s: Scenario): Features {
  const { baseline, spike } = splitOrders(s);
  const baseAmounts = baseline.map((o) => o.amount);
  const spikeAmounts = spike.map((o) => o.amount);
  const sortedBase = [...baseAmounts].sort((a, b) => a - b);
  const p99 = quantile(sortedBase, 0.99);

  const baselinePerDay = s.baseline.hourly.reduce((a, b) => a + b, 0);
  const spikeOrders = s.hourly.slice(s.spikeStartHour).reduce((a, h) => a + h.orders, 0);
  const aovBase = mean(baseAmounts);
  const aovSpike = mean(spikeAmounts);

  // Cluster detection (simple): orders above the baseline 99th percentile. If those
  // orders split around a wide gap, the block above the gap is the candidate cluster.
  const above = spike.filter((o) => o.amount > p99).sort((a, b) => a.amount - b.amount);
  let cluster = above;
  let widest = 1;
  for (let i = 1; i < above.length; i++) {
    const ratio = above[i].amount / above[i - 1].amount;
    if (ratio > 1.5 && ratio > widest) {
      widest = ratio;
      cluster = above.slice(i);
    }
  }
  const inCluster = new Set(cluster.map((o) => o.id));
  const rest = spike.filter((o) => o.amount <= p99).map((o) => o.amount).sort((a, b) => a - b);
  const restMedianShift = quantile(rest, 0.5) / quantile(sortedBase, 0.5) - 1;
  const shareAbove = spike.length ? above.length / spike.length : 0;
  const separateCluster = spike.length > 0 && cluster.length / spike.length > 0.05 && Math.abs(restMedianShift) < 0.15;

  // Card/device concentration: within the high-value cluster if there is one,
  // otherwise across new-customer orders in the spike window.
  const focus = separateCluster ? spike.filter((o) => inCluster.has(o.id)) : spike.filter((o) => o.is_new_customer);
  const cards = repeated(focus, "card_fp", spike);
  const devices = repeated(focus, "device_fp", spike);

  const trig = triggerHour(s);
  const surge = socialSurgeHour(s);
  const posts = s.social.posts;

  return {
    volume_multiple: round(spikeOrders / baselinePerDay, 1),
    trigger_fired: trig !== null,
    trigger_hour: trig,
    baseline_source: s.baseline.source,
    baseline_orders_per_day: Math.round(baselinePerDay),
    spike_orders: spikeOrders,
    aov_baseline: Math.round(aovBase),
    aov_spike: Math.round(aovSpike),
    aov_shift_pct: Math.round((aovSpike / aovBase - 1) * 100),
    distribution_shift_score: round(ksStatistic(baseAmounts, spikeAmounts), 2),
    baseline_p99: Math.round(p99),
    share_above_baseline_p99: round(shareAbove, 3),
    separate_cluster: separateCluster,
    cluster_orders: separateCluster ? cluster.length : 0,
    cluster_range: separateCluster ? [cluster[0].amount, cluster[cluster.length - 1].amount] : null,
    rest_median_shift_pct: Math.round(restMedianShift * 100),
    new_customer_share: round(spike.filter((o) => o.is_new_customer).length / spike.length, 2),
    repeated_card_share: round(cards.share, 2),
    repeated_device_share: round(devices.share, 2),
    repeated_cards: cards.distinct,
    repeated_devices: devices.distinct,
    coupon_code: s.offer?.code ?? null,
    coupon_match_rate: s.offer ? round(spike.filter((o) => o.coupon === s.offer!.code).length / spike.length, 2) : null,
    offer_started_hours_before_spike: s.offer ? s.spikeStartHour - s.offer.startHour : null,
    social_surge_hour: surge,
    social_lead_hours: surge !== null && trig !== null ? trig - surge : null,
    complaint_count: posts.filter((p) => p.kind === "complaint").length,
    never_received_count: posts.filter((p) => /never received/i.test(p.text)).length,
    category_driver: s.category.driver,
  };
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
export const inr = (x: number) => "₹" + Math.round(x).toLocaleString("en-IN");

/** Evidence snippets, each with a stable ID. Fallback results cite these same IDs. */
export function buildEvidence(s: Scenario, f: Features, m: Merchant): Evidence[] {
  const complaints = s.social.posts.filter((p) => p.kind === "complaint");
  const mentions = s.social.posts.filter((p) => p.kind === "mention");
  return [
    {
      id: "E1",
      card: "volume",
      title: "Volume vs baseline",
      text: `${f.spike_orders} orders in 24h vs a baseline of ${f.baseline_orders_per_day}/day: ${f.volume_multiple}x. Trigger (3x baseline for 3 consecutive hours) ${f.trigger_fired ? "fired" : "did not fire"}.`,
    },
    {
      id: "E2",
      card: "histogram",
      title: "Order value distribution",
      text: f.separate_cluster
        ? `Average order value ${inr(f.aov_baseline)} → ${inr(f.aov_spike)}, but driven by a separate cluster: ${f.cluster_orders} orders between ${inr(f.cluster_range![0])} and ${inr(f.cluster_range![1])} (above the baseline 99th percentile of ${inr(f.baseline_p99)}). The rest of the distribution moved ${f.rest_median_shift_pct}% at the median.`
        : `Average order value ${inr(f.aov_baseline)} → ${inr(f.aov_spike)} (${signed(f.aov_shift_pct)}%). Distribution shift score ${f.distribution_shift_score}. ${pct(f.share_above_baseline_p99)} of spike orders sit above the baseline 99th percentile; median of the rest moved ${signed(f.rest_median_shift_pct)}%. No separate cluster.`,
    },
    {
      id: "E3",
      card: "category",
      title: "Category context",
      text: `${s.category.name}: ${s.category.expected}`,
    },
    {
      id: "E4",
      card: "offer",
      title: "Website offer scan",
      text: s.offer
        ? `Offer on ${s.offer.url}: "${s.offer.text}" Live from ${f.offer_started_hours_before_spike === 0 ? "the hour the spike began" : `${f.offer_started_hours_before_spike}h before the spike`}.`
        : "No offer found on the website at scan time.",
    },
    {
      id: "E5",
      card: "offer",
      title: "Coupon use at checkout",
      text:
        f.coupon_match_rate === null
          ? "No coupon codes used at checkout during the spike."
          : `${f.coupon_code} used in ${pct(f.coupon_match_rate)} of spike orders.`,
    },
    {
      id: "E6",
      card: "customers",
      title: "Customer mix",
      text: `${pct(f.new_customer_share)} of spike orders from new customers.`,
    },
    {
      id: "E7",
      card: "customers",
      title: "Card and device concentration",
      text: f.separate_cluster
        ? `${f.repeated_cards} card fingerprints and ${f.repeated_devices} devices account for ${pct(f.repeated_card_share)} of the high-value cluster.`
        : f.repeated_cards === 0
          ? "No repeated card or device clusters among new customers."
          : `${f.repeated_cards} cards used 3+ times among new customers (${pct(f.repeated_card_share)} of new-customer orders).`,
    },
    {
      id: "E8",
      card: "social",
      title: "Social mention timing",
      text:
        f.social_surge_hour === null
          ? "Near-zero social mentions before or during the spike."
          : `Mentions surged ${f.social_lead_hours}h ${f.social_lead_hours! >= 0 ? "before" : "after"} volume. ${mentions[0] ? `First: ${mentions[0].platform}, ${mentions[0].text}` : ""}`,
    },
    {
      id: "E9",
      card: "social",
      title: "Complaint posts",
      text:
        complaints.length === 0
          ? "No complaint posts."
          : `${complaints.length} complaint post${complaints.length > 1 ? "s" : ""}${f.never_received_count ? `, ${f.never_received_count} saying "never received"` : ""}. Example: ${complaints[0].text}`,
    },
    {
      id: "E10",
      card: "volume",
      title: "Baseline and profile",
      text: `${m.daysOnRazorpay} days on Razorpay. Baseline from ${s.baseline.label}. Profile sources: ${m.sources
        .filter((x) => x.status === "verified" || x.status === "consented")
        .map((x) => x.name)
        .join(", ")}.`,
    },
  ];
}

function round(x: number, d: number) {
  const p = 10 ** d;
  return Math.round(x * p) / p;
}
const signed = (x: number) => (x > 0 ? `+${x}` : `${x}`);
