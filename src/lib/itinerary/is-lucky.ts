// Canonical predicate for the lucky-itinerary visual layer (crown +
// wavy connectors + title die). The mode lives on inputs and the
// predicate works across all three surfaces:
//
//   - Fresh /itinerary: read from sessionStorage, mode preserved.
//   - Shared /itinerary/share/[id]: composer_shared_itineraries
//     persists the FULL ItineraryResponse as JSONB, so mode round-
//     trips losslessly.
//   - Saved /itinerary/saved/[id]: composer_saved_itineraries
//     persists inputs as DECOMPOSED COLUMNS, so mode needs its own
//     `mode` column — added 2026-06-12 — and the save+hydrate path
//     must read/write it explicitly. The hydrator (saved-hydration.ts)
//     restores `inputs.mode` from the row. Saves prior to the
//     migration carry NULL → undefined on inputs → not-lucky, which
//     is honest behavior for legacy rows.
//
// Daily picks are NOT lucky — they render as standard itineraries.
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
