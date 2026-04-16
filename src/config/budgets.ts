// Budget taxonomy + the single source of truth for the price-tier →
// dollars mapping. Both `spendEstimate()` (per-stop) and
// `calculateTotalSpend()` (itinerary-wide) draw from this file so the
// dollar ranges stay in sync.
//
// Four tiers: $ (casual) through $$$$ (fine dining, $150+/person).

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
    slug: "all-out",
    label: "$$$$ All Out",
    description: "The full experience",
    tiers: [4] as readonly number[],
  },
  {
    slug: "no-preference",
    label: "No Preference",
    description: "Surprise me",
    tiers: [1, 2, 3, 4] as readonly number[],
  },
] as const;

export type BudgetSlug = (typeof BUDGETS)[number]["slug"];

// budget slug → allowed price tiers (used by `lib/scoring.ts` hard filter).
export const BUDGET_TIER_MAP: Record<BudgetSlug, readonly number[]> = Object.fromEntries(
  BUDGETS.map((b) => [b.slug, b.tiers])
) as Record<BudgetSlug, readonly number[]>;

// Canonical price ranges by tier.
//   Tier 1 = $    — casual, under $30/person
//   Tier 2 = $$   — nice out, $35-65/person
//   Tier 3 = $$$  — splurge, $75-150/person
//   Tier 4 = $$$$ — all out, $150+/person (fine dining, tasting menus)
// Used by both the per-stop spend estimate and the itinerary total.
export const PRICE_TIER_RANGES: Record<number, readonly [number, number]> = {
  1: [15, 30],
  2: [35, 65],
  3: [75, 150],
  4: [150, 300],
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
