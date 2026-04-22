// Booking URL builders for reservation platforms.
// Two modes:
//   1. buildResyBookingUrl — venue page with date + seats pre-filled (fallback)
//   2. buildResySlotBookingUrl — widget deep-link to "Complete reservation" with
//      specific slot pre-selected (Corner's approach, confirmed via network capture)

import type { AvailabilitySlot } from "./resy";

/**
 * Fallback: venue page URL with date + seats. Used when no slot is
 * selected or when the slot-specific URL fails to build.
 */
export function buildResyBookingUrl(
  slug: string,
  date: string,
  partySize: number
): string {
  return `https://resy.com/cities/ny/venues/${slug}?date=${date}&seats=${partySize}`;
}

/**
 * Slot tokens look like:
 *   rgs://resy/69589/2518396/2/2026-04-22/2026-04-22/17:00:00/2/1
 *                    ^^^^^^^ templateId (Resy's config/shift ID)
 */
export function parseTemplateIdFromToken(token: string): number {
  if (!token.startsWith("rgs://resy/")) {
    throw new Error(`Invalid token prefix: ${token}`);
  }
  const stripped = token.replace("rgs://resy/", "");
  const parts = stripped.split("/");
  if (parts.length < 2) {
    throw new Error(`Malformed token (too few segments): ${token}`);
  }
  const templateId = parseInt(parts[1], 10);
  if (isNaN(templateId)) {
    throw new Error(`Non-numeric templateId in token: ${token}`);
  }
  return templateId;
}

/**
 * Build the Resy widget deep-link that lands on "Complete your reservation"
 * with date, seats, and time pre-selected.
 *
 * Uses the undocumented widgets.resy.com/#/reservation-details route.
 * Same approach Corner.inc uses (confirmed via Proxyman network capture).
 */
export function buildResySlotBookingUrl(
  slug: string,
  date: string,
  partySize: number,
  slot: AvailabilitySlot,
  venueName: string,
  venueId: number
): string {
  const reservation = {
    venueName,
    templateId: parseTemplateIdFromToken(slot.token),
    time: slot.time,
    token: slot.token,
    type: slot.type,
    featureRecaptcha: false,
    allow_bypass_payment_method: 1,
    isEligible: true,
    hasAddOns: false,
    hasMenus: false,
  };

  const params = new URLSearchParams({
    reservation: JSON.stringify(reservation),
    date,
    seats: String(partySize),
    tableConfigId: slot.token,
    venueId: String(venueId),
    ref: `https://resy.com/cities/new-york-ny/venues/${slug}`,
    src: "resy.com-venue-details",
  });

  return `https://widgets.resy.com/#/reservation-details?${params.toString()}`;
}
