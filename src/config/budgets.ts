// Budget taxonomy + the single source of truth for the price-tier →
// dollars mapping. Both `spendEstimate()` (per-stop) and
// `calculateTotalSpend()` (itinerary-wide) draw from this file so the
// dollar ranges stay in sync.
//
// Slugs are snake_case to match the sheet and the rest of the taxonomy.

import { BUDGET_TIERS as GEN_TIERS } from "./generated/budgets";

// Descriptions live here (UI copy, not scoring config).
// Display label overrides. The generated labels include ($) symbols;
// these provide cleaner questionnaire copy.
const BUDGET_LABEL_OVERRIDES: Record<string, string> = {
  casual: "Budget",
  nice_out: "Solid",
  splurge: "Splurge",
  all_out: "All Out",
};

const BUDGET_DESCRIPTIONS: Record<string, string> = {
  casual: "Around $30–60 per person, nothing fussy",
  nice_out: "Roughly $60–120, a proper sit-down",
  splurge: "$120–200, treat yourself",
  all_out: "$200+, tasting menus and fancy cocktails",
  no_preference: "Any price point",
};

// Phase 1 narrowed the user-facing budget set to three. `all_out` and
// `no_preference` are dropped from the questionnaire UI. The canonical
// generated config still includes them so saved/share itineraries
// carrying those values keep rendering — only the compose flow is
// narrowed. Update this list (and `ComposeBudget` in src/types/index.ts)
// together if the user-facing set ever changes again.
const COMPOSE_BUDGET_SLUGS: readonly string[] = [
  "casual",
  "nice_out",
  "splurge",
];

export const BUDGETS = Object.entries(GEN_TIERS)
  .filter(([slug]) => COMPOSE_BUDGET_SLUGS.includes(slug))
  .map(([slug, { label, tiers }]) => ({
    slug,
    label: BUDGET_LABEL_OVERRIDES[slug] ?? label,
    description: BUDGET_DESCRIPTIONS[slug] ?? "",
    tiers: tiers as readonly number[],
  }));

export type BudgetSlug = keyof typeof GEN_TIERS;

// budget slug → allowed price tiers (used by the hard filter in route.ts).
// Downward-permissive: nice_out accepts tier-1 too, splurge accepts tier-2,
// etc. The +15 scoring bonus only fires on exact-primary-tier match (see
// BUDGET_PRIMARY_TIER below) so the bucket's intended tier still dominates.
export const BUDGET_TIER_MAP: Record<string, readonly number[]> = Object.fromEntries(
  BUDGETS.map((b) => [b.slug, b.tiers])
);

// Primary tier per bucket — the "center of mass" the user is really asking
// for. Drives the +15 scoring bonus in lib/scoring.ts: a tier-N venue wins
// over a tier-(N-1) venue (which is allowed by the filter but not the
// intended pick). `no_preference` has no primary tier → no bonus, so the
// signal cancels for those users (which is what no_preference asks for).
export const BUDGET_PRIMARY_TIER: Record<string, number | null> = {
  casual: 1,
  nice_out: 2,
  splurge: 3,
  all_out: 4,
  no_preference: null,
};

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

// Note: `widenBudgetTiers` (±1 in each direction) was removed 2026-05-22
// when BUDGET_TIER_MAP became downward-permissive by default. Thin-pool
// widening now happens inline in /api/generate/route.ts as upward-only
// (adds max_tier+1 to allowedTiers when pool < minBudgetWideningThreshold).

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
