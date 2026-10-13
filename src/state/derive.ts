// Turns case state into settlement numbers. Amounts come only from src/logic/reserve.ts.
import type { Decision, Pattern, ReadResult, Scenario, TrustLevel } from "../lib/types";
import { runChecks, type CheckRun } from "../shared/checks";
import { reserveFloor, settle, type Settlement } from "../shared/reserve";
import type { PatternState } from "./store";

export interface PatternView {
  pattern: Pattern;
  state: PatternState;
  run: CheckRun | null;
  /** Code recommendation for the analyst. */
  rec: Settlement;
  decision: Decision | undefined;
  /** What the merchant sees as waiting: decision reserve if decided, else the recommendation. */
  waiting: number;
  released: number;
  stopped: number;
}

export function derivePattern(s: Scenario, level: TrustLevel, pattern: Pattern, ps: PatternState, read: ReadResult | undefined, decision: Decision | undefined): PatternView {
  const run = read && ps.status === "submitted" ? runChecks(s, pattern.id, read.extraction) : null;
  let rec: Settlement;
  if (ps.status === "not_recognised") {
    // Merchant does not recognise the orders: hold the full value for cancellation review.
    rec = { release: 0, unresolved: pattern.value, disc: 0, reserve: pattern.value, floor: reserveFloor(pattern.value) };
  } else {
    rec = settle(pattern, level, run?.matchedValue ?? 0, run?.checks ?? []);
  }
  const stopped = ps.status === "not_recognised" && !decision ? pattern.value : 0;
  const waiting = decision ? decision.reserve : stopped ? 0 : rec.reserve;
  return { pattern, state: ps, run, rec, decision, waiting, released: decision ? decision.releaseNow : 0, stopped };
}
