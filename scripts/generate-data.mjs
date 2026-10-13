// Generates the synthetic scenario files in src/data/scenarios/.
// Deterministic (seeded), so re-running produces identical JSON.
// Usage: npm run data
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { addV2 } from "./v2-fixtures.mjs";

const DATA = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "data");
const OUT = join(DATA, "scenarios");
const FALLBACK = join(DATA, "fallback");
mkdirSync(OUT, { recursive: true });
mkdirSync(FALLBACK, { recursive: true });

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normal(r) {
  const u = Math.max(r(), 1e-9);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
}
const lognormal = (r, median, sigma) => median * Math.exp(sigma * normal(r));
const round10 = (x) => Math.max(99, Math.round(x / 10) * 10);
const hex = (r, n = 8) => Array.from({ length: n }, () => Math.floor(r() * 16).toString(16)).join("");

// Shape of a day (IST): quiet nights, evening peak. Normalised to mean 1.
const RAW_DIURNAL = [0.25, 0.15, 0.1, 0.08, 0.08, 0.12, 0.3, 0.55, 0.8, 1.0, 1.15, 1.25, 1.3, 1.25, 1.2, 1.2, 1.3, 1.45, 1.6, 1.8, 1.95, 1.85, 1.4, 0.75];
const DIURNAL = RAW_DIURNAL.map((v) => (v * 24) / RAW_DIURNAL.reduce((a, b) => a + b, 0));

const SPIKE_START = 72; // hour index; 72h baseline + 24h spike
const HOURS = 96;
const START_HOUR_OF_DAY = 10; // hour 0 = 10:00 IST, so the spike begins 10:00 on 18 Oct
const START_ISO = "2026-10-15T10:00:00+05:30";

function poisson(r, lambda) {
  if (lambda > 40) return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * normal(r)));
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= r();
  } while (p > L);
  return k - 1;
}

function build(cfg) {
  const r = rng(cfg.seed);
  const orders = [];
  const hourly = [];
  const returningPool = Array.from({ length: 60 }, () => ({ card: "card_" + hex(r), device: "dev_" + hex(r, 6) }));
  let seq = 1000;

  for (let h = 0; h < HOURS; h++) {
    const hod = (h + START_HOUR_OF_DAY) % 24;
    const inSpike = h >= SPIKE_START;
    const ramp = inSpike ? Math.min(1, 0.8 + 0.1 * (h - SPIKE_START)) : 1;
    const lambda = cfg.basePerHour * DIURNAL[hod] * (inSpike ? cfg.spikeMultiple * ramp : 1);
    const n = poisson(r, lambda);
    let gmv = 0;
    for (let i = 0; i < n; i++) {
      const phase = inSpike ? cfg.spike : cfg.baseline;
      const isNew = r() < phase.newShare;
      const who = isNew ? { card: "card_" + hex(r), device: "dev_" + hex(r, 6) } : returningPool[Math.floor(r() * returningPool.length)];
      const amount = round10(lognormal(r, phase.median, phase.sigma));
      let coupon = null;
      if (phase.couponShare && r() < phase.couponShare) coupon = phase.coupon;
      orders.push({ id: cfg.prefix + seq++, hour: h, amount, is_new_customer: isNew, coupon, card_fp: who.card, device_fp: who.device });
      gmv += amount;
    }
    hourly.push({ hour: h, orders: n, gmv });
  }

  // Scenario C: inject a separate high-value cluster into the spike window.
  if (cfg.cluster) {
    const c = cfg.cluster;
    const cards = Array.from({ length: c.cards }, () => "card_" + hex(r));
    const devices = Array.from({ length: c.devices }, () => "dev_" + hex(r, 6));
    for (let i = 0; i < c.count; i++) {
      const h = SPIKE_START + 2 + Math.floor(r() * 21);
      const concentrated = i < Math.round(c.count * c.concentratedShare);
      const amount = Math.round((c.min + r() * (c.max - c.min)) / 10) * 10;
      orders.push({
        id: cfg.prefix + seq++,
        hour: h,
        amount,
        is_new_customer: true,
        coupon: null,
        card_fp: concentrated ? cards[i % cards.length] : "card_" + hex(r),
        device_fp: concentrated ? devices[i % devices.length] : "dev_" + hex(r, 6),
      });
      hourly[h].orders += 1;
      hourly[h].gmv += amount;
    }
    orders.sort((a, b) => a.hour - b.hour || a.id.localeCompare(b.id));
  }

  // Baseline orders per hour-of-day: own 72h history (AA consented) or category peers.
  const baselineHourly = DIURNAL.map((d, hod) => {
    if (cfg.baselineSource === "account_aggregator") {
      const first = (hod - START_HOUR_OF_DAY + 24) % 24;
      const own = [first, first + 24, first + 48].map((h) => hourly[h].orders);
      return +((own.reduce((a, b) => a + b, 0) / 3) * 0.5 + cfg.basePerHour * d * 0.5).toFixed(2);
    }
    return +(cfg.peerPerHour * d).toFixed(2);
  });

  // Social mentions per hour.
  const mentions = [];
  for (let h = 0; h < HOURS; h++) {
    let m = cfg.social.base;
    if (cfg.social.surgeHour !== null && h >= cfg.social.surgeHour) {
      m = cfg.social.base + cfg.social.peak * Math.min(1, (h - cfg.social.surgeHour + 1) / 4) * (0.8 + 0.2 * DIURNAL[(h + START_HOUR_OF_DAY) % 24]);
    }
    mentions.push(Math.max(0, Math.round(m + (m > 2 ? normal(r) * Math.sqrt(m) * 0.5 : r() < 0.3 ? 1 : 0))));
  }

  return {
    id: cfg.id,
    merchantId: cfg.merchantId,
    startIso: START_ISO,
    startHourOfDay: START_HOUR_OF_DAY,
    spikeStartHour: SPIKE_START,
    baseline: { source: cfg.baselineSource, label: cfg.baselineLabel, hourly: baselineHourly },
    hourly,
    orders,
    offer: cfg.offer,
    social: { mentionsPerHour: mentions, posts: cfg.social.posts },
    category: cfg.category,
    outcome: cfg.outcome,
    learning: cfg.learning,
  };
}

const scenarios = [
  {
    id: "a",
    merchantId: "kesar",
    seed: 11,
    prefix: "KC",
    basePerHour: 6,
    spikeMultiple: 4.4,
    baselineSource: "account_aggregator",
    baselineLabel: "Account Aggregator: 14 months of pre-Razorpay inflows",
    baseline: { median: 1650, sigma: 0.45, newShare: 0.45, couponShare: 0.04, coupon: "WELCOME10" },
    spike: { median: 2850, sigma: 0.4, newShare: 0.6, couponShare: 0.72, coupon: "FESTIVE25" },
    offer: {
      url: "kesarandco.example/festive",
      text: "Buy 2 festive sets, 25% off. Use code FESTIVE25.",
      code: "FESTIVE25",
      startHour: 72,
      scannedAtHour: 73,
    },
    social: {
      base: 2,
      surgeHour: 66,
      peak: 28,
      posts: [
        { id: "P1", hour: 66, platform: "Instagram", kind: "mention", text: "Reel by @styleby.anaya (412k followers): 'my Diwali lehenga haul from Kesar & Co, buy 2 get 25% off'" },
        { id: "P2", hour: 69, platform: "Instagram", kind: "mention", text: "Story reshare: 'Kesar & Co festive sets restocked, code FESTIVE25'" },
        { id: "P3", hour: 75, platform: "X", kind: "mention", text: "'Finally ordered the mustard set everyone is wearing from Kesar & Co'" },
        { id: "P4", hour: 90, platform: "Instagram", kind: "complaint", text: "'Ordered 3 days ago, dispatch is slow. Hope it arrives before Diwali'" },
      ],
    },
    category: {
      name: "Ethnic fashion",
      driver: "order_value",
      expected: "Order-value-led festive lift. Fashion sees the sharpest order value rise in the festive season; bundles push basket size up across the whole range.",
    },
    outcome: {
      status: "clean",
      headline: "Clean after 60 days",
      detail: "0.4% of orders disputed, all delivery-delay related. No chargebacks from fraud.",
      disputeRatePct: 0.4,
      highValueChargebackPct: 0,
      releaseDay: 2,
    },
    learning: {
      approve: "Coupon match rate above 60% raised trust for fashion bundle offers.",
      modify: "Analyst trimmed the release for a first festive sale; reserve sizing for new fashion merchants noted.",
    },
  },
  {
    id: "b",
    merchantId: "glow",
    seed: 1,
    prefix: "GR",
    basePerHour: 10,
    spikeMultiple: 6.0,
    peerPerHour: 10,
    baselineSource: "category_peers",
    baselineLabel: "Category peers: median of 212 beauty merchants of similar size",
    baseline: { median: 725, sigma: 0.4, newShare: 0.5 },
    spike: { median: 755, sigma: 0.4, newShare: 0.81 },
    offer: null,
    social: {
      base: 3,
      surgeHour: 70,
      peak: 55,
      posts: [
        { id: "P1", hour: 70, platform: "Instagram", kind: "mention", text: "Viral reel (2.1M views): 'this ₹799 Glow Ritual serum replaced my ₹4,000 one'" },
        { id: "P2", hour: 74, platform: "YouTube", kind: "mention", text: "Shorts review: 'Glow Ritual vitamin C serum, honest 7-day test'" },
        { id: "P3", hour: 80, platform: "X", kind: "complaint", text: "'Ordered Glow Ritual serum 4 days ago, still not shipped'" },
        { id: "P4", hour: 82, platform: "Instagram", kind: "complaint", text: "'Delivery delayed again, Glow Ritual not replying to DMs'" },
        { id: "P5", hour: 84, platform: "X", kind: "complaint", text: "'Tracking stuck at label created for 3 days'" },
        { id: "P6", hour: 86, platform: "Instagram", kind: "complaint", text: "'Where is my order? Delivery date keeps moving'" },
        { id: "P7", hour: 88, platform: "X", kind: "complaint", text: "'Glow Ritual delivery delay, anyone else?'" },
        { id: "P8", hour: 91, platform: "Instagram", kind: "complaint", text: "'Delayed delivery, but support says it ships tomorrow'" },
        { id: "P9", hour: 94, platform: "X", kind: "complaint", text: "'Serum still not delivered, ordered for my sister's gift'" },
      ],
    },
    category: {
      name: "Beauty",
      driver: "order_count",
      expected: "Order-count-led festive lift. Beauty grows through purchase frequency and new buyers; order value usually stays flat.",
    },
    outcome: {
      status: "clean_after_evidence",
      headline: "Clean after evidence provided",
      detail: "Merchant shared delivery confirmations and dispatch capacity in one round. Released on day 3. 0.9% disputes, all delivery delays.",
      disputeRatePct: 0.9,
      highValueChargebackPct: 0,
      releaseDay: 3,
    },
    learning: {
      approve: "Viral reel leading volume by 2h confirmed demand; delivery-complaint count now weighted as a capacity signal, not a fraud signal, for beauty.",
      modify: "Analyst adjusted the request scope; delivery proof for high-value orders kept as the deciding evidence for beauty spikes.",
    },
  },
  {
    id: "c",
    merchantId: "urbannest",
    seed: 25,
    prefix: "UN",
    basePerHour: 5,
    spikeMultiple: 7.2,
    peerPerHour: 5,
    baselineSource: "category_peers",
    baselineLabel: "Category peers: median of 97 home decor merchants of similar size",
    baseline: { median: 2400, sigma: 0.5, newShare: 0.7 },
    spike: { median: 2450, sigma: 0.5, newShare: 0.965, couponShare: 0.04, coupon: "DIWALI10" },
    cluster: { count: 140, min: 38000, max: 45000, cards: 9, devices: 3, concentratedShare: 0.6 },
    offer: {
      url: "urbannestdecor.example/sale",
      text: "Diwali sale: 10% off sitewide with code DIWALI10.",
      code: "DIWALI10",
      startHour: 48,
      scannedAtHour: 73,
    },
    social: {
      base: 0.3,
      surgeHour: null,
      peak: 0,
      posts: [
        { id: "P1", hour: 86, platform: "X", kind: "complaint", text: "'Paid ₹41,000 to UrbanNest Decor for a sofa set, never received, no tracking'" },
        { id: "P2", hour: 93, platform: "Facebook", kind: "complaint", text: "'UrbanNest never received my order, number switched off'" },
      ],
    },
    category: {
      name: "Home decor",
      driver: "order_value",
      expected: "Order-value-led with the steepest festive order value swing. Expect the whole range to shift up, not an isolated block of large orders.",
    },
    outcome: {
      status: "fraud",
      headline: "Fraud confirmed",
      detail: "31% of the high-value orders were charged back within 60 days. Merchant unreachable after day 9.",
      disputeRatePct: 5.2,
      highValueChargebackPct: 31,
      releaseDay: null,
    },
    learning: {
      approve: "A separate high-value cluster with concentrated cards and devices held its weight as a strong unexplained signal for home decor.",
      modify: "Analyst kept the hold; card and device concentration in high-value clusters reinforced.",
    },
  },
];

for (const cfg of scenarios) {
  if (process.env["SEED_" + cfg.id]) cfg.seed = Number(process.env["SEED_" + cfg.id]);
  const s = addV2(build(cfg));
  const { read_reply_fallback, ...scenario } = s;
  writeFileSync(join(OUT, `${cfg.id}.json`), JSON.stringify(scenario));
  writeFileSync(join(FALLBACK, `read-reply-${cfg.id}.json`), JSON.stringify(read_reply_fallback, null, 2) + "\n");
  const spike = s.hourly.slice(SPIKE_START).reduce((a, h) => a + h.orders, 0);
  const base = s.baseline.hourly.reduce((a, b) => a + b, 0);
  console.log(cfg.id, "orders", s.orders.length, "spike/base", (spike / base).toFixed(2), "patterns", s.patterns.map((p) => `${p.id}:${p.order_ids.length}:${p.value}`).join(","));
}
