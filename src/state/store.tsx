import { createContext, useContext, useMemo, useReducer, type Dispatch, type ReactNode } from "react";
import type { AnalysisResult, Decision, Label, Merchant, ScenarioId, SourceId, SourceStatus } from "../lib/types";
import { SCENARIOS } from "../lib/scenarios";
import { buildEvidence } from "../lib/features";
import { precomputed } from "../lib/analysis";

export type View = "merchant" | "analyst";
export type Screen = "profile" | "spike" | "review" | "outcome";
export type PackStatus = "draft" | "shared" | "stopped";

interface CaseState {
  sourceStatus: Partial<Record<SourceId, SourceStatus>>;
  corrections: Partial<Record<SourceId, string>>;
  removedItems: string[];
  packStatus: PackStatus;
  analysis: AnalysisResult | null;
  running: boolean;
  decision: Decision | null;
  openedAt: number;
}

export interface LearningEntry {
  id: number;
  scenarioId: ScenarioId;
  merchant: string;
  kind: "approve" | "modify" | "override" | "consent" | "pack";
  label?: Label;
  text: string;
  at: string;
}

interface State {
  scenarioId: ScenarioId;
  screen: Screen;
  cases: Record<ScenarioId, CaseState>;
  log: LearningEntry[];
  highlight: string | null; // card id highlighted from an evidence chip
}

type Action =
  | { type: "scenario"; id: ScenarioId }
  | { type: "screen"; screen: Screen }
  | { type: "withdraw"; source: SourceId }
  | { type: "correct"; source: SourceId; note: string }
  | { type: "toggleItem"; item: string; removed: boolean }
  | { type: "pack"; status: PackStatus }
  | { type: "running" }
  | { type: "analysis"; result: AnalysisResult }
  | { type: "decide"; decision: Decision; learning: string }
  | { type: "highlight"; card: string | null }
  | { type: "reset" };

const freshCase = (): CaseState => ({
  sourceStatus: {},
  corrections: {},
  removedItems: [],
  packStatus: "draft",
  analysis: null,
  running: false,
  decision: null,
  openedAt: Date.now(),
});

const initial = (): State => ({
  scenarioId: "a",
  screen: "profile",
  cases: { a: freshCase(), b: freshCase(), c: freshCase() },
  log: [],
  highlight: null,
});

let logId = 1;
const now = () => new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

function reducer(state: State, action: Action): State {
  const id = state.scenarioId;
  const cur = state.cases[id];
  const patch = (p: Partial<CaseState>) => ({ ...state, cases: { ...state.cases, [id]: { ...cur, ...p } } });
  const merchantName = SCENARIOS[id].merchant.name;

  switch (action.type) {
    case "scenario": {
      // From the outcome screen, an undecided case opens on its review instead of an empty outcome.
      const screen = state.screen === "outcome" && !state.cases[action.id].decision ? "review" : state.screen;
      return { ...state, scenarioId: action.id, screen, highlight: null };
    }
    case "screen":
      return { ...state, screen: action.screen, highlight: null };
    case "withdraw":
      return {
        ...patch({ sourceStatus: { ...cur.sourceStatus, [action.source]: "withdrawn" } }),
        log: [
          { id: logId++, scenarioId: id, merchant: merchantName, kind: "consent", text: `Merchant withdrew consent for ${SCENARIOS[id].merchant.sources.find((x) => x.id === action.source)?.name ?? action.source}. Source data deleted; readiness recalculated.`, at: now() },
          ...state.log,
        ],
      };
    case "correct":
      return patch({
        sourceStatus: { ...cur.sourceStatus, [action.source]: "pending_reverification" },
        corrections: { ...cur.corrections, [action.source]: action.note },
      });
    case "toggleItem":
      return patch({
        removedItems: action.removed ? [...new Set([...cur.removedItems, action.item])] : cur.removedItems.filter((x) => x !== action.item),
      });
    case "pack":
      return patch({ packStatus: action.status });
    case "running":
      // The demo clock for "time to decision" starts when the first analysis runs.
      return patch({ running: true, openedAt: cur.analysis ? cur.openedAt : Date.now() });
    case "analysis":
      return patch({ running: false, analysis: action.result });
    case "decide":
      return {
        ...patch({ decision: action.decision }),
        screen: "outcome",
        log: [
          { id: logId++, scenarioId: id, merchant: merchantName, kind: action.decision.kind, label: action.decision.aiLabel, text: action.learning, at: now() },
          ...state.log,
        ],
      };
    case "highlight":
      return { ...state, highlight: action.card };
    case "reset":
      return initial();
  }
}

const Ctx = createContext<{ state: State; dispatch: Dispatch<Action> } | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initial);
  return <Ctx.Provider value={{ state, dispatch }}>{children}</Ctx.Provider>;
}

export function useStore() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useStore outside provider");
  return ctx;
}

export const viewOf = (screen: Screen): View => (screen === "profile" || screen === "spike" ? "merchant" : "analyst");

/** Everything a screen needs about the current scenario, with consent changes applied. */
export function useCase() {
  const { state, dispatch } = useStore();
  const id = state.scenarioId;
  const base = SCENARIOS[id];
  const cs = state.cases[id];

  const merchant: Merchant = useMemo(
    () => ({
      ...base.merchant,
      sources: base.merchant.sources.map((s) => ({ ...s, status: cs.sourceStatus[s.id] ?? s.status })),
    }),
    [base, cs.sourceStatus],
  );
  const evidence = useMemo(() => buildEvidence(base.scenario, base.features, merchant), [base, merchant]);
  // The merchant view uses the latest analysis, or the scripted background judgment if none has run.
  const effective = useMemo(() => cs.analysis ?? precomputed(evidence, base.fallback), [cs.analysis, evidence, base.fallback]);

  return { ...base, merchant, evidence, cs, effective, state, dispatch };
}

export type Readiness = "Ready" | "Partly ready" | "Not ready";

export function readiness(m: Merchant): { level: Readiness; active: number; total: number } {
  const active = m.sources.filter((s) => s.status === "verified" || s.status === "consented").length;
  const total = m.sources.length;
  return { level: active === total ? "Ready" : active >= 2 ? "Partly ready" : "Not ready", active, total };
}
