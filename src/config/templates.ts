/**
 * Vibe-driven stop-1 venue role hints.
 *
 * Phase 2 collapsed variable-length vibe templates into a single 2-stop
 * default. The only vibe-specific lever that remains is the
 * venueRoleHint applied to stop 1 — drinks_led biases toward bars,
 * food_forward applies no hint. Vibe still influences candidate
 * scoring across the board; this map only governs the stop-1
 * candidate filter bias.
 *
 * Phase 7 dropped `mix_it_up` from the questionnaire; 2026-06-13
 * dropped `activity_food` along with the Activity focus shape — the
 * composer no longer composes an activity-first night. Legacy saved
 * itineraries with vibe="mix_it_up" or vibe="activity_food" still
 * render (vibe is a string slug; missing keys fall through). On the
 * compose path, if an unknown vibe reaches `getStop1Hint` (a legacy
 * share-link with `walk_explore`, an old session restore with
 * `mix_it_up`, a lingering `activity_food`, etc.), we fall back to a
 * random concrete vibe's hint via the seeded PRNG — same graceful
 * degradation as before.
 */

import type { VibeSlug } from "@/config/vibes";
import type { VenueRole } from "@/types";

const VIBE_STOP_1_HINTS: Record<VibeSlug, VenueRole | null> = {
  food_forward: null,
  drinks_led: "drinks",
};

const CONCRETE_VIBES: VibeSlug[] = ["food_forward", "drinks_led"];

/**
 * Get the stop-1 venueRoleHint for a given vibe.
 *
 * For concrete vibes (food_forward, drinks_led), returns the hint
 * directly. For any unknown vibe (legacy `mix_it_up`, `activity_food`,
 * old share-links carrying `walk_explore`, etc.), randomly picks one
 * of the concrete vibes via the seeded PRNG and returns its hint.
 * Null means "no role bias — pick the best opener-or-closer by score
 * alone."
 */
export function getStop1Hint(
  vibe: string,
  random: () => number,
): VenueRole | null {
  if (vibe in VIBE_STOP_1_HINTS) {
    return VIBE_STOP_1_HINTS[vibe as VibeSlug];
  }
  // Unknown vibe — random concrete vibe selection for graceful degradation.
  const picked = CONCRETE_VIBES[Math.floor(random() * CONCRETE_VIBES.length)];
  return VIBE_STOP_1_HINTS[picked];
}
