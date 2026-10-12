import { useEffect, useState } from "react";
import { SCENARIO_IDS, SCENARIOS } from "./lib/scenarios";
import { useStore, viewOf, type Screen } from "./state/store";
import { Chip } from "./components/ui";
import ProfileScreen from "./screens/ProfileScreen";
import SpikeScreen from "./screens/SpikeScreen";
import AnalystScreen from "./screens/AnalystScreen";
import OutcomeScreen from "./screens/OutcomeScreen";

const STEPS: { name: string; screen: Screen; anchor?: string }[] = [
  { name: "Profile", screen: "profile" },
  { name: "Spike", screen: "spike" },
  { name: "Pack", screen: "spike", anchor: "pack" },
  { name: "Decision", screen: "review" },
  { name: "Outcome", screen: "outcome" },
];

export default function App() {
  const { state, dispatch } = useStore();
  const view = viewOf(state.screen);
  const cs = state.cases[state.scenarioId];
  const [apiMode, setApiMode] = useState<"checking" | "live" | "fallback">("checking");

  useEffect(() => {
    fetch("/api/health")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((h) => setApiMode(h.hasKey ? "live" : "fallback"))
      .catch(() => setApiMode("fallback"));
  }, []);

  const done = (i: number) =>
    [true, true, cs.packStatus === "shared", cs.decision !== null, cs.decision !== null][i] && STEPS[i].screen !== state.screen;

  const goStep = (i: number) => {
    dispatch({ type: "screen", screen: STEPS[i].screen });
    if (STEPS[i].anchor) setTimeout(() => document.getElementById(STEPS[i].anchor!)?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-6 gap-y-2 px-5 py-2.5">
          <div className="flex items-center gap-2.5">
            <div className="grid h-8 w-8 place-items-center rounded-md bg-brand">
              <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="white" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 13l4 4 10-11" />
              </svg>
            </div>
            <div className="leading-tight">
              <div className="font-display text-[15px] font-semibold">Hold Resolver</div>
              <div className="text-[11px] text-ink-muted">Growth readiness for festive spikes</div>
            </div>
          </div>

          <nav className="flex items-center gap-1 rounded-md bg-surface-alt p-1" aria-label="Scenario">
            {SCENARIO_IDS.map((id) => (
              <button
                key={id}
                onClick={() => dispatch({ type: "scenario", id })}
                className={`rounded-sm px-3 py-1 text-[12px] font-semibold transition-colors ${state.scenarioId === id ? "bg-white text-ink shadow-sm" : "text-ink-muted hover:text-ink"}`}
              >
                <span className="mr-1.5 text-brand">{id.toUpperCase()}</span>
                {SCENARIOS[id].merchant.name}
              </button>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <Chip tone={apiMode === "live" ? "positive" : "neutral"}>{apiMode === "checking" ? "Checking API…" : apiMode === "live" ? "● Live AI ready" : "Fallback mode (no API key)"}</Chip>
            <div className="flex rounded-md border border-line p-0.5" role="tablist" aria-label="View">
              {(["merchant", "analyst"] as const).map((v) => (
                <button
                  key={v}
                  role="tab"
                  aria-selected={view === v}
                  onClick={() => view !== v && dispatch({ type: "screen", screen: v === "merchant" ? "profile" : "review" })}
                  className={`rounded-sm px-3 py-1 text-[12px] font-semibold ${view === v ? "bg-brand text-white" : "text-ink-body hover:text-ink"}`}
                >
                  {v === "merchant" ? "Merchant" : "Risk analyst"}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Step indicator */}
        <div className="border-t border-line/60 bg-white">
          <ol className="mx-auto flex max-w-[1440px] items-center gap-1 overflow-x-auto px-5 py-1.5">
            {STEPS.map((step, i) => {
              // Spike and Pack share the merchant spike screen, so both light up there.
              const active = STEPS[i].screen === state.screen;
              return (
                <li key={step.name} className="flex items-center gap-1">
                  {i > 0 && <span className="mx-1 h-px w-6 bg-line" />}
                  <button
                    onClick={() => goStep(i)}
                    className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold ${
                      active ? "bg-brand-wash text-brand-dark" : "text-ink-muted hover:text-ink"
                    }`}
                  >
                    <span
                      className={`grid h-4.5 w-4.5 place-items-center rounded-full text-[10px] ${
                        active ? "bg-brand text-white" : done(i) ? "bg-positive text-white" : "bg-surface-alt-2 text-ink-muted"
                      }`}
                    >
                      {done(i) && !(active) ? "✓" : i + 1}
                    </span>
                    {step.name}
                  </button>
                </li>
              );
            })}
            <li className="ml-auto pl-4 text-[11px] text-ink-muted">{view === "merchant" ? "Merchant dashboard view" : "Razorpay risk analyst console"}</li>
          </ol>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1440px] px-5 py-4">
          {state.screen === "profile" && <ProfileScreen />}
          {state.screen === "spike" && <SpikeScreen />}
          {state.screen === "review" && <AnalystScreen />}
          {state.screen === "outcome" && <OutcomeScreen />}
        </div>
      </main>

      <footer className="border-t border-line bg-white">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-3 px-5 py-2 text-[11px] text-ink-muted">
          <Chip tone="accent">Synthetic data</Chip>
          <span>Every merchant, number, social post and outcome shown here is synthetic. Thresholds and caps are assumed placeholders.</span>
          <span className="ml-auto">Prototype for the Razorpay x ISB Build Challenge. Not affiliated with or endorsed by Razorpay.</span>
        </div>
      </footer>
    </div>
  );
}
