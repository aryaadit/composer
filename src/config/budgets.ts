// Budget taxonomy + the single source of truth for the price-tier →
// dollars mapping. Both `spendEstimate()` (per-stop) and
// `calculateTotalSpend()` (itinerary-wide) draw from this file so the
// dollar ranges stay in sync.
//
// Slugs are snake_case to match the sheet and the rest of the taxonomy.

import { BUDGET_TIERS as GEN_TIERS } from "./generated/budgets";

// Descriptions live here (UI copy, not scoring config).
const BUDGET_DESCRIPTIONS: Record<string, string> = {
  casual: "Good times, low key",
  nice_out: "A proper night",
  splurge: "Go all in",
  all_out: "The full experience",
  no_preference: "Surprise me",
};

export const BUDGETS = Object.entries(GEN_TIERS).map(([slug, { label, tiers }]) => ({
  slug,
  label,
  description: BUDGET_DESCRIPTIONS[slug] ?? "",
  tiers: tiers as readonly number[],
}));

export type BudgetSlug = keyof typeof GEN_TIERS;

// budget slug → allowed price tiers (used by `lib/scoring.ts` hard filter).
export const BUDGET_TIER_MAP: Record<string, readonly number[]> = Object.fromEntries(
  BUDGETS.map((b) => [b.slug, b.tiers])
);

// Canonical price ranges by tier.
//   Tier 1 = $    — casual, under $30/person
//   Tier 2 = $$   — nice out, $35-65/person
//   Tier 3 = $$$  — splurge, $75-150/person
//   Tier 4 = $$$$ — all out, $150+/person (fine dining, tasting menus)
export const PRICE_TIER_RANGES: Record<number, readonly [number, number]> = {
  1: [15, 30],
  2: [35, 65],
  3: [75, 150],
  4: [150, 300],
};

export const DEFAULT_PRICE_RANGE: readonly [number, number] = [30, 60];

function rangeForTier(tier: number): readonly [number, number] {
  return PRICE_TIER_RANGES[tier] ?? DEFAULT_PRICE_RANGE;
}

/** Formatted single-stop spend estimate. */
export function spendEstimate(tier: number): string {
  const [lo, hi] = rangeForTier(tier);
  return `$${lo}–${hi}`;
}

/** Formatted sum across every stop in the itinerary. */
export function calculateTotalSpend(tiers: readonly number[]): string {
  let low = 0;
  let high = 0;
  for (const tier of tiers) {
    const [lo, hi] = rangeForTier(tier);
    low += lo;
    high += hi;
  }
  return `$${low}–${high}`;
}
