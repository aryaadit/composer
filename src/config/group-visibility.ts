// Neighborhood-group visibility gate, replacing the venueCount < 25
// rule. A group renders in the picker iff the chosen statistic of its
// three native itinerary counts (casual / nice_out / splurge,
// see scripts/native-composability.ts) clears `bar`. Within a rendered
// group, an individual budget tier is selectable iff that tier's
// itinerary count clears the same bar.
//
// Both predicates read from one config (`GROUP_VISIBILITY`) so the
// strict variant ("worst-tier" rule) is a one-line flip. Adding a third
// mode (e.g. "any-tier") would be a similarly local change.
//
// Native composability is computed against the strictest common slot
// (Friday evening, all hard filters active, NO relaxation / cascade /
// widening / degradation). A group that fails the gate cannot compose
// a 2-stop itinerary natively — anything it produces in prod relies on
// the silent cascades documented in docs/algorithm-relaxation-audit.md.

import type { NeighborhoodGroup } from "@/config/generated/neighborhoods";

/** Budget tiers the questionnaire actually offers. Mirrors
 * `COMPOSE_BUDGET_SLUGS` in src/config/budgets.ts; intentionally narrower
 * than `BudgetSlug` (which still includes legacy all_out / no_preference
 * for saved-itinerary backward compat). */
export type ComposeTier = "casual" | "nice_out" | "splurge";
export const COMPOSE_TIERS: readonly ComposeTier[] = [
  "casual",
  "nice_out",
  "splurge",
] as const;

/** Visibility mode + bar. The bar applies to BOTH the group-visibility
 * predicate (against the chosen statistic) and the per-tier selectability
 * predicate (against that tier's count).
 *
 *   mode "mid_tier" (current): the median of the three tier counts must
 *     clear `bar`. Tolerant of one weak tier; surfaces groups that work
 *     at most user choices.
 *   mode "worst_tier" (strict variant): the minimum of the three tier
 *     counts must clear `bar`. Surfaces only groups that work at every
 *     user choice.
 *
 * Flipping `mode` is the only edit needed to switch rules — every
 * consumer reads through `isGroupVisible` / `isTierSelectable`. */
export const GROUP_VISIBILITY = {
  mode: "mid_tier" as "mid_tier" | "worst_tier",
  bar: 25,
} as const;

/** Brand-voice copy shown under a disabled budget tier card. One line,
 * no numbers, observational. Lives here so the disabled state has a
 * single owner across surfaces. Per BRAND_VOICE.md "Utility copy is
 * brief and human" + "no hedge". */
export const TIER_UNAVAILABLE_COPY = "Not our strong suit here";

function sortedTierCounts(g: NeighborhoodGroup): number[] {
  return COMPOSE_TIERS.map((t) => g.itinerariesByTier[t]).sort(
    (a, b) => a - b,
  );
}

/** True iff a group should render in the neighborhood picker under
 * `GROUP_VISIBILITY.mode` and `bar`. */
export function isGroupVisible(g: NeighborhoodGroup): boolean {
  const c = sortedTierCounts(g);
  // 3 values → index 0 = min (worst), index 1 = median (mid).
  const stat = GROUP_VISIBILITY.mode === "worst_tier" ? c[0] : c[1];
  return stat >= GROUP_VISIBILITY.bar;
}

/** True iff a budget tier is selectable inside a given group — used to
 * disable cards on the budget step of the questionnaire. */
export function isTierSelectable(
  g: NeighborhoodGroup,
  tier: ComposeTier,
): boolean {
  return g.itinerariesByTier[tier] >= GROUP_VISIBILITY.bar;
}

/** True iff a tier is selectable for ANY of the groups the user picked
 * on the neighborhood step. The questionnaire pools venues across
 * selected groups (see CompositionShell.handleNeighborhoodContinue +
 * scoring.ts:166-167), so a tier is disabled at the budget step only
 * when no selected group can serve it. */
export function isTierSelectableForGroups(
  groups: NeighborhoodGroup[],
  tier: ComposeTier,
): boolean {
  if (groups.length === 0) return true; // no constraint yet → don't disable
  return groups.some((g) => isTierSelectable(g, tier));
}
