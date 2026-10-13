import { useEffect, useState } from "react";
import { useCase, type LearningEntry } from "../state/store";
import { derivePattern, type PatternView } from "../state/derive";
import { AiBadge, Button, Card, Chip, TRUST_TONE } from "../components/ui";
import { fmtDate, inr, lakh } from "../shared/format";
import { DECISION_DATE } from "../lib/scenarios";
import { readReply, urlToDataUrl } from "../lib/readReply";
import { CHECK_SHORT } from "../shared/checks";
import { ChecksList, ExtractedTable } from "./ReplyParts";
import FoolModal from "./FoolModal";
import { addDays, clampReserve, DISCOUNT, DISPUTE_WINDOW_DAYS } from "../shared/reserve";
import type { Decision, TriggerFlag } from "../lib/types";

export const OVERRIDE_REASONS = [
  "Merchant evidence received outside the reply",
  "Payer check too strict for this buyer type",
  "Match tolerance too loose",
  "Known fraud pattern for this category",
  "Other",
];

const TRIGGER_TEXT: Record<TriggerFlag, string> = {
  new_card_device_cluster: "new card clusters",
  new_regions: "new delivery regions",
  order_value_outside_history: "order values outside history",
  category_shift: "category shift",
};

export default function ReviewPanel() {
  const { scenario: s, cs, trust } = useCase();
  const [active, setActive] = useState(s.patterns[0].id);
  useEffect(() => setActive(s.patterns[0].id), [s]);
  const p = s.patterns.find((x) => x.id === active) ?? s.patterns[0];
  const v = derivePattern(s, trust, p, cs.patterns[p.id], cs.reads[p.id], cs.decisions[p.id]);

  return (
    <div className="space-y-3 xl:self-start">
      {s.patterns.length > 1 && (
        <div className="flex gap-1">
          {s.patterns.map((x) => (
            <button key={x.id} onClick={() => setActive(x.id)} className={`rounded-sm px-2 py-1 text-[12px] font-semibold ${x.id === p.id ? "bg-brand text-white" : "bg-white text-ink-body"}`}>
              {x.label}
            </button>
          ))}
        </div>
      )}
      <PatternCard v={v} />
      <ReplyVerification v={v} />
      <Recommendation v={v} />
    </div>
  );
}

function PatternCard({ v }: { v: PatternView }) {
  const { trust } = useCase();
  const p = v.pattern;
  const ps = v.state;
  const answer = { open: "Not answered yet", submitted: ps.edited ? "Answered, then edited" : "Answered in one round", not_recognised: "Merchant doesn't recognise these orders", later: "Merchant will answer later" }[ps.status];
  return (
    <Card title={`Pattern: ${p.label}`} right={<span className="font-display text-[14px] font-semibold">{inr(p.value)}</span>}>
      <p className="text-[12px] text-ink-body">{p.description_for_analyst}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Chip tone={TRUST_TONE[trust]}>
          {trust} merchant · {Math.round(DISCOUNT[trust] * 100)}% discount
        </Chip>
        {p.trigger_flags.length > 0 && (
          <Chip tone="danger" className="!whitespace-normal">
            Pattern change: reviewed as New merchant ({p.trigger_flags.map((t) => TRIGGER_TEXT[t]).join(", ")})
          </Chip>
        )}
        <Chip tone={ps.edited ? "warn" : ps.status === "submitted" ? "positive" : "neutral"}>{answer}</Chip>
      </div>
      <div className="mt-2 text-[11px] text-ink-muted">Question asked: "{p.question_for_merchant}"</div>
    </Card>
  );
}

function ReplyVerification({ v }: { v: PatternView }) {
  const { scenario: s, id, cs, dispatch } = useCase();
  const p = v.pattern;
  const ps = v.state;
  const read = cs.reads[p.id];
  const sub = ps.submission;
  const running = cs.reading === p.id;
  const [fooling, setFooling] = useState(false);

  const useSample = async () => {
    const fx = s.invoice_fixture;
    if (!fx) return;
    const fileDataUrl = fx.image_path ? await urlToDataUrl(fx.image_path) : undefined;
    dispatch({
      type: "answer",
      pattern: p.id,
      submission: { kind: p.kind === "capacity" ? "confirm" : "invoice", text: fx.text_transcript, fileDataUrl, fileName: fx.image_path?.split("/").pop(), sample: true },
    });
  };
  const run = async () => {
    if (!sub) return;
    dispatch({ type: "readStart", pattern: p.id });
    dispatch({ type: "readDone", pattern: p.id, result: await readReply(id, sub) });
  };

  return (
    <Card
      title="Reply verification"
      right={read && <span className="flex items-center gap-1.5">{<AiBadge kind={read.source} title={read.fallbackReason} />}<span className="text-[10px] text-ink-subtle">{(read.latencyMs / 1000).toFixed(1)}s</span></span>}
    >
      {ps.status === "not_recognised" ? (
        <p className="text-[12px] text-ink-body">The merchant said they don't recognise these orders. Nothing to read: the full value is held for cancellation review.</p>
      ) : !sub ? (
        <div className="text-[12px] text-ink-body">
          <p>The merchant hasn't answered yet.</p>
          {s.invoice_fixture && (
            <Button variant="secondary" className="mt-2" onClick={useSample}>
              Use sample reply (demo)
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="flex gap-3">
            {sub.fileDataUrl?.startsWith("data:image") ? (
              <a href={sub.fileDataUrl} target="_blank" rel="noreferrer" className="shrink-0">
                <img src={sub.fileDataUrl} alt="Merchant's invoice" className="h-24 w-36 rounded-sm border border-line object-cover object-top" />
              </a>
            ) : sub.fileName ? (
              <div className="grid h-24 w-36 shrink-0 place-items-center rounded-sm border border-line bg-surface-alt text-[11px] text-ink-muted">{sub.fileName}</div>
            ) : null}
            <pre className="max-h-24 flex-1 overflow-auto whitespace-pre-wrap rounded-sm bg-surface-alt p-2 text-[10px] leading-snug text-ink-body">{sub.text || "(image only)"}</pre>
          </div>
          {ps.edited && <div className="mt-2 text-[11px] font-semibold text-warn">Edited after submission: review the latest version.</div>}
          <Button className="mt-2 w-full" onClick={run} disabled={running} variant={read ? "secondary" : "primary"}>
            {running ? (
              <>
                <span className="spinner" style={read ? { borderColor: "#CCD7EB", borderTopColor: "#305EFF" } : undefined} /> Reading…
              </>
            ) : read ? (
              "Re-run reply reading"
            ) : (
              "Run reply reading"
            )}
          </Button>
          {read?.source === "fallback" && <div className="mt-1 text-center text-[10px] text-ink-subtle">Scripted result loaded: {read.fallbackReason}</div>}
        </>
      )}

      {p.kind === "bulk_buyer" && s.invoice_fixture && ps.status !== "not_recognised" && (
        <Button variant="danger" className="mt-2 w-full" onClick={() => setFooling(true)}>
          Try to fool it
        </Button>
      )}
      {fooling && <FoolModal pattern={p} onClose={() => setFooling(false)} />}

      {read && v.run && (
        <div className="mt-3 space-y-3">
          {read.injectionDetected && <Chip tone="danger">Document contained instructions; ignored.</Chip>}
          <ExtractedTable extraction={read.extraction} kind={p.kind} />

          <ChecksList checks={v.run.checks} />

          {p.kind === "bulk_buyer" && (
            <div className="grid grid-cols-3 gap-2 rounded-md bg-surface-alt p-2 text-[12px]">
              <div>
                <div className="text-ink-muted">Payments matched</div>
                <b>
                  {v.run.matchedCount} of {v.run.totalCount}
                </b>
              </div>
              <div>
                <div className="text-ink-muted">Value matched</div>
                <b>{inr(v.run.matchedValue)}</b>
              </div>
              <div>
                <div className="text-ink-muted">Unmatched</div>
                <b>{inr(v.run.unmatchedValue)}</b>
              </div>
            </div>
          )}
          <p className="text-[12px] font-semibold text-ink">{v.run.summary}</p>
        </div>
      )}
    </Card>
  );
}

function Recommendation({ v }: { v: PatternView }) {
  const { scenario: s, cs, dispatch, trust } = useCase();
  const p = v.pattern;
  const rec = v.rec;
  const read = cs.reads[p.id];
  const [mode, setMode] = useState<"none" | "modify" | "override">("none");
  const [modReserve, setModReserve] = useState(rec.reserve);
  const [ovChoice, setOvChoice] = useState<"hold_full" | "release_all">("hold_full");
  const [ovReason, setOvReason] = useState("");
  const [ovNote, setOvNote] = useState("");
  useEffect(() => {
    setMode("none");
    setModReserve(rec.reserve);
  }, [rec.reserve, p.id]);

  const until = addDays(DECISION_DATE, DISPUTE_WINDOW_DAYS);
  const discountShare = rec.unresolved - rec.reserve;
  const verified = !!(read && v.run) || v.state.status === "not_recognised";

  const decide = (kind: Decision["kind"]) => {
    let release = rec.release;
    let reserveAmt = rec.reserve;
    if (kind === "modify") reserveAmt = clampReserve(modReserve, rec.unresolved);
    if (kind === "override") {
      release = ovChoice === "release_all" ? p.value : 0;
      reserveAmt = ovChoice === "release_all" ? 0 : p.value;
    }
    const decision: Decision = {
      kind,
      patternId: p.id,
      releaseNow: release,
      reserve: reserveAmt,
      floor: rec.floor,
      reserveUntil: until,
      suggestedReserve: rec.reserve,
      overrideChoice: kind === "override" ? ovChoice : undefined,
      overrideReason: kind === "override" ? ovReason : undefined,
      overrideNote: kind === "override" ? ovNote.trim() : undefined,
      readSource: read?.source ?? "none",
      decidedBy: "Risk analyst (you)",
      secondsToDecision: Math.max(1, Math.round((Date.now() - cs.openedAt) / 1000)),
      at: new Date().toISOString(),
    };
    dispatch({ type: "decide", decision, learning: learningLines(v, decision, read?.injectionDetected ?? false, s.history.clean_delivered_orders, s.learning, trust) });
  };

  return (
    <Card title="Recommendation" right={<span className="text-[10px] text-ink-subtle">amounts computed in code</span>}>
      {!verified && <div className="mb-2 rounded-sm bg-surface-alt px-2 py-1.5 text-[11px] text-ink-muted">Before reply verification: the whole pattern counts as unresolved.</div>}
      <div className="space-y-2 text-[13px]">
        <div className="flex items-baseline justify-between">
          <span className="text-ink-muted">Release now</span>
          <b className="font-display text-lg text-positive">{inr(rec.release)}</b>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-ink-muted">Reserve</span>
          <b className="font-display text-lg">{inr(rec.reserve)}</b>
        </div>
        {rec.unresolved > 0 && (
          <div className="rounded-sm bg-surface-alt px-2 py-1.5 font-mono text-[11px] text-ink-body">
            unresolved {inr(rec.unresolved)} × (1 − {Math.round(rec.disc * 100)}% {rec.disc ? `${trust} discount` : p.trigger_flags.length ? "pattern change" : `${trust} discount`}) = {inr(rec.reserve)}
            <span className="block text-ink-muted">floor {inr(rec.floor)} (50% of unresolved)</span>
          </div>
        )}
        {discountShare > 0 && <div className="text-[11px] text-ink-muted">Trust discount {inr(discountShare)} settles on time with the rest of the sale.</div>}
        <div className="flex items-baseline justify-between text-[12px]">
          <span className="text-ink-muted">Reserve held until</span>
          <span>{rec.reserve > 0 ? `${fmtDate(until)} (dispute window, ${DISPUTE_WINDOW_DAYS} days)` : "—"}</span>
        </div>
      </div>

      {v.decision ? (
        <div className="mt-3 flex items-center justify-between rounded-md border border-positive/30 bg-positive-wash px-3 py-2 text-[12px]">
          <span>
            Decided: <b>{v.decision.kind}</b> · release {lakh(v.decision.releaseNow)}, reserve {lakh(v.decision.reserve)}
          </span>
          <Button variant="ghost" onClick={() => dispatch({ type: "screen", screen: "outcome" })}>
            Outcome →
          </Button>
        </div>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <Button onClick={() => decide("approve")}>Approve</Button>
            <Button variant="secondary" disabled={rec.unresolved <= 0} onClick={() => setMode(mode === "modify" ? "none" : "modify")}>
              Modify
            </Button>
            <Button variant="secondary" onClick={() => setMode(mode === "override" ? "none" : "override")}>
              Override
            </Button>
          </div>

          {mode === "modify" && (
            <div className="mt-2 space-y-2 rounded-md border border-line p-3 text-[12px]">
              <label className="block">
                <div className="flex justify-between">
                  <span className="text-ink-muted">Reserve</span>
                  <b>{inr(clampReserve(modReserve, rec.unresolved))}</b>
                </div>
                <input
                  type="range"
                  min={rec.floor}
                  max={rec.unresolved}
                  step={Math.max(1, Math.round(rec.unresolved / 100))}
                  value={clampReserve(modReserve, rec.unresolved)}
                  onChange={(e) => setModReserve(+e.target.value)}
                  className="w-full accent-[#305EFF]"
                />
                <div className="flex justify-between text-[10px] text-ink-subtle">
                  <span>floor {inr(rec.floor)}</span>
                  <span>full unresolved {inr(rec.unresolved)}</span>
                </div>
              </label>
              <Button className="w-full" onClick={() => decide("modify")}>
                Confirm modified reserve
              </Button>
            </div>
          )}

          {mode === "override" && (
            <div className="mt-2 space-y-2 rounded-md border border-line p-3 text-[12px]">
              <label className="block">
                <span className="text-ink-muted">Your decision</span>
                <select value={ovChoice} onChange={(e) => setOvChoice(e.target.value as typeof ovChoice)} className="mt-0.5 w-full rounded-sm border border-line px-2 py-1">
                  <option value="hold_full">Hold the full pattern value</option>
                  <option value="release_all">Release all: mark pattern resolved (analyst only)</option>
                </select>
              </label>
              <label className="block">
                <span className="text-ink-muted">Reason (required)</span>
                <select value={ovReason} onChange={(e) => setOvReason(e.target.value)} className="mt-0.5 w-full rounded-sm border border-line px-2 py-1">
                  <option value="">Select a reason…</option>
                  {OVERRIDE_REASONS.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </label>
              <textarea
                value={ovNote}
                onChange={(e) => setOvNote(e.target.value)}
                placeholder="Explain the override (required)"
                className="h-14 w-full rounded-sm border border-line p-2 outline-none focus:border-brand"
              />
              <Button className="w-full" disabled={!ovReason || !ovNote.trim()} onClick={() => decide("override")}>
                Record override
              </Button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

type NewEntry = Omit<LearningEntry, "id" | "scenarioId" | "merchant" | "at">;

function learningLines(v: PatternView, d: Decision, injected: boolean, trustBefore: number, outcomes: { delivered: number; refunds: number; disputes: number; trust_after: number }, level: string): NewEntry[] {
  const p = v.pattern;
  const lines: NewEntry[] = [];
  if (v.state.status === "submitted" && v.run) {
    if (p.kind === "capacity") lines.push({ kind: "question", text: `Question answered in one round (${p.label}): dispatch date confirmed.` });
    else if (v.run.unmatchedValue === 0 && v.rec.release > 0) lines.push({ kind: "question", text: `Question resolved in one round (${p.label}).` });
    else if (v.rec.release > 0) lines.push({ kind: "question", text: `Question resolved in one round for ${v.run.matchedCount} of ${v.run.totalCount} payments (${p.label}); follow-up asked for ${inr(v.run.unmatchedValue)}.` });
    else lines.push({ kind: "match", text: `Reply did not match payment data (${p.label}). Failed: ${v.run.checks.filter((c) => !c.pass).map((c) => CHECK_SHORT[c.name] ?? c.name).join(", ")}.` });
  }
  if (v.state.edited) lines.push({ kind: "edit", text: `Merchant edited the answer after submitting (${p.label}). Reviewed the latest version.` });
  if (v.state.status === "not_recognised") lines.push({ kind: "question", text: `Merchant did not recognise the orders (${p.label}). Sent to cancellation review.` });
  if (p.trigger_flags.length) lines.push({ kind: "trigger", text: `Pattern change trigger fired: ${p.trigger_flags.map((t) => TRIGGER_TEXT[t]).join(", ")}. Reviewed as New.` });
  if (injected) lines.push({ kind: "injection", text: "Document contained instructions; ignored. Extraction schema and checks unaffected." });
  if (d.kind === "override") lines.push({ kind: "override", text: `Analyst override recorded: ${d.overrideReason}. Match tolerance queued for review.` });
  else lines.push({ kind: "agree", text: `Analyst agreed with match result${d.kind === "modify" ? `; reserve adjusted to ${inr(d.reserve)} within limits` : ""}.` });
  const fraud = outcomes.disputes > outcomes.refunds;
  lines.push({
    kind: "outcome",
    text: fraud
      ? `Outcomes learned: ${outcomes.delivered} delivered, ${outcomes.disputes} disputes on the held slice. Review found fraud; trust count stays ${trustBefore.toLocaleString("en-IN")} (${level}).`
      : `Outcomes learned this week: ${outcomes.delivered} delivered, ${outcomes.refunds} refunds, ${outcomes.disputes} disputes. Trust count ${trustBefore.toLocaleString("en-IN")} → ${outcomes.trust_after.toLocaleString("en-IN")}.`,
  });
  return lines;
}
