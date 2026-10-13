// Synthetic sale cases for the decision evals (evals 1, 2, 5). Seeded, so every run is identical.
// Archetypes overlap on purpose: genuine viral sales bring many new customers, some fraud
// rings declare a sale to look normal, slow bust-outs stay under 3×. Neither the screen nor
// the fixed rule should be perfect on this set. All merchants and numbers are fictional.
import type { SaleCase, Segment } from "../../src/shared/screen";

export type Archetype =
  | "declared_festive"
  | "undeclared_viral"
  | "genuine_bulk_order"
  | "established_seasonal"
  | "quiet_growth"
  | "bust_out"
  | "slow_bust_out"
  | "refund_abuse"
  | "cross_border_burst";

export const RISKY: Archetype[] = ["bust_out", "slow_bust_out", "refund_abuse", "cross_border_burst"];

export interface LabelledCase {
  id: string;
  archetype: Archetype;
  risky: boolean;
  /** Ground truth: money expected to be lost to disputes, refunds or chargebacks. 0 for genuine sales. */
  exposure: number;
  case: SaleCase;
}

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MIX: [Archetype, number][] = [
  ["declared_festive", 0.2],
  ["undeclared_viral", 0.12],
  ["genuine_bulk_order", 0.1],
  ["established_seasonal", 0.12],
  ["quiet_growth", 0.06],
  ["bust_out", 0.12],
  ["slow_bust_out", 0.08],
  ["refund_abuse", 0.1],
  ["cross_border_burst", 0.1],
];

export function generateSales(seed: number, n: number): LabelledCase[] {
  const r = rng(seed);
  const u = (lo: number, hi: number) => lo + (hi - lo) * r();
  const ui = (lo: number, hi: number) => Math.round(u(lo, hi));
  const chance = (p: number) => r() < p;
  const pick = (): Archetype => {
    let x = r();
    for (const [a, w] of MIX) if ((x -= w) < 0) return a;
    return MIX[MIX.length - 1][0];
  };

  const out: LabelledCase[] = [];
  for (let i = 0; i < n; i++) {
    const kind = pick();
    const risky = RISKY.includes(kind);
    const established = kind === "established_seasonal" || (!risky && chance(0.4));
    const days = risky ? ui(25, chance(0.3) ? 400 : 150) : established ? ui(200, 1500) : ui(20, 400);
    const delivered = risky ? ui(150, 3000) : established ? ui(3000, 40000) : ui(100, 6000);
    const dispute = risky ? u(0.05, 0.6) : u(0.02, 0.45);
    const aov = ui(500, 4000);
    const baselineOrders = ui(30, 400);
    const baselineValue = baselineOrders * aov;

    let vol = 1;
    let aovShift = ui(-10, 15);
    let newCust = u(0.15, 0.4);
    let repCard = u(0, 0.04);
    let repDev = u(0, 0.06);
    let xbBase = u(0, 0.04);
    let xb = xbBase + u(-0.01, 0.03);
    let refundBase = u(0.005, 0.03);
    let refund = refundBase * u(0.8, 1.6);
    let nightBase = u(0.05, 0.15);
    let night = nightBase + u(-0.03, 0.08);
    let coupon: number | null = null;
    let social: number | null = chance(0.3) ? ui(-6, 3) : null;
    let neverRec = chance(0.1) ? 1 : 0;
    let declaration: SaleCase["declaration"] = null;
    let seasonal = u(0.8, 1.6);
    let gstOk = chance(0.85);
    const segments: Segment[] = [];
    let exposureShare = 0;

    const declare = (actual: number, accuracy: number) => {
      const centre = actual * u(1 - accuracy, 1 + accuracy);
      declaration = { volume_multiple_min: Math.max(1, Math.round(centre * 0.6 * 10) / 10), volume_multiple_max: Math.round(centre * 1.3 * 10) / 10 };
    };

    switch (kind) {
      case "declared_festive":
        vol = u(2.5, 9);
        declare(vol, chance(0.2) ? 0.7 : 0.25);
        coupon = chance(0.8) ? u(0.2, 0.75) : u(0.02, 0.2);
        newCust = u(0.3, 0.65);
        aovShift = ui(-20, 45);
        social = chance(0.6) ? ui(-2, 8) : social;
        seasonal = u(1.5, 6);
        repCard = u(0, 0.07);
        break;
      case "undeclared_viral":
        vol = u(4, 14);
        newCust = u(0.55, 0.9);
        social = chance(0.75) ? ui(1, 8) : ui(-4, 0);
        coupon = chance(0.4) ? u(0.1, 0.5) : null;
        xb = xbBase + u(0, 0.12); // diaspora buyers
        night = nightBase + u(0, 0.18);
        repCard = u(0.01, 0.09);
        break;
      case "genuine_bulk_order": {
        vol = u(1.3, 3.5);
        aovShift = ui(40, 220);
        const orders = ui(20, 150);
        const value = orders * aov * u(3, 8);
        segments.push({ kind: "bulk_buyer", orders, value: Math.round(value) });
        repCard = u(0.08, 0.35); // a company paying with a few cards
        repDev = u(0.05, 0.3);
        if (chance(0.3)) declare(vol, 0.3);
        break;
      }
      case "established_seasonal":
        vol = u(2, 6);
        seasonal = u(vol * 0.6, vol * 1.5);
        coupon = chance(0.5) ? u(0.1, 0.6) : null;
        if (chance(0.4)) declare(vol, 0.3);
        break;
      case "quiet_growth":
        vol = u(1.1, 2.6);
        break;
      case "bust_out": {
        vol = u(3, 16);
        aovShift = ui(30, 220);
        newCust = u(0.65, 0.95);
        repCard = u(0.06, 0.45);
        repDev = u(0.05, 0.4);
        social = chance(0.8) ? null : ui(-3, 2);
        neverRec = chance(0.5) ? ui(1, 6) : 0;
        gstOk = chance(0.3);
        seasonal = u(0.5, 1.5);
        if (chance(0.3)) {
          declare(vol, 0.3); // the ring declares a sale to look normal
          coupon = u(0.05, 0.4);
        }
        exposureShare = u(0.5, 0.9);
        const orders = Math.round(baselineOrders * vol * repCard * 1.2);
        segments.push({ kind: "repeated_cards", orders, value: Math.round(orders * aov * (1 + aovShift / 100)) });
        break;
      }
      case "slow_bust_out": {
        vol = u(1.6, 2.9);
        aovShift = ui(15, 120);
        newCust = u(0.4, 0.8);
        repCard = u(0.04, 0.2);
        repDev = u(0.03, 0.2);
        neverRec = chance(0.3) ? ui(1, 3) : 0;
        gstOk = chance(0.5);
        exposureShare = u(0.4, 0.8);
        const orders = Math.round(baselineOrders * vol * repCard * 1.5);
        segments.push({ kind: "repeated_cards", orders, value: Math.round(orders * aov * (1 + aovShift / 100)) });
        break;
      }
      case "refund_abuse": {
        vol = u(1.8, 6);
        refund = Math.min(0.4, refundBase * u(2.5, 10) + u(0.01, 0.06));
        repDev = u(0.05, 0.3);
        newCust = u(0.3, 0.7);
        exposureShare = refund * u(0.8, 1.1);
        const orders = Math.round(baselineOrders * vol * refund * 1.5);
        segments.push({ kind: "refund_prone", orders, value: Math.round(orders * aov) });
        if (chance(0.25)) declare(vol, 0.3);
        break;
      }
      case "cross_border_burst": {
        vol = u(2.5, 20);
        xb = xbBase + u(0.12, 0.85);
        night = nightBase + u(0.05, 0.4);
        repCard = u(0.02, 0.3);
        newCust = u(0.7, 0.98);
        social = null;
        exposureShare = xb * u(0.6, 0.95);
        const orders = Math.round(baselineOrders * vol * xb);
        segments.push({ kind: "cross_border", orders, value: Math.round(orders * aov * (1 + aovShift / 100)) });
        break;
      }
    }

    const spikeValue = Math.round(baselineValue * vol * (1 + aovShift / 100));
    // Some fraud leaks outside the visible segment: exposure is a share of the whole spike.
    const exposure = risky ? Math.round(spikeValue * Math.min(1, exposureShare)) : 0;
    const clamp = (x: number) => Math.max(0, Math.min(1, Math.round(x * 1000) / 1000));

    out.push({
      id: `s${String(i + 1).padStart(3, "0")}`,
      archetype: kind,
      risky,
      exposure,
      case: {
        consent: { bank: chance(0.6), gst: chance(0.7), mca: chance(0.9) },
        declaration,
        signals: {
          razorpay: {
            days_on_razorpay: days,
            clean_delivered_orders: delivered,
            dispute_rate_pct: Math.round(dispute * 100) / 100,
            volume_multiple: Math.round(vol * 10) / 10,
            baseline_daily_value: baselineValue,
            spike_value: spikeValue,
            new_customer_share: clamp(newCust),
            repeated_card_share: clamp(repCard),
            repeated_device_share: clamp(repDev),
            cross_border_share: clamp(xb),
            cross_border_share_baseline: clamp(xbBase),
            refund_rate: clamp(refund),
            refund_rate_baseline: clamp(refundBase),
            aov_shift_pct: aovShift,
            night_share: clamp(night),
            night_share_baseline: clamp(nightBase),
            coupon_match_rate: coupon === null ? null : clamp(coupon),
            segments,
          },
          bank: { seasonal_inflow_multiple: Math.round(seasonal * 10) / 10 },
          gst: { turnover_supports_scale: gstOk },
          mca: { company_age_days: risky ? ui(60, 900) : ui(200, 4000) },
          public: { social_lead_hours: social, never_received_posts: neverRec },
        },
      },
    });
  }
  return out;
}
