// Booking URL builders for reservation platforms.
// Phase 1: Resy only. Pre-fills date + party size on the venue's
// Resy page. Slot-token deep-linking is Phase 3.

export function buildResyBookingUrl(
  slug: string,
  date: string,
  partySize: number
): string {
  return `https://resy.com/cities/ny/venues/${slug}?date=${date}&seats=${partySize}`;
}
