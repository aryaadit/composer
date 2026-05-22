/**
 * Vibe-driven itinerary templates.
 *
 * Each vibe maps to a list of stop patterns ordered largest→smallest.
 * The composer (via `planStopMix`) picks the first whose time budget
 * fits the user's window.
 *
 * Each slot in a pattern has a canonical `role` (opener, main, closer)
 * and an optional `venueRoleHint` that biases candidate selection toward
 * venues whose raw `stop_roles` array includes that hint. When the
 * hinted pool is empty, `pickBestForRole` falls back to any venue that
 * matches the canonical role (see scoring.ts cascade relaxation).
 *
 * Example: a "drinks_led" opener with `venueRoleHint: "drinks"` will
 * prefer bars/cocktail venues, but if none are nearby it falls back to
 * any opener-eligible venue.
 *
 * To add a new vibe template: add an entry to VIBE_TEMPLATES keyed by
 * the vibe slug, with patterns largest→smallest.
 */

import type { StopPattern } from "@/types";
import type { VibeSlug } from "@/config/vibes";

export const VIBE_TEMPLATES: Record<VibeSlug, StopPattern[]> = {
  food_forward: [
    [{ role: "opener" }, { role: "main" }, { role: "closer" }, { role: "closer" }],
    [{ role: "opener" }, { role: "main" }, { role: "closer" }],
    [{ role: "opener" }, { role: "main" }],
  ],
  drinks_led: [
    [
      { role: "opener", venueRoleHint: "drinks" },
      { role: "main" },
      { role: "closer", venueRoleHint: "drinks" },
      { role: "closer", venueRoleHint: "drinks" },
    ],
    [
      { role: "opener", venueRoleHint: "drinks" },
      { role: "main" },
      { role: "closer", venueRoleHint: "drinks" },
    ],
    [
      { role: "main" },
      { role: "closer", venueRoleHint: "drinks" },
    ],
  ],
  activity_food: [
    [
      { role: "opener", venueRoleHint: "activity" },
      { role: "main" },
      { role: "closer" },
      { role: "closer" },
    ],
    [
      { role: "opener", venueRoleHint: "activity" },
      { role: "main" },
      { role: "closer" },
    ],
    [
      { role: "opener", venueRoleHint: "activity" },
      { role: "main" },
    ],
  ],
  mix_it_up: [], // resolved at runtime by random pick from a concrete vibe
};

const CONCRETE_VIBES: VibeSlug[] = [
  "food_forward",
  "drinks_led",
  "activity_food",
];

/**
 * Get the stop pattern templates for a given vibe.
 *
 * For concrete vibes (food_forward, drinks_led, activity_food), returns
 * the vibe's template list directly. For "mix_it_up" (empty templates),
 * randomly picks one of the concrete vibes using the seeded PRNG.
 *
 * Unknown vibes (e.g. legacy `walk_explore` in old share-links / saved
 * itineraries) also fall through to the random concrete pick — degrades
 * gracefully instead of throwing.
 *
 * @param vibe   - Vibe slug from the questionnaire.
 * @param random - Seeded PRNG for deterministic "mix_it_up" resolution.
 * @returns Array of stop patterns, largest→smallest.
 */
export function getTemplatesForVibe(
  vibe: string,
  random: () => number
): StopPattern[] {
  const templates = VIBE_TEMPLATES[vibe as VibeSlug];
  if (templates && templates.length > 0) return templates;
  // mix_it_up: pick a random concrete vibe
  const picked = CONCRETE_VIBES[Math.floor(random() * CONCRETE_VIBES.length)];
  return VIBE_TEMPLATES[picked];
}
