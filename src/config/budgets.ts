// Budget taxonomy + the single source of truth for the price-tier → dollars
// mapping. Previously, these numbers lived in two different files (the
// per-stop `spendEstimate()` in `lib/composer.ts` and the total calculator
// `calculateTotalSpend()` in `app/api/generate/route.ts`), with identical
// values that could silently drift apart. This file holds both.

export const BUDGETS = [
  {
    slug: "casual",
    label: "$ Casual",
    description: "Good times, low key",
    tiers: [1] as readonly number[],
  },
  {
    slug: "nice-out",
    label: "$$ Nice Out",
    description: "A proper night",
    tiers: [2] as readonly number[],
  },
  {
    slug: "splurge",
    label: "$$$ Splurge",
    description: "Go all in",
    tiers: [3] as readonly number[],
  },
  {
    slug: "no-preference",
    label: "No Preference",
    description: "Just make it great",
    tiers: [1, 2, 3] as readonly number[],
  },
] as const;

export type BudgetSlug = (typeof BUDGETS)[number]["slug"];

// budget slug → allowed price tiers (used by `lib/scoring.ts` hard filter).
export const BUDGET_TIER_MAP: Record<BudgetSlug, readonly number[]> = Object.fromEntries(
  BUDGETS.map((b) => [b.slug, b.tiers])
) as Record<BudgetSlug, readonly number[]>;

// Canonical price ranges by tier. Tier 1 = $, Tier 2 = $$, Tier 3 = $$$.
// Used by both the per-stop spend estimate and the itinerary total.
export const PRICE_TIER_RANGES: Record<number, readonly [number, number]> = {
  1: [15, 30],
  2: [35, 65],
  3: [75, 150],
};

// Fallback range when a venue has an unknown price tier. Kept loose so the
// output stays plausible rather than exact.
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
