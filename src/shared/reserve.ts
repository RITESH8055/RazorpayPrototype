// Trust and reserve logic (PRD v0.2, A9 and B7). Every amount shown on screen comes from
// these functions. Model output never feeds an amount directly. Thresholds are assumed placeholders.
import type { Check, History, Pattern, TriggerFlag, TrustLevel } from "../lib/types";

export const TRUST_RULES = {
  buildingMinOrders: 500,
  trustedMinOrders: 5000,
  newMaxDays: 30,
  trustedMinDays: 90,
  maxDisputeRatePct: 0.5,
} as const;

export const DISCOUNT: Record<TrustLevel, number> = { New: 0, Building: 0.25, Trusted: 0.5 };
export const DISCOUNT_CEILING = 0.5;
export const RESERVE_FLOOR_SHARE = 0.5; // an unresolved pattern always keeps at least half its value in reserve
export const DISPUTE_WINDOW_DAYS = 30; // assumed

export function trustLevel(h: Pick<History, "clean_delivered_orders" | "dispute_rate_pct" | "days_on_razorpay">): TrustLevel {
  const clean = h.dispute_rate_pct < TRUST_RULES.maxDisputeRatePct;
  if (h.clean_delivered_orders > TRUST_RULES.trustedMinOrders && h.days_on_razorpay > TRUST_RULES.trustedMinDays && clean) return "Trusted";
  if (h.clean_delivered_orders >= TRUST_RULES.buildingMinOrders && h.days_on_razorpay >= TRUST_RULES.newMaxDays && clean) return "Building";
  return "New";
}

/** Trust discount for one pattern. Any pattern-change trigger resets the pattern to New (0%). */
export function discount(level: TrustLevel, patternTriggers: TriggerFlag[]): number {
  if (patternTriggers.length > 0) return 0;
  return Math.min(DISCOUNT[level], DISCOUNT_CEILING);
}

export function reserveFloor(unresolvedValue: number) {
  return unresolvedValue > 0 ? Math.round(unresolvedValue * RESERVE_FLOOR_SHARE) : 0;
}

/** reserve = unresolved × (1 − discount), never below the floor while the dispute window is open. */
export function reserve(unresolvedValue: number, disc: number) {
  if (unresolvedValue <= 0) return 0;
  return Math.max(Math.round(unresolvedValue * (1 - disc)), reserveFloor(unresolvedValue));
}

export const PAYER_CHECK = "Payer matches document's buyer";
export const REGISTRY_CHECK = "GSTIN registry status and legal name";
export const GSTIN_CHECK = "GSTIN format valid";

/**
 * The guarantee: money releases only when the payer on the actual payments matches the
 * document's buyer, and the government registry confirms that buyer's GSTIN. Editing a
 * document cannot change payment or registry data, so text alone can never move money.
 */
export function releaseNow(matchedValue: number, checks: Check[]) {
  const pass = (name: string) => checks.find((c) => c.name === name)?.pass === true;
  return pass(PAYER_CHECK) && pass(REGISTRY_CHECK) && pass(GSTIN_CHECK) ? matchedValue : 0;
}

/**
 * One round per pattern (PRD A10): a revised reply can never release more than the first
 * answer did. Anything above that waits for the analyst.
 */
export function capRevision(release: number, firstAnswerRelease: number) {
  return Math.min(release, firstAnswerRelease);
}

/** Clamp an analyst's modified reserve into [floor, unresolved]. */
export function clampReserve(value: number, unresolvedValue: number) {
  return Math.min(unresolvedValue, Math.max(reserveFloor(unresolvedValue), Math.round(value)));
}

export interface Settlement {
  release: number;
  unresolved: number;
  disc: number;
  reserve: number;
  floor: number;
}

/** The recommendation for one pattern, from check results. */
export function settle(pattern: Pattern, level: TrustLevel, matchedValue: number, checks: Check[]): Settlement {
  const release = Math.min(pattern.value, releaseNow(matchedValue, checks));
  const unresolved = pattern.value - release;
  const disc = discount(level, pattern.trigger_flags);
  return { release, unresolved, disc, reserve: reserve(unresolved, disc), floor: reserveFloor(unresolved) };
}

export function addDays(iso: string, days: number) {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
