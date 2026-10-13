// Six decision evals (npm run evals:decisions). Reads the saved file; nothing runs in the browser.
import { useState, type ReactNode } from "react";
import decisions from "../data/evals/decisions.json";
import { Chip } from "../components/ui";
import { lakh } from "../shared/format";

/* eslint-disable @typescript-eslint/no-explicit-any */
const D = decisions as any;
const E = Object.fromEntries(D.evals.map((e: any) => [e.n, e])) as Record<number, any>;
const pct = (x: number | null) => (x === null ? "n/a" : `${Math.round(x * 1000) / 10}%`);

const ARCH: Record<string, string> = {
  declared_festive: "Declared festive sale",
  undeclared_viral: "Undeclared viral spike",
  genuine_bulk_order: "Genuine bulk order",
  established_seasonal: "Established, seasonal",
  quiet_growth: "Quiet growth",
  bust_out: "Bust-out",
  slow_bust_out: "Slow bust-out (under 3×)",
  refund_abuse: "Refund abuse",
  cross_border_burst: "Cross-border card burst",
};

function Big({ value, label, tone }: { value: string; label: string; tone?: "good" | "bad" }) {
  return (
    <div>
      <div className={`font-display text-[22px] font-semibold leading-none ${tone === "good" ? "text-positive" : tone === "bad" ? "text-danger" : "text-ink"}`}>{value}</div>
      <div className="mt-1 text-[12px] text-ink-muted">{label}</div>
    </div>
  );
}

function EvalCard({ n, children, detail }: { n: number; children: ReactNode; detail?: ReactNode }) {
  const e = E[n];
  const [open, setOpen] = useState(false);
  return (
    <section className="flex flex-col rounded-2xl bg-white p-4 shadow-card">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[12px] text-ink-muted">
            Eval {n} · {e.grader}
          </div>
          <h3 className="font-display text-[16px] font-semibold">{e.name}</h3>
        </div>
        <Chip tone={e.pass ? "positive" : "danger"}>{e.pass ? "Pass" : "Fail"}</Chip>
      </div>
      <div className="mt-3 flex-1">{children}</div>
      <div className="mt-3 border-t border-line/60 pt-2 text-[12px] text-ink-muted">
        Bar: {e.bar}
        {detail && (
          <button className="ml-2 font-semibold text-brand-dark" onClick={() => setOpen(!open)}>
            {open ? "Hide detail" : "Detail"}
          </button>
        )}
      </div>
      {open && detail && <div className="mt-2 max-h-[260px] overflow-y-auto text-[12px]">{detail}</div>}
    </section>
  );
}

export default function DecisionEvals() {
  const e1 = E[1].result;
  const e2 = E[2].result;
  const e3 = E[3].result;
  const e4 = E[4].result;
  const e5 = E[5].result;
  const e6 = E[6].result as any[];
  const runDate = new Date(D.run_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  const passed = D.evals.filter((e: any) => e.pass).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-display text-[15px] font-semibold">Decision evals</h2>
        <Chip tone={passed === 6 ? "positive" : "warn"}>{passed} of 6 pass</Chip>
        <span className="text-[12px] text-ink-muted">
          Seed {D.seed}, {D.seed_role} · {e1.cases} synthetic sales · run {runDate}
        </span>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <EvalCard
          n={1}
          detail={
            <table className="w-full">
              <thead>
                <tr className="text-left text-ink-muted">
                  <th className="font-medium">Archetype</th>
                  <th className="text-right font-medium">Settle</th>
                  <th className="text-right font-medium">Ask</th>
                  <th className="text-right font-medium">Hold</th>
                  <th className="text-right font-medium">Rule holds</th>
                </tr>
              </thead>
              <tbody>
                {e1.by_archetype.map((r: any) => (
                  <tr key={r.archetype} className="border-t border-line/50">
                    <td className="py-1">
                      {ARCH[r.archetype] ?? r.archetype} {r.risky && <span className="text-danger">· risky</span>}
                    </td>
                    <td className="text-right">{r.settle}</td>
                    <td className="text-right">{r.ask}</td>
                    <td className="text-right">{r.hold}</td>
                    <td className="text-right">{r.rule_holds}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          }
        >
          <div className="grid grid-cols-2 gap-3">
            <Big value={`${e1.screen.good_wrongly_held} / ${e1.good}`} label={`good merchants held (rule: ${e1.fixed_rule.good_wrongly_held})`} tone="good" />
            <Big value={`${e1.screen.risky_missed} / ${e1.risky}`} label={`risky ones missed (rule: ${e1.fixed_rule.risky_missed})`} tone={e1.screen.risky_missed ? undefined : "good"} />
          </div>
          <p className="mt-2 text-[12px] text-ink-body">
            Of the good merchants held, {e1.screen.good_wrongly_held - e1.screen.good_wrongly_held_full_hold} got one question about a group of orders, while the rest of the day settled; {e1.screen.good_wrongly_held_full_hold} were fully held. Good merchants' money held: {lakh(e1.screen.good_value_held)} vs {lakh(e1.fixed_rule.good_value_held)} under the rule.
            {e1.missed_ids.length > 0 && ` Missed: ${e1.missed_ids.join(", ")}.`}
          </p>
        </EvalCard>

        <EvalCard
          n={2}
          detail={
            <ul className="space-y-1">
              {e2.shortfall_cases.map((x: any) => (
                <li key={x.id}>
                  <b className="font-mono">{x.id}</b> {ARCH[x.archetype]} · {x.decision} · reserve {lakh(x.reserve)} vs exposure {lakh(x.exposure)}
                </li>
              ))}
            </ul>
          }
        >
          <div className="grid grid-cols-2 gap-3">
            <Big value={`${e2.covered} / ${e2.risky_cases}`} label="risky cases fully covered" tone={e2.covered === e2.risky_cases ? "good" : "bad"} />
            <Big value={pct(e2.clean_value_settled_on_time)} label="of clean sales' money settled on time" />
          </div>
          <p className="mt-2 text-[12px] text-ink-body">
            Uncovered exposure {lakh(e2.uncovered_exposure)} of {lakh(e2.total_exposure)}. The gap is bust-outs that look like one bulk order: the screen asks about that group and reserves it, but losses spread beyond it.
          </p>
        </EvalCard>

        <EvalCard
          n={3}
          detail={
            <ul className="space-y-1.5">
              {e3.rows.map((q: any) => (
                <li key={q.id}>
                  <span className={q.judge && !q.judge.pass ? "text-danger" : ""}>
                    <b className="font-mono">{q.id}</b> ({q.uses}×) {q.example}
                  </span>
                  {q.judge && <div className="text-ink-muted">Judge: {q.judge.note}</div>}
                </li>
              ))}
            </ul>
          }
        >
          <div className="grid grid-cols-3 gap-3">
            <Big value={`${e3.code_pass}/${e3.distinct_questions}`} label="code checks" tone={e3.code_pass === e3.distinct_questions ? "good" : "bad"} />
            <Big value={e3.judge ? pct(e3.judge_pass_rate_weighted) : "n/a"} label={e3.judge ? `LLM judge, weighted by use (${e3.judge.pass}/${e3.judge.judged} wordings)` : "LLM judge not run"} />
            <Big value={e3.human.marked ? `${e3.human.pass}/${e3.human.marked}` : "0/20"} label="checked by you" />
          </div>
          <p className="mt-2 text-[12px] text-ink-body">
            {e3.judge_round1 && `First judge pass: ${e3.judge_round1.pass}/${e3.judge_round1.judged}; failed ${e3.judge_round1.failed.map((f: any) => f.id).join(", ")}, two templates reworded since. `}
            Questions come from templates, so there are only {e3.distinct_questions} distinct wordings. The judge is a Claude agent in this build session, not an API call. Mark the 20 in evals/judge/questions-human-review.csv.
          </p>
        </EvalCard>

        <EvalCard n={4} detail={<a href="#reading-evals" className="font-semibold text-brand-dark">See all 48 reply-reading cases below</a>}>
          <div className="grid grid-cols-2 gap-3">
            <Big value={`₹${e4.runs.reduce((a: number, r: any) => a + r.money_released_by_text_inr, 0) + e4.fool_presets.released_above_first_inr}`} label="money moved by text" tone="good" />
            <Big value={`${e4.runs[0].fooled_into_release}/${e4.runs[0].adversarial_cases}`} label={`adversarial replies that released money (${e4.runs[0].extractor.startsWith("Claude") ? "Claude" : "reader"})`} />
          </div>
          <p className="mt-2 text-[12px] text-ink-body">
            {e4.runs.map((r: any) => `${r.extractor.startsWith("Claude") ? "Claude (session)" : r.extractor.startsWith("basic") ? "Basic parser" : "Live API"}: injected text changed ${r.extraction_moved_by_injection.length}/${r.injection_cases} extractions, field accuracy ${pct(r.field_accuracy)}.`).join(" ")} {e4.fool_presets.attempts} "Try to fool it" edits released ₹{e4.fool_presets.released_above_first_inr} above the first answer.
          </p>
        </EvalCard>

        <EvalCard n={5}>
          <ul className="space-y-1.5 text-[13px]">
            {[
              ["Reserve reduction within the 50% ceiling and floor", e5.ceiling],
              ["Pattern change goes to review, no discount", e5.review],
              ["No unconsented source read or able to change a decision", e5.consent],
              ["App drops withdrawn bank history from features", e5.app_consent],
            ].map(([label, r]: any) => (
              <li key={label} className="flex justify-between gap-3">
                <span>{label}</span>
                <b className={r.failed.length ? "text-danger" : "text-positive"}>
                  {r.checked - r.failed.length}/{r.checked}
                </b>
              </li>
            ))}
          </ul>
        </EvalCard>

        <EvalCard n={6}>
          <ol className="space-y-1 text-[13px]">
            {e6.map((s) => (
              <li key={s.sale} className="flex justify-between gap-3">
                <span>
                  {s.sale}
                  {s.pattern_change && <span className="text-danger"> · pattern change</span>}
                  {s.disputes > 0.5 && <span className="text-warn"> · disputes {s.disputes}%</span>}
                </span>
                <span className={s.pass ? "" : "font-bold text-danger"}>
                  {s.got.level} · {s.got.discount * 100}% {s.got.review && "· review"}
                </span>
              </li>
            ))}
          </ol>
        </EvalCard>
      </div>
      <p className="text-[12px] text-ink-muted">{D.scope} Thresholds were set on seed 101; the numbers above are seed 202.</p>
    </div>
  );
}
