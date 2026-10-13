import { useCase } from "../state/store";
import { Button, Card, Chip, Stat, TRUST_TONE } from "../components/ui";
import { fmtDate, inr, lakh } from "../lib/format";
import { SCENARIOS } from "../lib/scenarios";
import { trustLevel } from "../logic/reserve";

// Synthetic history so the counters aren't empty at the start of a demo.
const HISTORY = { patterns: 78, oneRound: 61, decisions: 47, agreed: 41, falseHoldValue: 1840000 };

function fmtDuration(sec: number) {
  return sec < 60 ? `${sec}s` : `${Math.floor(sec / 60)}m ${sec % 60}s`;
}

const KIND_TEXT: Record<string, string> = { approve: "Match result approved", modify: "Approved with changed reserve", override: "Analyst override" };

export default function OutcomeScreen() {
  const { scenario: s, merchant, cs, state, dispatch, trust } = useCase();
  const decisions = Object.values(cs.decisions);

  // Counters across the session plus synthetic history.
  const all = Object.entries(state.cases).flatMap(([sid, c]) => Object.values(c.decisions).map((d) => ({ sid, d, ps: c.patterns[d.patternId] })));
  const oneRound = all.filter((x) => x.ps.status === "submitted" && !x.ps.edited && x.d.kind !== "override" && x.d.releaseNow > 0).length;
  const agreed = all.filter((x) => x.d.kind !== "override").length;
  const falseHold = all
    .filter((x) => SCENARIOS[x.sid as keyof typeof SCENARIOS].scenario.outcome.status !== "fraud")
    .reduce((a, x) => a + x.d.reserve, 0);

  if (!decisions.length) {
    return (
      <Card>
        <div className="py-10 text-center">
          <div className="font-display text-lg font-semibold">No decision yet for {merchant.name}</div>
          <p className="mt-1 text-[13px] text-ink-muted">Run reply reading and approve, modify or override on the review screen.</p>
          <Button className="mt-4" onClick={() => dispatch({ type: "screen", screen: "review" })}>
            Go to review
          </Button>
        </div>
      </Card>
    );
  }

  const fraud = s.outcome.status === "fraud";
  const released = decisions.reduce((a, d) => a + d.releaseNow, 0);
  const reserved = decisions.reduce((a, d) => a + d.reserve, 0);
  const d = decisions[0];
  const after = trustLevel({ ...s.history, clean_delivered_orders: s.learning.trust_after });

  return (
    <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
      <div className="space-y-4">
        <Card title="Decision summary" right={<Chip tone={d.kind === "override" ? "warn" : "positive"}>{KIND_TEXT[d.kind]}</Chip>}>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Stat label="Released now" value={lakh(released)} sub={inr(released)} tone="brand" />
            <Stat label="Reserve" value={lakh(reserved)} sub={reserved ? `until ${fmtDate(d.reserveUntil)}` : "none"} />
            <Stat label="Decided by" value="Analyst" sub={d.decidedBy} />
            <Stat label="Time to decision" value={fmtDuration(d.secondsToDecision)} sub="from first reply reading (demo clock)" />
          </div>
          <div className="mt-3 border-t border-line/70 pt-3 text-[12px] text-ink-body">
            Reply read by: <b>{d.readSource === "none" ? "not read" : d.readSource === "live" ? "live model call" : "scripted fallback"}</b> · suggested reserve {inr(d.suggestedReserve)} · floor {inr(d.floor)}
            {d.overrideReason && (
              <div className="mt-1">
                Override: <b>{d.overrideChoice === "release_all" ? "release all" : "hold full value"}</b> · {d.overrideReason}
                {d.overrideNote && ` · "${d.overrideNote}"`}
              </div>
            )}
          </div>
        </Card>

        <div className={`rounded-md p-5 ${fraud ? "bg-stage text-white" : "border border-positive/30 bg-positive-wash"}`}>
          <div className={`text-[11px] font-semibold uppercase tracking-wide ${fraud ? "text-stage-text" : "text-positive"}`}>Simulated outcome after 60 days</div>
          <div className="mt-1 font-display text-2xl font-semibold">{s.outcome.headline}</div>
          <p className={`mt-1 text-[13px] ${fraud ? "text-white/85" : "text-ink-body"}`}>{s.outcome.detail}</p>
          <p className={`mt-2 text-[12px] ${fraud ? "text-white/70" : "text-ink-muted"}`}>{s.learning.false_hold_note}</p>
          <div className={`mt-3 flex items-center gap-2 border-t pt-3 text-[12px] ${fraud ? "border-white/15" : "border-positive/20"}`}>
            <span className={fraud ? "text-white/70" : "text-ink-muted"}>Trust level</span>
            <Chip tone={TRUST_TONE[trust]}>{trust}</Chip>
            <span>→</span>
            <Chip tone={TRUST_TONE[fraud ? trust : after]}>{fraud ? trust : after}</Chip>
            <span className={fraud ? "text-white/70" : "text-ink-muted"}>
              {s.history.clean_delivered_orders.toLocaleString("en-IN")} → {(fraud ? s.history.clean_delivered_orders : s.learning.trust_after).toLocaleString("en-IN")} clean orders
            </span>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <Card title="What the system learned" right={<span className="text-[11px] text-ink-muted">analyst view</span>}>
          {state.log.length === 0 ? (
            <p className="text-[12px] text-ink-muted">No entries yet.</p>
          ) : (
            <ul className="max-h-[300px] space-y-2 overflow-y-auto pr-1">
              {state.log.map((e) => (
                <li
                  key={e.id}
                  className={`rounded-md border-l-[3px] bg-surface-alt px-3 py-2 text-[12px] ${
                    e.kind === "override" || e.kind === "edit" ? "border-warn" : e.kind === "trigger" || e.kind === "injection" || e.kind === "match" ? "border-danger" : e.kind === "consent" ? "border-ink-subtle" : "border-brand"
                  }`}
                >
                  <div className="flex items-center gap-2 text-[11px] text-ink-muted">
                    <span className="font-semibold text-ink">{e.merchant}</span>
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
          <div className="grid grid-cols-3 gap-4">
            <Stat label="One-round resolution" value={`${Math.round(((HISTORY.oneRound + oneRound) / (HISTORY.patterns + all.length)) * 100)}%`} sub={`${HISTORY.oneRound + oneRound} of ${HISTORY.patterns + all.length} patterns`} tone="brand" />
            <Stat label="Analyst agreement" value={`${Math.round(((HISTORY.agreed + agreed) / (HISTORY.decisions + all.length)) * 100)}%`} sub={`${HISTORY.agreed + agreed} of ${HISTORY.decisions + all.length} decisions`} />
            <Stat label="False hold value" value={lakh(HISTORY.falseHoldValue + falseHold)} sub="held, later proved clean" />
          </div>
          <p className="mt-3 text-[11px] text-ink-muted">Cross-merchant trust weights, reserve floors and caps change only through a tested, reviewed update.</p>
        </Card>

        <Card>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-brand-dark">Next case</div>
          <div className="flex flex-wrap gap-2">
            {(["a", "b", "c"] as const)
              .filter((sid) => sid !== state.scenarioId)
              .map((sid) => (
                <Button
                  key={sid}
                  variant="secondary"
                  onClick={() => {
                    dispatch({ type: "scenario", id: sid });
                    dispatch({ type: "screen", screen: "review" });
                  }}
                >
                  {sid.toUpperCase()} · {SCENARIOS[sid].merchant.name}
                  {Object.keys(state.cases[sid].decisions).length ? " ✓" : ""}
                </Button>
              ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
