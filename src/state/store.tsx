import { createContext, useContext, useMemo, useReducer, type Dispatch, type ReactNode } from "react";
import type { Declaration, Decision, Merchant, ReadResult, ScenarioId, SourceId, SourceStatus } from "../lib/types";
import { SCENARIOS } from "../lib/scenarios";
import { buildEvidence } from "../lib/features";
import type { Submission } from "../lib/readReply";

export type View = "merchant" | "analyst";
export type Screen = "declare" | "spike" | "review" | "outcome";

export type PatternStatus = "open" | "submitted" | "not_recognised" | "later";

export interface PatternState {
  status: PatternStatus;
  submission?: Submission;
  /** The merchant changed the answer after it locked; flagged to the analyst. */
  edited: boolean;
  followUp?: "answered" | "not_recognised";
}

interface CaseState {
  sourceStatus: Partial<Record<SourceId, SourceStatus>>;
  declaration: Declaration | null;
  declarationStatus: "none" | "draft" | "submitted";
  patterns: Record<string, PatternState>;
  reads: Record<string, ReadResult>;
  reading: string | null;
  decisions: Record<string, Decision>;
  openedAt: number;
  /** "Try to fool it" session counter: attempts, and money released above the first answer (must stay ₹0). */
  fool: { attempts: number; released: number };
}

export interface LearningEntry {
  id: number;
  scenarioId: ScenarioId;
  merchant: string;
  kind: "question" | "match" | "agree" | "override" | "trigger" | "injection" | "outcome" | "trust" | "consent" | "edit" | "fool" | "breach";
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
  | { type: "share"; source: SourceId }
  | { type: "stopSharing" }
  | { type: "declEdit"; declaration?: Declaration }
  | { type: "declChange"; declaration: Declaration }
  | { type: "declSubmit" }
  | { type: "answer"; pattern: string; submission: Submission }
  | { type: "patternStatus"; pattern: string; status: PatternStatus }
  | { type: "followUp"; pattern: string; answer: "answered" | "not_recognised" }
  | { type: "readStart"; pattern: string }
  | { type: "readDone"; pattern: string; result: ReadResult }
  | { type: "decide"; decision: Decision; learning: Omit<LearningEntry, "id" | "scenarioId" | "merchant" | "at">[] }
  | { type: "foolAttempt"; released: number; text: string; breach: boolean }
  | { type: "highlight"; card: string | null }
  | { type: "reset" };

const freshCase = (id: ScenarioId): CaseState => {
  const s = SCENARIOS[id].scenario;
  return {
    sourceStatus: {},
    declaration: s.declaration ? { ...s.declaration } : null,
    declarationStatus: s.declaration ? "submitted" : "none",
    patterns: Object.fromEntries(s.patterns.map((p) => [p.id, { status: "open", edited: false } as PatternState])),
    reads: {},
    reading: null,
    decisions: {},
    openedAt: Date.now(),
    fool: { attempts: 0, released: 0 },
  };
};

const initial = (): State => ({
  scenarioId: "a",
  screen: "declare",
  cases: { a: freshCase("a"), b: freshCase("b"), c: freshCase("c") },
  log: [],
  highlight: null,
});

let logId = 1;
const now = () => new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

function reducer(state: State, action: Action): State {
  const id = state.scenarioId;
  const cur = state.cases[id];
  const patch = (p: Partial<CaseState>) => ({ ...state, cases: { ...state.cases, [id]: { ...cur, ...p } } });
  const merchant = SCENARIOS[id].merchant;
  const log = (kind: LearningEntry["kind"], text: string): LearningEntry => ({ id: logId++, scenarioId: id, merchant: merchant.name, kind, text, at: now() });
  const setPattern = (pid: string, p: Partial<PatternState>) => ({ ...cur.patterns, [pid]: { ...cur.patterns[pid], ...p } });

  switch (action.type) {
    case "scenario": {
      // From the outcome screen, an undecided case opens on its review instead of an empty outcome.
      const decided = Object.keys(state.cases[action.id].decisions).length > 0;
      const screen = state.screen === "outcome" && !decided ? "review" : state.screen;
      return { ...state, scenarioId: action.id, screen, highlight: null };
    }
    case "screen":
      return { ...state, screen: action.screen, highlight: null };
    case "withdraw": {
      const name = merchant.sources.find((x) => x.id === action.source)?.name ?? action.source;
      return { ...patch({ sourceStatus: { ...cur.sourceStatus, [action.source]: "withdrawn" } }), log: [log("consent", `Merchant withdrew consent for ${name}. Its data was deleted for this sale.`), ...state.log] };
    }
    case "share": {
      const name = merchant.sources.find((x) => x.id === action.source)?.name ?? action.source;
      return { ...patch({ sourceStatus: { ...cur.sourceStatus, [action.source]: "shared" } }), log: [log("consent", `Merchant shared ${name} for this sale.`), ...state.log] };
    }
    case "stopSharing": {
      const next = { ...cur.sourceStatus };
      for (const s of merchant.sources) if (s.withdrawable && (cur.sourceStatus[s.id] ?? s.status) === "shared") next[s.id] = "withdrawn";
      return { ...patch({ sourceStatus: next }), log: [log("consent", "Merchant stopped sharing all optional sources for this sale."), ...state.log] };
    }
    case "declEdit":
      return patch({ declarationStatus: "draft", declaration: action.declaration ?? cur.declaration });
    case "declChange":
      return patch({ declaration: action.declaration });
    case "declSubmit":
      return patch({ declarationStatus: "submitted" });
    case "answer": {
      const wasLocked = cur.patterns[action.pattern].status === "submitted";
      const next = patch({ patterns: setPattern(action.pattern, { status: "submitted", submission: action.submission, edited: cur.patterns[action.pattern].edited || wasLocked }) });
      // An edited answer invalidates any earlier reading of it.
      if (wasLocked) {
        const reads = { ...cur.reads };
        delete reads[action.pattern];
        next.cases[id] = { ...next.cases[id], reads };
        next.log = [log("edit", "Merchant edited a submitted answer. Flagged to the analyst."), ...state.log];
      }
      return next;
    }
    case "patternStatus":
      return patch({ patterns: setPattern(action.pattern, { status: action.status }) });
    case "followUp":
      return patch({ patterns: setPattern(action.pattern, { followUp: action.answer }) });
    case "readStart":
      // The demo clock for "time to decision" starts at the first reply reading.
      return patch({ reading: action.pattern, openedAt: Object.keys(cur.reads).length ? cur.openedAt : Date.now() });
    case "readDone":
      return patch({ reading: null, reads: { ...cur.reads, [action.pattern]: action.result } });
    case "decide":
      return {
        ...patch({ decisions: { ...cur.decisions, [action.decision.patternId]: action.decision } }),
        screen: "outcome",
        log: [...action.learning.map((l) => log(l.kind, l.text)), ...state.log],
      };
    case "foolAttempt":
      return {
        ...patch({ fool: { attempts: cur.fool.attempts + 1, released: cur.fool.released + action.released } }),
        log: [log(action.breach ? "breach" : "fool", action.text), ...state.log],
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

export const viewOf = (screen: Screen): View => (screen === "declare" || screen === "spike" ? "merchant" : "analyst");

/** Everything a screen needs about the current scenario, with consent changes applied. */
export function useCase() {
  const { state, dispatch } = useStore();
  const id = state.scenarioId;
  const base = SCENARIOS[id];
  const cs = state.cases[id];

  const merchant: Merchant = useMemo(
    () => ({ ...base.merchant, sources: base.merchant.sources.map((s) => ({ ...s, status: cs.sourceStatus[s.id] ?? s.status })) }),
    [base, cs.sourceStatus],
  );
  const evidence = useMemo(() => buildEvidence(base.scenario, base.features, merchant), [base, merchant]);

  return { ...base, merchant, evidence, cs, state, dispatch };
}

/** Evidence coverage: how many sources are shared for this sale. No quality judgment. */
export function coverage(m: Merchant) {
  const shared = m.sources.filter((s) => s.status === "shared" || s.status === "always_on").length;
  return { shared, total: m.sources.length };
}
