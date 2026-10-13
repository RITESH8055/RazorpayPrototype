import type { Judgment, Merchant, Scenario, ScenarioId } from "./types";
import { computeFeatures } from "./features";
import { trustLevel } from "../shared/reserve";
import merchants from "../data/merchants.json";
import a from "../data/scenarios/a.json";
import b from "../data/scenarios/b.json";
import c from "../data/scenarios/c.json";
import ja from "../data/judgment/a.json";
import jb from "../data/judgment/b.json";
import jc from "../data/judgment/c.json";

const MERCHANTS = merchants as unknown as Record<string, Merchant>;
const DATA = { a, b, c } as unknown as Record<ScenarioId, Scenario>;
const JUDGMENT = { a: ja, b: jb, c: jc } as unknown as Record<ScenarioId, Judgment>;

export const SCENARIO_IDS: ScenarioId[] = ["a", "b", "c"];

function entry(id: ScenarioId) {
  const scenario = DATA[id];
  const spike = scenario.orders.filter((o) => o.hour >= scenario.spikeStartHour);
  const baseline = scenario.orders.filter((o) => o.hour < scenario.spikeStartHour);
  return {
    id,
    scenario,
    merchant: MERCHANTS[scenario.merchantId],
    features: computeFeatures(scenario),
    judgment: JUDGMENT[id],
    trust: trustLevel(scenario.history),
    spikeValue: spike.reduce((s, o) => s + o.amount, 0),
    baselineDailyValue: baseline.reduce((s, o) => s + o.amount, 0) / 3,
  };
}

export const SCENARIOS = Object.fromEntries(SCENARIO_IDS.map((id) => [id, entry(id)])) as Record<ScenarioId, ReturnType<typeof entry>>;

/** Scenario clock: decisions happen the day after the spike starts (19 Oct 2026). */
export const DECISION_DATE = "2026-10-19";

/** Wall-clock label for an hour index in the scenario timeline. */
export function hourLabel(s: Scenario, hour: number, withDay = false) {
  const d = new Date(new Date(s.startIso).getTime() + hour * 3600_000);
  const fmt = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "numeric",
    ...(withDay ? { day: "numeric", month: "short" } : {}),
  });
  return fmt.format(d);
}

export { inr, lakh, fmtDate } from "../shared/format";
