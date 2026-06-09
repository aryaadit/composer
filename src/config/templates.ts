/**
 * Vibe-driven stop-1 venue role hints.
 *
 * Phase 2 collapsed variable-length vibe templates into a single 2-stop
 * default ([stop_1, main]). The only vibe-specific lever that remains
 * is the venueRoleHint applied to stop 1 — drinks_led biases toward
 * bars, activity_food toward activity venues, and the others apply no
 * hint. Vibe still influences candidate scoring across the board; this
 * map only governs the stop-1 candidate filter bias.
 *
 * To add a new vibe: add a hint here. Null means no role bias —
 * scoring alone picks from the full STOP_1_POOL.
 */

import type { VibeSlug } from "@/config/vibes";
import type { VenueRole } from "@/types";

const VIBE_STOP_1_HINTS: Record<VibeSlug, VenueRole | null> = {
  food_forward: null,
  drinks_led: "drinks",
  activity_food: "activity",
  mix_it_up: null, // resolved at runtime by randomly picking a concrete vibe
};

const CONCRETE_VIBES: VibeSlug[] = [
  "food_forward",
  "drinks_led",
  "activity_food",
];

/**
 * Get the stop-1 venueRoleHint for a given vibe.
 *
 * For concrete vibes (food_forward, drinks_led, activity_food), returns
 * the hint directly. For "mix_it_up" (or any unknown vibe — e.g. legacy
 * share-links carrying the old "walk_explore"), randomly picks one of
 * the concrete vibes via the seeded PRNG and returns ITS hint.
 *
 * Returning null means "no role bias — pick the best opener-or-closer
 * by score alone."
 */
export function getStop1Hint(
  vibe: string,
  random: () => number,
): VenueRole | null {
  if (vibe in VIBE_STOP_1_HINTS) {
    const hint = VIBE_STOP_1_HINTS[vibe as VibeSlug];
    if (hint !== null) return hint;
    if (vibe !== "mix_it_up") return null;
  }
  // mix_it_up or unknown vibe: random concrete vibe selection
  const picked = CONCRETE_VIBES[Math.floor(random() * CONCRETE_VIBES.length)];
  return VIBE_STOP_1_HINTS[picked];
}
