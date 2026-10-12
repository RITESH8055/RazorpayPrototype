import { useCase } from "../state/store";
import { ACTION_TEXT, Button, Card, Chip, Eyebrow, LABEL_META, Stat } from "../components/ui";
import { inr, splitOrders } from "../lib/features";
import { SCENARIOS } from "../lib/scenarios";
import type { Label } from "../lib/types";

// Synthetic history so the counters aren't empty at the start of a demo.
const HISTORY = { decisions: 46, agreed: 39, overrides: { explained: 2, partly_explained: 4, unexplained: 1 } as Record<Label, number> };

function fmtDuration(sec: number) {
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec / 60)}m ${sec % 60}s`;
}

export default function OutcomeScreen() {
  const { scenario: s, merchant, cs, state, dispatch } = useCase();
  const d = cs.decision;

  const sessionDecisions = Object.values(state.cases).flatMap((c) => (c.decision ? [c.decision] : []));
  const agreed = HISTORY.agreed + sessionDecisions.filter((x) => x.kind !== "override").length;
  const total = HISTORY.decisions + sessionDecisions.length;
  const overrides = { ...HISTORY.overrides };
  sessionDecisions.filter((x) => x.kind === "override").forEach((x) => (overrides[x.aiLabel] += 1));

  if (!d) {
    return (
      <Card>
        <div className="py-10 text-center">
          <div className="font-display text-lg font-semibold">No decision yet for {merchant.name}</div>
          <p className="mt-1 text-[13px] text-ink-muted">Run the analysis and approve, modify or override it on the review screen.</p>
          <Button className="mt-4" onClick={() => dispatch({ type: "screen", screen: "review" })}>
            Go to spike review
          </Button>
        </div>
      </Card>
    );
  }

  // Rupee view of the decision (synthetic): what was released and what the reserve covers.
  const spikeGmv = splitOrders(s).spike.reduce((a, o) => a + o.amount, 0);
  const released = (spikeGmv * d.releasePct) / 100;
  const reserve = spikeGmv - released;
  const fraud = s.outcome.status === "fraud";
  const clusterGmv = splitOrders(s).spike.filter((o) => o.amount >= 38000).reduce((a, o) => a + o.amount, 0);
  const chargebacks = fraud ? (clusterGmv * s.outcome.highValueChargebackPct) / 100 : (spikeGmv * s.outcome.disputeRatePct) / 100;
  const uncovered = Math.max(0, chargebacks - reserve);

  return (
    <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
      <div className="space-y-4">
        <Card title="Decision summary" right={<Chip tone={d.kind === "override" ? "warn" : "positive"}>{d.kind === "approve" ? "AI recommendation approved" : d.kind === "modify" ? "Approved with changes" : "Analyst override"}</Chip>}>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Stat label="Action taken" value={ACTION_TEXT[d.action]} tone="brand" />
            <Stat label="Released now" value={`${d.releasePct}%`} sub={inr(released)} />
            <Stat label="Reserve" value={d.action === "full_release" ? "None" : `${100 - d.releasePct}%`} sub={d.action === "full_release" ? undefined : `${d.reserveDays} days`} />
            <Stat label="Time to decision" value={fmtDuration(d.secondsToDecision)} sub="from analysis start (demo clock)" />
          </div>
          <div className="mt-4 grid gap-3 border-t border-line/70 pt-3 text-[12px] md:grid-cols-2">
            <div>
              <div className="text-ink-muted">Decided by</div>
              <b>{d.decidedBy}</b>
            </div>
            <div>
              <div className="text-ink-muted">AI recommended</div>
              <b>
                <Chip tone={LABEL_META[d.aiLabel].tone}>{LABEL_META[d.aiLabel].text}</Chip> {ACTION_TEXT[d.aiAction]} ({d.aiSource})
              </b>
            </div>
            {d.overrideReason && (
              <div className="md:col-span-2">
                <div className="text-ink-muted">Override reason</div>
                <b>{d.overrideReason}</b>
                {d.overrideNote && <span className="text-ink-body"> · "{d.overrideNote}"</span>}
              </div>
            )}
          </div>
        </Card>

        <div className={`rounded-md p-5 ${fraud ? "bg-stage text-white" : "border border-positive/30 bg-positive-wash"}`}>
          <div className={`text-[11px] font-semibold uppercase tracking-wide ${fraud ? "text-stage-text" : "text-positive"}`}>Simulated outcome after 60 days</div>
          <div className="mt-1 font-display text-2xl font-semibold">{s.outcome.headline}</div>
          <p className={`mt-1 text-[13px] ${fraud ? "text-white/85" : "text-ink-body"}`}>{s.outcome.detail}</p>
          <div className={`mt-3 grid grid-cols-3 gap-3 border-t pt-3 text-[12px] ${fraud ? "border-white/15" : "border-positive/20"}`}>
            <div>
              <div className={fraud ? "text-white/60" : "text-ink-muted"}>Disputes and chargebacks</div>
              <b>{inr(chargebacks)}</b>
            </div>
            <div>
              <div className={fraud ? "text-white/60" : "text-ink-muted"}>Held in reserve</div>
              <b>{inr(reserve)}</b>
            </div>
            <div>
              <div className={fraud ? "text-white/60" : "text-ink-muted"}>Loss not covered</div>
              <b className={uncovered > 0 ? (fraud ? "text-[#ff8a80]" : "text-danger") : fraud ? "text-stage-text" : "text-positive"}>{inr(uncovered)}</b>
            </div>
          </div>
          {!fraud && d.action !== "partial_release" && d.action !== "full_release" && (
            <p className="mt-2 text-[12px] text-warn">A genuine merchant's festive cash stayed held: {inr(spikeGmv)} of sales waited on review.</p>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <Card title="What the system learned">
          {state.log.length === 0 ? (
            <p className="text-[12px] text-ink-muted">No entries yet.</p>
          ) : (
            <ul className="max-h-[260px] space-y-2 overflow-y-auto pr-1">
              {state.log.map((e) => (
                <li key={e.id} className={`rounded-md border-l-[3px] bg-surface-alt px-3 py-2 text-[12px] ${e.kind === "override" ? "border-warn" : e.kind === "consent" ? "border-ink-subtle" : "border-brand"}`}>
                  <div className="flex items-center gap-2 text-[11px] text-ink-muted">
                    <span className="font-semibold text-ink">{e.merchant}</span>
                    {e.label && <Chip tone={LABEL_META[e.label].tone}>{LABEL_META[e.label].text}</Chip>}
                    <span className="capitalize">{e.kind}</span>
                    <span className="ml-auto">{e.at}</span>
                  </div>
                  <div className="mt-0.5 text-ink">{e.text}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Running counters" right={<span className="text-[11px] text-ink-muted">last 30 days + this session · synthetic</span>}>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Stat label="Analyst agreement with AI" value={`${Math.round((agreed / total) * 100)}%`} sub={`${agreed} of ${total} decisions (approve or modify)`} tone="brand" />
            </div>
            <div>
              <div className="text-[11px] font-medium text-ink-muted">Overrides by label</div>
              <ul className="mt-1 space-y-1">
                {(Object.keys(overrides) as Label[]).map((l) => (
                  <li key={l} className="flex items-center gap-2 text-[12px]">
                    <Chip tone={LABEL_META[l].tone} className="w-[110px] justify-center">
                      {LABEL_META[l].text}
                    </Chip>
                    <div className="h-1.5 flex-1 rounded-full bg-surface-alt-2">
                      <div className="h-1.5 rounded-full bg-ink-subtle" style={{ width: `${Math.min(100, overrides[l] * 12)}%` }} />
                    </div>
                    <b className="w-4 text-right">{overrides[l]}</b>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <p className="mt-3 text-[11px] text-ink-muted">A rising override rate on "Explained" means the model is too lenient.</p>
        </Card>

        <Card>
          <Eyebrow>Next case</Eyebrow>
          <div className="flex flex-wrap gap-2">
            {(["a", "b", "c"] as const)
              .filter((id) => id !== state.scenarioId)
              .map((id) => (
                <Button
                  key={id}
                  variant="secondary"
                  onClick={() => {
                    dispatch({ type: "scenario", id });
                    dispatch({ type: "screen", screen: "review" });
                  }}
                >
                  {id.toUpperCase()} · {SCENARIOS[id].merchant.name}
                  {state.cases[id].decision ? " ✓" : ""}
                </Button>
              ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
