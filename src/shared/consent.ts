// Consent gate (PRD v0.2: consent at declaration). Data from a source the merchant has not
// shared for this sale, or has withdrawn, is never read. Razorpay's own order history is
// always on because it is needed to pay the merchant.
import type { Merchant, Scenario, SourceId } from "../lib/types";

export function consented(m: Pick<Merchant, "sources">, id: SourceId) {
  const s = m.sources.find((x) => x.id === id);
  return s?.status === "shared" || s?.status === "always_on";
}

/** Which consented source each baseline type depends on. */
const BASELINE_SOURCE: Partial<Record<Scenario["baseline"]["source"], SourceId>> = { account_aggregator: "bank" };

/**
 * The scenario as the system may use it. If the baseline came from a source that is no longer
 * consented, it is replaced by the merchant's own Razorpay orders before the spike, averaged by
 * hour of day, and the withdrawn data is not carried forward.
 */
export function applyConsent(s: Scenario, m: Pick<Merchant, "sources">): Scenario {
  const needs = BASELINE_SOURCE[s.baseline.source];
  if (!needs || consented(m, needs)) return s;
  const sums = new Array(24).fill(0);
  const counts = new Array(24).fill(0);
  for (const h of s.hourly.slice(0, s.spikeStartHour)) {
    const hod = (h.hour + s.startHourOfDay) % 24;
    sums[hod] += h.orders;
    counts[hod] += 1;
  }
  return {
    ...s,
    baseline: {
      source: "razorpay_history",
      label: "Razorpay orders in the 3 days before the spike (bank history not shared)",
      hourly: sums.map((x, i) => (counts[i] ? Math.round((x / counts[i]) * 100) / 100 : 0)),
    },
  };
}
