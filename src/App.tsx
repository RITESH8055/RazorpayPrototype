import { useEffect, useState } from "react";
import { SCENARIO_IDS, SCENARIOS } from "./lib/scenarios";
import { useStore, viewOf, type Screen } from "./state/store";
import DeclareScreen from "./screens/DeclareScreen";
import SpikeScreen from "./screens/SpikeScreen";
import AnalystScreen from "./screens/AnalystScreen";
import OutcomeScreen from "./screens/OutcomeScreen";

const STEPS: { name: string; screen: Screen; anchor?: string }[] = [
  { name: "Declare", screen: "declare" },
  { name: "Spike", screen: "spike" },
  { name: "Questions", screen: "spike", anchor: "questions" },
  { name: "Review", screen: "review" },
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

  const decided = Object.keys(cs.decisions).length > 0;
  const answered = Object.values(cs.patterns).every((p) => p.status === "submitted" || p.status === "not_recognised");
  const done = (i: number) => [cs.declarationStatus === "submitted", true, answered, decided, decided][i] && STEPS[i].screen !== state.screen;

  const goStep = (i: number) => {
    dispatch({ type: "screen", screen: STEPS[i].screen });
    if (STEPS[i].anchor) setTimeout(() => document.getElementById(STEPS[i].anchor!)?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Top bar: identity left, two segmented controls right */}
      <header className="sticky top-0 z-30 border-b border-line/60 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-6 gap-y-2 px-6 py-3">
          <div className="flex items-center gap-2.5">
            <div className="grid h-8 w-8 place-items-center rounded-[9px] bg-brand">
              <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="white" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 13l4 4 10-11" />
              </svg>
            </div>
            <div className="font-display text-[16px] font-semibold">Sale Readiness</div>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-3">
            <nav className="flex rounded-[10px] bg-surface-alt-2/70 p-0.5" aria-label="Scenario">
              {SCENARIO_IDS.map((id) => (
                <button
                  key={id}
                  onClick={() => dispatch({ type: "scenario", id })}
                  className={`rounded-lg px-3 py-1.5 text-[13px] font-medium transition-all ${state.scenarioId === id ? "bg-white text-ink shadow-sm" : "text-ink-muted hover:text-ink"}`}
                >
                  {SCENARIOS[id].merchant.name}
                </button>
              ))}
            </nav>
            <div className="flex rounded-[10px] bg-surface-alt-2/70 p-0.5" role="tablist" aria-label="View">
              {(["merchant", "analyst"] as const).map((v) => (
                <button
                  key={v}
                  role="tab"
                  aria-selected={view === v}
                  onClick={() => view !== v && dispatch({ type: "screen", screen: v === "merchant" ? "declare" : "review" })}
                  className={`rounded-lg px-3 py-1.5 text-[13px] font-medium transition-all ${view === v ? "bg-white text-ink shadow-sm" : "text-ink-muted hover:text-ink"}`}
                >
                  {v === "merchant" ? "Merchant" : "Risk analyst"}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Step indicator: quiet text, one thin progress line */}
        <nav aria-label="Steps" className="mx-auto max-w-[1440px] px-6">
          <ol className="flex flex-wrap items-center gap-x-6">
            {STEPS.map((step, i) => {
              // Each view shows only its own steps: merchants never see the analyst's Review and Outcome.
              if (viewOf(step.screen) !== view) return null;
              // Spike and Questions share the merchant spike screen, so both light up there.
              const active = STEPS[i].screen === state.screen;
              return (
                <li key={step.name}>
                  <button
                    onClick={() => goStep(i)}
                    aria-current={active ? "step" : undefined}
                    className={`-mb-px flex items-center gap-1.5 border-b-2 py-2 text-[13px] transition-colors ${
                      active ? "border-brand font-semibold text-ink" : "border-transparent text-ink-muted hover:text-ink"
                    }`}
                  >
                    {done(i) && !active && <span className="text-positive">✓</span>}
                    {step.name}
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1440px] px-6 py-5">
          {state.screen === "declare" && <DeclareScreen />}
          {state.screen === "spike" && <SpikeScreen />}
          {state.screen === "review" && <AnalystScreen />}
          {state.screen === "outcome" && <OutcomeScreen />}
        </div>
      </main>

      <footer>
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-4 gap-y-1 px-6 py-2.5 text-[12px] text-ink-subtle">
          <span className="rounded-full bg-accent px-2 py-0.5 font-semibold text-ink">Synthetic data</span>
          <span>All companies and numbers are fictional.</span>
          <span className="flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${apiMode === "live" ? "bg-positive" : "bg-ink-subtle"}`} />
            {apiMode === "checking" ? "Checking AI…" : apiMode === "live" ? "Live reply reading" : "AI in fallback mode (no API key)"}
          </span>
          <span className="ml-auto">Razorpay x ISB Build Challenge prototype. Not affiliated with Razorpay.</span>
        </div>
      </footer>
    </div>
  );
}
