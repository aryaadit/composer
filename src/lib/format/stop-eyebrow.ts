// Position-aware stop eyebrow labels. The label is derived from the
// stop's POSITION in the night, not its scored role slug — the role
// slug is an algorithm input (composer.ts uses it for pick ordering)
// and was leaking into UI as "Start here" on stops that ended a 3-stop
// plan (board item 2 bug).
//
// Contract:
//   - The first stop in the night always reads "Start here".
//   - The main stop (the geographic anchor and product spine) reads
//     "The main event".
//   - Any stop sitting AFTER the main reads the closer label
//     ("Last call" today — see commit body for the two alternates
//     considered).
//   - Pre-main non-first stops (rare 4-stop pattern) fall through to
//     the role-driven label so we never invent copy we don't own.
//
// The helper is the single source of truth — every surface that
// renders a stop eyebrow (itinerary view, saved hero, share view,
// any future surface) consumes it. Adding a fifth stop position or a
// new closer label is one edit, here.

import { ROLE_LABELS } from "@/config/roles";
import type { ItineraryStop } from "@/types";

export const STOP_EYEBROW = {
  first: "Start here",
  main: "The main event",
  // "Last call" carries the right bar/cocktail register for a closer:
  // confident, time-aware, NYC. Considered "Nightcap" (cozier, lower
  // energy — already the ROLE_LABELS closer) and "One more" (more
  // colloquial). "Last call" wins on register + clarity; see commit.
  closer: "Last call",
} as const;

/**
 * Derive the display eyebrow for a stop given its position in the
 * itinerary. Pass the full stops array so the helper can find the
 * main stop's index — needed to decide whether a non-main stop sits
 * before (pre-main) or after (closer) the spine.
 */
export function getStopEyebrowLabel(
  stop: ItineraryStop,
  index: number,
  stops: ReadonlyArray<ItineraryStop>,
): string {
  if (index === 0) return STOP_EYEBROW.first;

  const mainIndex = stops.findIndex((s) => s.role === "main");

  if (mainIndex !== -1) {
    if (index === mainIndex) return STOP_EYEBROW.main;
    if (index > mainIndex) return STOP_EYEBROW.closer;
  } else if (index === stops.length - 1) {
    // No main in the plan (unusual — composer almost always plants
    // one) but the last stop still functions as the closer. Avoids a
    // silent "Start here" relapse on a tail position.
    return STOP_EYEBROW.closer;
  }

  // Pre-main non-first. Honest fall-through to the role-driven label
  // so we never invent copy for a position the spec didn't name.
  return ROLE_LABELS[stop.role] ?? stop.role;
}
