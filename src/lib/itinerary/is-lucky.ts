// Canonical predicate for the lucky-itinerary visual layer (banner +
// wavy connectors + title die). The mode lives on inputs and survives
// JSON.stringify into composer_saved_itineraries, so this predicate
// works on both fresh results and saved revisits.
//
// Daily picks are NOT lucky — they render as standard itineraries.
// Legacy saved itineraries without the mode field default to standard.
//
// One predicate, one place. Future components MUST consume this helper
// rather than spelling `inputs?.mode === "lucky"` inline — it keeps the
// gating contract central and grep-able when (e.g.) a new mode lands.

import type { ItineraryResponse } from "@/types";

export function isLuckyItinerary(
  inputs: ItineraryResponse["inputs"] | undefined | null,
): boolean {
  return inputs?.mode === "lucky";
}
