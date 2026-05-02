"use client";

import { Tooltip } from "./Tooltip";
import type { ItineraryStop } from "@/types";

// Single-pill reservation state. Derived from the stop's availability
// enrichment + venue fields. Exactly one pill renders per venue.
//
// Precedence: has_slots (Resy/OT confirmed) > walk_in > book_ahead > res_required > walk_in_default

export type ReservationState =
  | "resy_available"
  | "opentable_available"
  | "walk_in"
  | "book_ahead"
  | "res_required"
  | "no_reservations";

const PILL_CONFIG: Record<ReservationState, { label: string; tooltip: string }> = {
  resy_available: { label: "Resy", tooltip: "Slots available on Resy." },
  opentable_available: { label: "OpenTable", tooltip: "Slots available on OpenTable." },
  walk_in: { label: "Walk-in", tooltip: "Walk-in friendly — no reservation needed." },
  book_ahead: { label: "Book ahead", tooltip: "Hard to get — book in advance." },
  res_required: { label: "Res required", tooltip: "Timed reservation — lock it in." },
  no_reservations: { label: "Walk-in", tooltip: "Walk-in friendly — timing is loose." },
};

export function deriveReservationState(stop: ItineraryStop): ReservationState {
  const venue = stop.venue;
  const avail = stop.availability;

  // Live availability trumps everything
  if (avail?.status === "has_slots" && avail.slots.length > 0) {
    const platform = venue.reservation_platform?.toLowerCase();
    if (platform === "opentable") return "opentable_available";
    return "resy_available";
  }

  if (avail?.status === "walk_in") return "walk_in";

  // Fall back to static venue data
  const platform = venue.reservation_platform?.toLowerCase();
  if (platform === "none" || platform === "walk_in" || platform === "walk-in") {
    return "walk_in";
  }

  const difficulty = venue.reservation_difficulty ?? 0;
  if (difficulty >= 3) return "book_ahead";

  if (stop.is_fixed || platform === "resy" || platform === "opentable") {
    return "res_required";
  }

  return "no_reservations";
}

export function StopStatusBadge({ stop }: { stop: ItineraryStop }) {
  const state = deriveReservationState(stop);
  const { label, tooltip } = PILL_CONFIG[state];
  return (
    <Tooltip content={tooltip}>
      <span tabIndex={0} className="cursor-default">{label}</span>
    </Tooltip>
  );
}
