// Eval scorecard (PRD v0.3, C5). Analyst view only. Reads the saved results file;
// evals never run from the browser.
import { useState } from "react";
import results from "../data/evals/results.json";
import { Card, Chip } from "../components/ui";
import { CHECK_SHORT } from "../shared/checks";
import { inr } from "../shared/format";

const CATEGORY: Record<string, string> = {
  genuine_full: "Genuine full match",
  partial: "Partial match",
  borrowed_company: "Borrowed company",
  invalid_gstin: "Invalid GSTIN format",
  name_mismatch: "Buyer name ≠ payer",
  injection: "Injection attempts",
  hinglish_informal: "Hinglish / informal",
  missing_ambiguous: "Missing or ambiguous",
};

const pct = (x: number | null) => (x === null ? "n/a" : `${Math.round(x * 100)}%`);

interface Summary {
  run_at: string;
  extractor: string;
  model: string | null;
  cases: number;
  wrong_releases: number;
  wrong_release_ids: string[];
  false_holds: number;
  false_hold_ids: string[];
  field_accuracy: number;
  injection_resistance: number | null;
  injection_failed_ids: string[];
  latency_ms: { median: number | null; p95: number | null };
  cost_per_call_usd: number | null;
  cost_per_call_inr: number | null;
  price: { input_per_mtok_usd: number; output_per_mtok_usd: number; label: string };
  by_category: { category: string; cases: number; passed: number; wrong_releases: number; false_holds: number }[];
}
interface Row {
  id: string;
  category: string;
  twin_id: string | null;
  reply_text: string;
  expected_release: number;
  release: number;
  wrong_release: boolean;
  false_hold: boolean;
  extraction_failure: boolean;
  injection_flagged: boolean;
  failed_checks: string[];
}
const data = results as unknown as { summary: Summary; rows: Row[] };

function Tile({ label, value, sub, bad, good }: { label: string; value: string; sub?: string; bad?: boolean; good?: boolean }) {
  return (
    <div className={`rounded-md border p-3 ${bad ? "border-danger/40 bg-danger-wash" : "border-line bg-white"}`}>
      <div className="text-[11px] font-medium text-ink-muted">{label}</div>
      <div className={`font-display text-2xl font-semibold ${bad ? "text-danger" : good ? "text-positive" : "text-ink"}`}>{value}</div>
      {sub && <div className="text-[11px] text-ink-muted">{sub}</div>}
    </div>
  );
}

export default function EvalsPanel() {
  const s = data.summary;
  const rows = data.rows;
  const [open, setOpen] = useState<string | null>(null);
  const live = s.extractor === "live model";
  const runDate = new Date(s.run_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-display text-[15px] font-semibold">Reply-reading evals</h2>
        <Chip tone={live ? "positive" : "warn"}>{live ? `Live model: ${s.model}` : "Basic local parser (no API key): re-run live with npm run evals"}</Chip>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        <Tile label="Wrong releases (target 0)" value={String(s.wrong_releases)} sub={s.wrong_release_ids.length ? s.wrong_release_ids.join(", ") : "released more than expected"} bad={s.wrong_releases > 0} good={s.wrong_releases === 0} />
        <Tile
          label="Injection resistance (target 100%)"
          value={pct(s.injection_resistance)}
          sub={s.injection_failed_ids.length ? `failed: ${s.injection_failed_ids.join(", ")}` : "same release as twin, flag shown"}
          bad={s.injection_resistance !== null && s.injection_resistance < 1}
          good={s.injection_resistance === 1}
        />
        <Tile label="Field accuracy" value={pct(s.field_accuracy)} sub="buyer, GSTIN, total, quantity" />
        <Tile label="False holds" value={String(s.false_holds)} sub={s.false_hold_ids.length ? s.false_hold_ids.join(", ") : "held less than allowed"} />
        <Tile label="Median latency" value={s.latency_ms.median === null ? "n/a" : `${s.latency_ms.median} ms`} sub={`p95 ${s.latency_ms.p95 ?? "n/a"} ms`} />
        <Tile
          label="Cost per call"
          value={s.cost_per_call_usd === null ? "n/a" : `$${s.cost_per_call_usd.toFixed(4)}`}
          sub={s.cost_per_call_usd === null ? `no model calls in this run · price from evals/config.json, assumed` : `≈ ₹${s.cost_per_call_inr!.toFixed(2)} · price assumed ($${s.price.input_per_mtok_usd}/$${s.price.output_per_mtok_usd} per M tokens)`}
        />
      </div>

      <Card title="By category" right={<span className="text-[11px] text-ink-muted">click a row to see its cases</span>}>
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-line text-left text-[11px] text-ink-muted">
              <th className="py-1 font-medium">Category</th>
              <th className="py-1 text-right font-medium">Cases</th>
              <th className="py-1 text-right font-medium">Passed</th>
              <th className="py-1 text-right font-medium">Wrong releases</th>
              <th className="py-1 text-right font-medium">False holds</th>
            </tr>
          </thead>
          <tbody>
            {s.by_category.map((c) => (
              <CategoryRows key={c.category} c={c} rows={rows.filter((r) => r.category === c.category)} open={open === c.category} toggle={() => setOpen(open === c.category ? null : c.category)} />
            ))}
          </tbody>
        </table>
      </Card>

      <p className="sticky bottom-0 border-t border-line bg-surface-alt py-2 text-[11px] text-ink-muted">
        {s.cases} synthetic cases, text replies only. Run on {runDate} with {live ? s.model : "the basic local parser (no API key)"}. Production evals would use labelled past holds and shadow mode.
      </p>
    </div>
  );
}

function CategoryRows({ c, rows, open, toggle }: { c: Summary["by_category"][number]; rows: Row[]; open: boolean; toggle: () => void }) {
  return (
    <>
      <tr onClick={toggle} className="cursor-pointer border-b border-line/60 hover:bg-surface-alt">
        <td className="py-1.5 font-semibold">
          <span className="mr-1 text-ink-subtle">{open ? "▾" : "▸"}</span>
          {CATEGORY[c.category] ?? c.category}
        </td>
        <td className="py-1.5 text-right">{c.cases}</td>
        <td className="py-1.5 text-right">{c.passed}</td>
        <td className={`py-1.5 text-right ${c.wrong_releases ? "font-bold text-danger" : ""}`}>{c.wrong_releases}</td>
        <td className="py-1.5 text-right">{c.false_holds}</td>
      </tr>
      {open && (
        <tr>
          <td colSpan={5} className="bg-surface-alt p-2">
            <ul className="max-h-[260px] space-y-1.5 overflow-y-auto pr-1">
              {rows.map((r) => (
                <li key={r.id} className={`rounded-sm border bg-white p-2 ${r.wrong_release ? "border-danger" : "border-line"}`}>
                  <div className="flex flex-wrap items-center gap-2 text-[11px]">
                    <b className="font-mono">{r.id}</b>
                    {r.twin_id && <span className="text-ink-muted">twin of {r.twin_id}</span>}
                    <span>
                      expected <b>{inr(r.expected_release)}</b> · actual <b className={r.wrong_release ? "text-danger" : r.false_hold ? "text-warn" : ""}>{inr(r.release)}</b>
                    </span>
                    {r.wrong_release && <Chip tone="danger">wrong release</Chip>}
                    {r.false_hold && <Chip tone="warn">false hold</Chip>}
                    {r.injection_flagged && <Chip tone="danger">instructions ignored</Chip>}
                    {r.extraction_failure && <Chip tone="warn">extraction failure</Chip>}
                  </div>
                  <pre className="mt-1 max-h-16 overflow-y-auto whitespace-pre-wrap text-[10px] leading-snug text-ink-body">{r.reply_text}</pre>
                  {r.failed_checks.length > 0 && <div className="mt-0.5 text-[11px] text-ink-muted">Failed checks: {r.failed_checks.map((f) => CHECK_SHORT[f] ?? f).join(", ")}</div>}
                </li>
              ))}
            </ul>
          </td>
        </tr>
      )}
    </>
  );
}
