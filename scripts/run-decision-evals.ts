// Decision evals for the Hold Resolver: npm run evals:decisions
// One eval per decision the system makes. Code graders read the same shared modules the app
// uses (src/shared/screen.ts, reserve.ts, consent.ts, checks.ts). Writes
// src/data/evals/decisions.json for the scorecard, plus the question sheets in evals/judge/.
//
// Honesty rules for this file:
// - Thresholds in screen.ts were set on the development seed (DEV_SEED). Reported numbers use
//   TEST_SEED, which was not looked at while setting them.
// - All cases are synthetic and written by the same team that wrote the screen. They test the
//   logic against stated archetypes; they do not estimate real-world fraud rates.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { generateSales, type LabelledCase } from "./eval-data/sales";
import { fixedRuleHolds, FIXED_RULE_MULTIPLE, screenSale, type SaleCase } from "../src/shared/screen";
import { DISCOUNT, DISCOUNT_CEILING, discount, reserve, reserveFloor, settle, trustLevel, capRevision } from "../src/shared/reserve";
import { applyConsent } from "../src/shared/consent";
import { computeFeatures } from "../src/lib/features";
import { runChecks } from "../src/shared/checks";
import { parseExtraction } from "../src/shared/extraction";
import { basicParse } from "../src/shared/basicParser";
import { PRESETS } from "../src/lib/foolPresets";
import type { Merchant, Scenario, TriggerFlag, TrustLevel } from "../src/lib/types";
import a from "../src/data/scenarios/a.json";
import b from "../src/data/scenarios/b.json";
import c from "../src/data/scenarios/c.json";
import merchants from "../src/data/merchants.json";
import ra from "../src/data/fallback/read-reply-a.json";
import rc from "../src/data/fallback/read-reply-c.json";

export const DEV_SEED = 101;
export const TEST_SEED = 202;
const N = 400;
const seedArg = process.argv.includes("--dev") ? DEV_SEED : TEST_SEED;
const cases = generateSales(seedArg, N);
const results = cases.map((k) => ({ k, r: screenSale(k.case) }));
const sum = (xs: number[]) => xs.reduce((x, y) => x + y, 0);
const pct = (x: number, n: number) => (n ? x / n : 0);

// ---------------------------------------------------------------- 1. Spike vs risk
const good = results.filter((x) => !x.k.risky);
const risky = results.filter((x) => x.k.risky);
const archetypes = [...new Set(cases.map((k) => k.archetype))];
const eval1 = {
  cases: cases.length,
  good: good.length,
  risky: risky.length,
  // "Held" means any money waits beyond the normal settlement: a question or a hold.
  screen: {
    good_wrongly_held: good.filter((x) => x.r.decision !== "settle").length,
    good_wrongly_held_full_hold: good.filter((x) => x.r.decision === "hold").length,
    good_value_held: sum(good.map((x) => x.r.at_risk_value)),
    risky_missed: risky.filter((x) => x.r.decision === "settle").length,
  },
  fixed_rule: {
    label: `Hold the whole day if volume exceeds ${FIXED_RULE_MULTIPLE}× the 30-day average`,
    good_wrongly_held: good.filter((x) => fixedRuleHolds(x.k.case)).length,
    good_value_held: sum(good.filter((x) => fixedRuleHolds(x.k.case)).map((x) => x.k.case.signals.razorpay.spike_value)),
    risky_missed: risky.filter((x) => !fixedRuleHolds(x.k.case)).length,
  },
  by_archetype: archetypes.map((arch) => {
    const xs = results.filter((x) => x.k.archetype === arch);
    return {
      archetype: arch,
      risky: xs[0].k.risky,
      cases: xs.length,
      settle: xs.filter((x) => x.r.decision === "settle").length,
      ask: xs.filter((x) => x.r.decision === "ask").length,
      hold: xs.filter((x) => x.r.decision === "hold").length,
      rule_holds: xs.filter((x) => fixedRuleHolds(x.k.case)).length,
    };
  }),
  missed_ids: risky.filter((x) => x.r.decision === "settle").map((x) => `${x.k.id} ${x.k.archetype}`),
};
const e1pass = eval1.screen.good_wrongly_held < eval1.fixed_rule.good_wrongly_held && eval1.screen.risky_missed <= eval1.fixed_rule.risky_missed;

// ---------------------------------------------------------------- 2. Reserve sizing
const short = risky.filter((x) => x.r.reserve < x.k.exposure);
const goodSpike = sum(good.map((x) => x.k.case.signals.razorpay.spike_value));
const eval2 = {
  risky_cases: risky.length,
  covered: risky.length - short.length,
  shortfall_cases: short.map((x) => ({ id: x.k.id, archetype: x.k.archetype, decision: x.r.decision, reserve: x.r.reserve, exposure: x.k.exposure, gap: x.k.exposure - x.r.reserve })),
  total_exposure: sum(risky.map((x) => x.k.exposure)),
  total_reserve_on_risky: sum(risky.map((x) => x.r.reserve)),
  uncovered_exposure: sum(short.map((x) => x.k.exposure - x.r.reserve)),
  clean_value_settled_on_time: pct(goodSpike - sum(good.map((x) => x.r.at_risk_value)), goodSpike),
  clean_value_reserved: sum(good.map((x) => x.r.reserve)),
};
const e2pass = short.length === 0;

// ---------------------------------------------------------------- 3. Question quality (code part)
const ACCUSATORY = /\b(fraud|fraudulent|suspicious|suspect|stolen|scam|fake|illegal|chargeback|risk|risky|flagged|blocked|laundering|abuse|lying)\b/i;
const PII = [
  { name: "phone number", re: /(?:\+91[\s-]?)?\b[6-9]\d{9}\b/ },
  { name: "email", re: /[\w.+-]+@[\w-]+\.[\w.]+/ },
  { name: "card number", re: /\b(?:\d[ -]?){12,19}\b/ },
  { name: "card fingerprint or device id", re: /\b(fp|dev|card)_[a-z0-9]{4,}\b/i },
  { name: "GSTIN", re: /\b\d{2}[A-Z]{5}\d{4}[A-Z]\d[A-Z][A-Z0-9]\b/ },
  { name: "PIN code or address", re: /\b\d{6}\b|\b(flat|floor|road|nagar|street)\b/i },
  { name: "personal name marker", re: /\b(mr|mrs|ms|shri|smt)\.?\s+[A-Z]/ },
];
const appQuestions = (Object.values({ a, b, c }) as unknown as Scenario[]).flatMap((s) =>
  s.patterns.flatMap((p) => [
    { source: `app scenario ${s.id.toUpperCase()}`, text: p.question_for_merchant },
    ...(p.follow_up_question ? [{ source: `app scenario ${s.id.toUpperCase()} follow-up`, text: p.follow_up_question.replace("{unmatched}", "₹84,000") }] : []),
  ]),
);
const screenQuestions = results.filter((x) => x.r.question).map((x) => ({ source: `${x.k.id} ${x.k.archetype}`, text: x.r.question! }));
// Templates repeat, so the judge and the human see each distinct wording once.
const distinct = new Map<string, { text: string; sources: string[] }>();
for (const q of [...appQuestions, ...screenQuestions]) {
  const key = q.text.replace(/₹[\d.,]+( lakh)?/g, "₹X").replace(/\b\d+(\.\d+)?×/g, "N×").replace(/\b\d+ orders\b/g, "N orders");
  const d = distinct.get(key) ?? { text: q.text, sources: [] };
  d.sources.push(q.source);
  distinct.set(key, d);
}
const qRows = [...distinct.entries()].map(([template, d], i) => {
  const words = d.text.split(/\s+/).filter(Boolean).length;
  const pii = PII.filter((x) => x.re.test(d.text)).map((x) => x.name);
  const checks = {
    short: words <= 30,
    one_question: (d.text.match(/\?/g) ?? []).length === 1,
    non_accusatory_words: !ACCUSATORY.test(d.text),
    no_personal_data_patterns: pii.length === 0,
  };
  return { id: `q${String(i + 1).padStart(2, "0")}`, template, example: d.text, uses: d.sources.length, sources: d.sources.slice(0, 3), words, pii, checks, code_pass: Object.values(checks).every(Boolean) };
});
mkdirSync("evals/judge", { recursive: true });
writeFileSync("evals/judge/questions.json", JSON.stringify(qRows.map(({ id, example }) => ({ id, question: example })), null, 2) + "\n");
// Judge verdicts are written by a separate reviewer (see evals/judge/README.md); merged when present.
const judgeFile = "evals/judge/questions-judgment.json";
const judge: { judge: string; verdicts: Record<string, { pass: boolean; pattern_level: boolean; short: boolean; non_accusatory: boolean; no_personal_data: boolean; note: string }> } | null = existsSync(judgeFile) ? JSON.parse(readFileSync(judgeFile, "utf8")) : null;
// Human sheet: 20 questions weighted by how often each wording is shown, for the owner to mark.
const humanFile = "evals/judge/questions-human-review.csv";
// One example of every wording first, then the most-shown wordings again, up to 20. Sources are
// case ids only, so the reviewer does not see whether a case was written as genuine or risky.
const shown = [...appQuestions, ...screenQuestions];
const sample = [...qRows.map((q) => shown.find((x) => x.text === q.example)!), ...shown.filter((x) => !qRows.some((q) => q.example === x.text)).filter((_, i) => i % 9 === 0)]
  .slice(0, 20)
  .map((q) => ({ ...q, source: q.source.split(" ")[0] === "app" ? q.source : q.source.split(" ")[0] }));
if (!existsSync(humanFile)) {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  writeFileSync(humanFile, ["n,source,question,pass (y/n),note", ...sample.map((q, i) => [i + 1, esc(q.source), esc(q.text), "", ""].join(","))].join("\n") + "\n");
}
const human = readFileSync(humanFile, "utf8")
  .trim()
  .split("\n")
  .slice(1)
  .map((line) => line.match(/("([^"]|"")*"|[^,]*)(,|$)/g)!.map((x) => x.replace(/,$/, "").replace(/^"|"$/g, "").replace(/""/g, '"')))
  .filter((cols) => /^[yn]$/i.test(cols[3]?.trim() ?? ""));
const judged = qRows.filter((q) => judge?.verdicts[q.id]);
const eval3 = {
  distinct_questions: qRows.length,
  questions_shown: appQuestions.length + screenQuestions.length,
  code_pass: qRows.filter((q) => q.code_pass).length,
  judge: judge ? { name: judge.judge, judged: judged.length, pass: judged.filter((q) => judge.verdicts[q.id].pass).length } : null,
  // Pass rate weighted by how often each wording is actually shown.
  judge_pass_rate_weighted: judge && judged.length ? sum(judged.filter((q) => judge.verdicts[q.id].pass).map((q) => q.uses)) / sum(judged.map((q) => q.uses)) : null,
  // First judge pass, before two templates it failed were reworded. Kept so the fix is visible.
  judge_round1: existsSync("evals/judge/questions-judgment-round1.json")
    ? (() => {
        const r1 = JSON.parse(readFileSync("evals/judge/questions-judgment-round1.json", "utf8")).verdicts as Record<string, { pass: boolean; note: string }>;
        const failed = Object.entries(r1).filter(([, v]) => !v.pass);
        return { pass: Object.keys(r1).length - failed.length, judged: Object.keys(r1).length, failed: failed.map(([id, v]) => ({ id, note: v.note })) };
      })()
    : null,
  human: { sheet: humanFile, marked: human.length, pass: human.filter((cols) => /^y$/i.test(cols[3].trim())).length },
  rows: qRows.map((q) => ({ ...q, judge: judge?.verdicts[q.id] ?? null })),
};
const e3pass = eval3.judge_pass_rate_weighted !== null && eval3.judge_pass_rate_weighted >= 0.9 && eval3.code_pass === qRows.length;

// ---------------------------------------------------------------- 4. Answer reading + "Try to fool it"
type ReadRow = { id: string; category: string; twin_id: string | null; release: number; expected_release: number; wrong_release: boolean; extracted: Record<string, { value: unknown }> | null; injection_flagged: boolean };
function readingRun(file: string) {
  if (!existsSync(file)) return null;
  const { summary, rows } = JSON.parse(readFileSync(file, "utf8")) as { summary: { extractor: string; field_accuracy: number }; rows: ReadRow[] };
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  const adversarial = rows.filter((r) => ["borrowed_company", "invalid_gstin", "name_mismatch", "injection", "missing_ambiguous"].includes(r.category));
  const inj = rows.filter((r) => r.category === "injection" && r.twin_id);
  const fields = ["buyer_name", "gstin", "invoice_total", "quantity_total"];
  // Extraction fooled: the reader's values moved because of the injected text.
  const extractionFooled = inj.filter((r) => fields.some((f) => JSON.stringify(r.extracted?.[f]?.value) !== JSON.stringify(byId[r.twin_id!].extracted?.[f]?.value)));
  const moneyByText = sum(inj.map((r) => Math.max(0, r.release - byId[r.twin_id!].release)));
  return {
    extractor: summary.extractor,
    adversarial_cases: adversarial.length,
    fooled_into_release: adversarial.filter((r) => r.release > r.expected_release).length,
    injection_cases: inj.length,
    extraction_moved_by_injection: extractionFooled.map((r) => r.id),
    injection_flagged: inj.filter((r) => r.injection_flagged).length,
    money_released_by_text_inr: moneyByText,
    field_accuracy: summary.field_accuracy,
  };
}
// Every "Try to fool it" preset and pair of presets on scenarios A and C.
const fool = { attempts: 0, released_above_first_inr: 0, raw_above_first_before_cap: 0 };
for (const [S, r] of [[a, ra], [c, rc]] as unknown as [Scenario, unknown][]) {
  const p = S.patterns[0];
  const first = parseExtraction(r);
  const fr = runChecks(S, p.id, first);
  const firstRelease = settle(p, trustLevel(S.history), fr.matchedValue, fr.checks).release;
  const ctx = { original: S.invoice_fixture!.text_transcript, gstin: S.registry_fixture.gstin, buyer: first.buyer_name.value, total: first.invoice_total.value, patternValue: p.value };
  const presets = PRESETS.filter((x) => x.id !== "reset");
  const combos = [...presets.map((x) => [x]), ...presets.flatMap((x) => presets.filter((y) => y !== x).map((y) => [x, y]))];
  for (const combo of combos) {
    const x = basicParse(combo.reduce((t, pr) => pr.apply(t, ctx), ctx.original));
    const run = runChecks(S, p.id, x);
    const raw = settle(p, trustLevel(S.history), run.matchedValue, run.checks).release;
    fool.attempts++;
    if (raw > firstRelease) fool.raw_above_first_before_cap++;
    fool.released_above_first_inr += Math.max(0, capRevision(raw, firstRelease) - firstRelease);
  }
}
const eval4 = {
  runs: [readingRun("src/data/evals/results-session.json"), readingRun("src/data/evals/results-basic.json"), readingRun("src/data/evals/results.json")].filter(Boolean),
  fool_presets: fool,
};
const e4pass = eval4.runs.every((r) => r!.money_released_by_text_inr === 0 && r!.fooled_into_release === 0) && fool.released_above_first_inr === 0;

// ---------------------------------------------------------------- 5. Hard guardrails
const g = { ceiling: { checked: 0, failed: [] as string[] }, review: { checked: 0, failed: [] as string[] }, consent: { checked: 0, failed: [] as string[] }, app_consent: { checked: 0, failed: [] as string[] } };
// 5a. Reserve reduction never beyond the ceiling, never below the floor, never above the value.
const LEVELS: TrustLevel[] = ["New", "Building", "Trusted"];
const FLAGSETS: TriggerFlag[][] = [[], ["new_regions"], ["new_card_device_cluster", "order_value_outside_history"]];
for (const k of cases) {
  for (const lvl of LEVELS)
    for (const fl of FLAGSETS) {
      const v = k.case.signals.razorpay.spike_value;
      const d = discount(lvl, fl);
      const res = reserve(v, d);
      g.ceiling.checked++;
      if (d > DISCOUNT_CEILING || (fl.length && d !== 0) || res < reserveFloor(v) || res > v || res < Math.round(v * (1 - DISCOUNT_CEILING))) g.ceiling.failed.push(`${k.id} ${lvl} [${fl}]`);
    }
}
// Fuzz: any value and any discount table entry.
for (let i = 1; i <= 5000; i++) {
  const v = (i * 7919) % 5_000_000;
  for (const lvl of LEVELS) {
    const res = reserve(v, discount(lvl, []));
    g.ceiling.checked++;
    if (DISCOUNT[lvl] > DISCOUNT_CEILING || res < reserveFloor(v) || res > v) g.ceiling.failed.push(`fuzz ${v} ${lvl}`);
  }
}
// 5b. Any pattern change goes to an analyst, never settles automatically, and gets no trust discount.
for (const { k, r } of results) {
  if (!r.trigger_flags.length) continue;
  g.review.checked++;
  if (!r.requires_review || r.decision === "settle" || discount(r.trust, r.trigger_flags) !== 0) g.review.failed.push(k.id);
}
for (const S of [a, b, c] as unknown as Scenario[])
  for (const p of S.patterns) {
    if (!p.trigger_flags.length) continue;
    g.review.checked++;
    if (settle(p, "Trusted", 0, []).disc !== 0) g.review.failed.push(`app ${S.id}`);
  }
// 5c. No data use without sale-time consent: unconsented sources are never read, and scrambling
// them cannot change any decision.
const scramble = (k: SaleCase): SaleCase => ({
  ...k,
  signals: {
    ...k.signals,
    bank: k.consent.bank ? k.signals.bank : { seasonal_inflow_multiple: 999 },
    gst: k.consent.gst ? k.signals.gst : { turnover_supports_scale: !k.signals.gst?.turnover_supports_scale },
    mca: k.consent.mca ? k.signals.mca : { company_age_days: 1 },
  },
});
for (const k of cases)
  for (let mask = 0; mask < 8; mask++) {
    const kc: SaleCase = { ...k.case, consent: { bank: !!(mask & 1), gst: !!(mask & 2), mca: !!(mask & 4) } };
    const r1 = screenSale(kc);
    const r2 = screenSale(scramble(kc));
    g.consent.checked++;
    const illegal = r1.read.filter((s) => (s === "bank" || s === "gst" || s === "mca") && !kc.consent[s]);
    if (illegal.length || JSON.stringify({ ...r1, read: 0 }) !== JSON.stringify({ ...r2, read: 0 })) g.consent.failed.push(`${k.id} mask ${mask}`);
  }
// The app: withdrawing bank history removes the Account Aggregator baseline from features.
for (const S of [a, b, c] as unknown as Scenario[]) {
  const m = (merchants as unknown as Record<string, Merchant>)[S.merchantId];
  const withdrawn = { sources: m.sources.map((x) => (x.id === "bank" ? { ...x, status: "withdrawn" as const } : x)) };
  const poisoned: Scenario = { ...S, baseline: { ...S.baseline, hourly: S.baseline.hourly.map((x) => x * 50) } };
  g.app_consent.checked++;
  const f1 = computeFeatures(applyConsent(S, withdrawn));
  const f2 = computeFeatures(applyConsent(poisoned, withdrawn));
  const usesBank = S.baseline.source === "account_aggregator";
  if (usesBank && JSON.stringify(f1) !== JSON.stringify(f2)) g.app_consent.failed.push(`app ${S.id}: features changed with withdrawn bank data`);
}
const eval5 = g;
const e5pass = Object.values(g).every((x) => x.failed.length === 0);

// ---------------------------------------------------------------- 6. Learning loop
// One fictional merchant across seven sales. Expected levels were worked out by hand from the
// trust rules (500/5,000 orders, 30/90 days, disputes under 0.5%) before running the code.
const replay = [
  { sale: "Republic Day", days: 25, delivered: 200, disputes: 0.2, pattern_change: false, expect: { level: "New", discount: 0, review: false } },
  { sale: "Holi", days: 45, delivered: 600, disputes: 0.2, pattern_change: false, expect: { level: "Building", discount: 0.25, review: false } },
  { sale: "Summer", days: 80, delivered: 2100, disputes: 0.3, pattern_change: false, expect: { level: "Building", discount: 0.25, review: false } },
  { sale: "Monsoon", days: 100, delivered: 5600, disputes: 0.3, pattern_change: false, expect: { level: "Trusted", discount: 0.5, review: false } },
  { sale: "Independence Day", days: 120, delivered: 7200, disputes: 0.3, pattern_change: true, expect: { level: "Trusted", discount: 0, review: true } },
  { sale: "Navratri", days: 150, delivered: 8000, disputes: 0.8, pattern_change: false, expect: { level: "New", discount: 0, review: false } },
  { sale: "Diwali", days: 200, delivered: 12500, disputes: 0.4, pattern_change: false, expect: { level: "Trusted", discount: 0.5, review: false } },
];
const base = generateSales(DEV_SEED, 50).find((x) => x.archetype === "declared_festive")!.case;
const eval6 = replay.map((s) => {
  const rp = base.signals.razorpay;
  const sc: SaleCase = {
    ...base,
    signals: {
      ...base.signals,
      razorpay: {
        ...rp,
        days_on_razorpay: s.days,
        clean_delivered_orders: s.delivered,
        dispute_rate_pct: s.disputes,
        // The pattern change: a sudden share of foreign cards this sale.
        cross_border_share: s.pattern_change ? rp.cross_border_share_baseline + 0.4 : rp.cross_border_share,
        segments: s.pattern_change ? [{ kind: "cross_border", orders: 120, value: 480000 }] : rp.segments,
      },
    },
  };
  const r = screenSale(sc);
  const got = { level: r.trust, discount: discount(r.trust, r.trigger_flags), review: r.requires_review };
  return { ...s, got, pass: got.level === s.expect.level && got.discount === s.expect.discount && got.review === s.expect.review };
});
const e6pass = eval6.every((x) => x.pass);

// ---------------------------------------------------------------- write
const out = {
  run_at: new Date().toISOString(),
  seed: seedArg,
  seed_role: seedArg === TEST_SEED ? "test (thresholds frozen before this seed was scored)" : "development (used to set thresholds)",
  scope: "Synthetic cases written by the prototype team. They test the decision logic against stated archetypes; they are not an estimate of real fraud rates.",
  evals: [
    { n: 1, name: "Spike vs risk", grader: "Code", bar: "Beats the fixed rule on false holds without missing more risk", pass: e1pass, result: eval1 },
    { n: 2, name: "Reserve sizing", grader: "Code", bar: "Reserve at or above expected exposure on every risky case", pass: e2pass, result: eval2 },
    { n: 3, name: "Question quality", grader: "Code checks + LLM judge + 20 checked by you", bar: "90% pass on rubric", pass: e3pass, result: eval3 },
    { n: 4, name: "Answer reading + Try to fool it", grader: "Code", bar: "Fooled rate reported, zero money moved by text", pass: e4pass, result: eval4 },
    { n: 5, name: "Hard guardrails", grader: "Code", bar: "100%, no exceptions", pass: e5pass, result: eval5 },
    { n: 6, name: "Learning loop", grader: "Code", bar: "Ramp and reset at the right sale", pass: e6pass, result: eval6 },
  ],
};
if (seedArg === TEST_SEED) {
  mkdirSync("src/data/evals", { recursive: true });
  writeFileSync("src/data/evals/decisions.json", JSON.stringify(out, null, 2) + "\n");
}

const yes = (b: boolean) => (b ? "PASS" : "FAIL");
console.log(`\nDecision evals · seed ${seedArg} (${out.seed_role}) · ${cases.length} sale cases`);
console.log(`1 Spike vs risk      ${yes(e1pass)}  screen: ${eval1.screen.good_wrongly_held}/${good.length} good held (${eval1.screen.good_wrongly_held_full_hold} full holds), ${eval1.screen.risky_missed}/${risky.length} risky missed · rule: ${eval1.fixed_rule.good_wrongly_held} held, ${eval1.fixed_rule.risky_missed} missed`);
console.log(`2 Reserve sizing     ${yes(e2pass)}  ${eval2.covered}/${eval2.risky_cases} risky covered · uncovered ₹${eval2.uncovered_exposure.toLocaleString("en-IN")} · clean value on time ${Math.round(eval2.clean_value_settled_on_time * 100)}%`);
console.log(`3 Question quality   ${yes(e3pass)}  ${eval3.distinct_questions} distinct wordings, code checks ${eval3.code_pass}/${eval3.distinct_questions}, judge ${eval3.judge ? `${eval3.judge.pass}/${eval3.judge.judged} (weighted ${(eval3.judge_pass_rate_weighted! * 100).toFixed(1)}%)` : "not run"}, human ${eval3.human.pass}/${eval3.human.marked} marked`);
for (const r of eval4.runs) console.log(`4 Answer reading     ${yes(e4pass)}  ${r!.extractor}: fooled into release ${r!.fooled_into_release}/${r!.adversarial_cases}, extraction moved by injection ${r!.extraction_moved_by_injection.length}/${r!.injection_cases}, money moved by text ₹${r!.money_released_by_text_inr}`);
console.log(`                         fool presets: ${fool.attempts} attempts, ₹${fool.released_above_first_inr} released above first answer`);
console.log(`5 Hard guardrails    ${yes(e5pass)}  ${Object.entries(g).map(([k, v]) => `${k} ${v.checked - v.failed.length}/${v.checked}`).join(" · ")}`);
console.log(`6 Learning loop      ${yes(e6pass)}  ${eval6.map((x) => `${x.sale}:${x.got.level}/${x.got.discount * 100}%${x.got.review ? "/review" : ""}${x.pass ? "" : " ✗"}`).join("  ")}`);
if (eval1.missed_ids.length) console.log(`  missed: ${eval1.missed_ids.join(", ")}`);
