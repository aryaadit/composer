// Booking platform detection from reservation URL patterns.
//
// Right now this just maps a URL to a display label so the stop card can
// say "Reserve on Resy" instead of a generic "Reserve" button. Keeping it
// in its own file because the next iteration (per Reid's booking-links.js
// audit) is full deep-link construction with date/time/party-size params,
// which deserves more room.

export type BookingPlatformId = "resy" | "opentable" | "tock" | "generic";

export interface BookingPlatform {
  id: BookingPlatformId;
  label: string;
}

const GENERIC: BookingPlatform = { id: "generic", label: "Make a Reservation" };

// Some sheet rows use the reservation_url column as a free-text status
// (e.g. "Walk-in Only") rather than an actual URL. Treat anything that
// isn't an http(s) URL as not-a-link so we don't render broken CTAs that
// browsers resolve as relative paths.
export function isValidReservationUrl(
  url: string | null | undefined
): url is string {
  if (!url) return false;
  return /^https?:\/\//i.test(url);
}

export function detectBookingPlatform(url: string | null | undefined): BookingPlatform | null {
  if (!isValidReservationUrl(url)) return null;
  const u = url.toLowerCase();
  if (u.includes("resy.com")) return { id: "resy", label: "Reserve on Resy" };
  if (u.includes("opentable.com")) return { id: "opentable", label: "Reserve on OpenTable" };
  if (
    u.includes("exploretock.com") ||
    u.includes("tockify.com") ||
    u.includes("tocktix.com")
  ) {
    return { id: "tock", label: "Reserve on Tock" };
  }
  return GENERIC;
}
