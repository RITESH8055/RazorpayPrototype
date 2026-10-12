import type { Merchant, Recommendation, Scenario, ScenarioId } from "./types";
import { computeFeatures } from "./features";
import merchants from "../data/merchants.json";
import a from "../data/scenarios/a.json";
import b from "../data/scenarios/b.json";
import c from "../data/scenarios/c.json";
import fa from "../data/fallback/a.json";
import fb from "../data/fallback/b.json";
import fc from "../data/fallback/c.json";

const MERCHANTS = merchants as unknown as Record<string, Merchant>;
const DATA = { a, b, c } as unknown as Record<ScenarioId, Scenario>;
const FALLBACK = { a: fa, b: fb, c: fc } as unknown as Record<ScenarioId, Recommendation>;

export const SCENARIO_IDS: ScenarioId[] = ["a", "b", "c"];

export const SCENARIOS = Object.fromEntries(
  SCENARIO_IDS.map((id) => {
    const scenario = DATA[id];
    return [
      id,
      {
        id,
        scenario,
        merchant: MERCHANTS[scenario.merchantId],
        features: computeFeatures(scenario),
        fallback: FALLBACK[id],
      },
    ];
  }),
) as Record<ScenarioId, { id: ScenarioId; scenario: Scenario; merchant: Merchant; features: ReturnType<typeof computeFeatures>; fallback: Recommendation }>;

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
