// Calendar export helpers — Google Calendar deep link + .ics file.
//
// The user picks a start time in NYC local wall-clock. Calendars want
// UTC. NYC observes EDT (UTC-4) in summer and EST (UTC-5) in winter,
// switching on the second Sunday of March and first Sunday of November.
// We discover the active offset via Intl.DateTimeFormat's `shortOffset`
// timeZoneName part (Node 18+, supported in Next.js's runtime) and
// fall back to a simple month-based heuristic if that's unavailable.
//
// Time window also wraps past midnight for late starts (21:00 → 02:00
// next day). resolveItineraryCalendarTimes rolls the end date forward
// when endTime ≤ startTime as HH:MM.

import type { ItineraryResponse } from "@/types";

const NYC_TIMEZONE = "America/New_York";

/**
 * Active NYC UTC offset (in hours) for a given calendar date.
 *
 *   - EDT (UTC-4): mid-March through early November
 *   - EST (UTC-5): otherwise
 *
 * We probe via Intl.DateTimeFormat at noon UTC on the target date —
 * stable past the DST transition hour. Falls back to a month-based
 * heuristic if shortOffset isn't available.
 *
 * Exported for tests.
 */
export function getNycOffsetHoursForDate(
  year: number,
  month: number,
  day: number,
): number {
  const refUtc = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: NYC_TIMEZONE,
      timeZoneName: "shortOffset",
    }).formatToParts(refUtc);
    const offsetStr =
      parts.find((p) => p.type === "timeZoneName")?.value ?? "";
    const match = /^GMT([+-])(\d{1,2})(?::(\d{2}))?$/.exec(offsetStr);
    if (match) {
      const sign = match[1] === "-" ? -1 : 1;
      const hours = parseInt(match[2], 10);
      // Minute component (rare for whole-hour offsets like NYC) ignored —
      // we floor to whole hours for the calendar conversion.
      return sign * hours;
    }
  } catch {
    // Fall through to month-based heuristic.
  }
  // Heuristic — wrong on the DST boundary days, OK elsewhere.
  return month >= 4 && month <= 10 ? -4 : -5;
}

/**
 * Convert a NYC local wall-clock moment to a UTC Date.
 *   nycLocalToUtc("2026-06-09", "19:00") → 2026-06-09T23:00:00Z (EDT)
 *   nycLocalToUtc("2026-12-09", "19:00") → 2026-12-10T00:00:00Z (EST)
 */
export function nycLocalToUtc(dayISO: string, timeHHMM: string): Date {
  const [y, m, d] = dayISO.split("-").map(Number);
  const [h, mn] = timeHHMM.split(":").map(Number);
  const offsetHours = getNycOffsetHoursForDate(y, m, d);
  // UTC = NYC − offsetHours. Since NYC offsets are negative (UTC-4/-5),
  // (h − offsetHours) is (h + 4) or (h + 5). Date.UTC normalizes any
  // hour overflow into the next day automatically.
  return new Date(Date.UTC(y, m - 1, d, h - offsetHours, mn, 0));
}

/**
 * Format a Date as YYYYMMDDTHHMMSSZ — the compact form .ics and
 * Google Calendar URLs both accept.
 */
export function formatIcsTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getUTCFullYear()}` +
    `${pad(date.getUTCMonth() + 1)}` +
    `${pad(date.getUTCDate())}` +
    "T" +
    `${pad(date.getUTCHours())}` +
    `${pad(date.getUTCMinutes())}` +
    `${pad(date.getUTCSeconds())}` +
    "Z"
  );
}

function addOneDay(dayISO: string): string {
  const [y, m, d] = dayISO.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(
    dt.getUTCDate(),
  )}`;
}

export interface CalendarTimes {
  start: Date;
  end: Date;
}

/**
 * Resolve UTC start/end Dates for an itinerary's calendar entry.
 * Handles the end-after-midnight case: when endTime (HH:MM) is at or
 * before startTime, the end is on the NEXT day.
 *
 * Exported for tests.
 */
export function resolveItineraryCalendarTimes(
  itinerary: ItineraryResponse,
): CalendarTimes {
  const day = itinerary.inputs.day;
  const startTime = itinerary.inputs.startTime;
  const endTime = itinerary.inputs.endTime ?? startTime;

  const start = nycLocalToUtc(day, startTime);

  const [startH, startM] = startTime.split(":").map(Number);
  const [endH, endM] = endTime.split(":").map(Number);
  const endIsNextDay = endH * 60 + endM <= startH * 60 + startM;

  const endDay = endIsNextDay ? addOneDay(day) : day;
  const end = nycLocalToUtc(endDay, endTime);
  return { start, end };
}

function buildDescription(itinerary: ItineraryResponse): string {
  const lines: string[] = [];
  for (let i = 0; i < itinerary.stops.length; i++) {
    const stop = itinerary.stops[i];
    const addr = stop.venue.address;
    lines.push(
      addr
        ? `${i + 1}. ${stop.venue.name} — ${addr}`
        : `${i + 1}. ${stop.venue.name}`,
    );
  }
  return lines.join("\n");
}

function getLocation(itinerary: ItineraryResponse): string {
  const first = itinerary.stops[0];
  if (!first) return "";
  return first.venue.address ?? first.venue.name;
}

/**
 * Google Calendar "render" deep link with the itinerary pre-filled.
 * Opens in a new tab; the user confirms / edits in their own
 * Calendar UI.
 */
export function buildGoogleCalendarUrl(itinerary: ItineraryResponse): string {
  const { start, end } = resolveItineraryCalendarTimes(itinerary);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: itinerary.header.title,
    dates: `${formatIcsTimestamp(start)}/${formatIcsTimestamp(end)}`,
    details: buildDescription(itinerary),
    location: getLocation(itinerary),
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Escape a string for safe inclusion in .ics text fields per RFC 5545. */
function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

/**
 * Build the .ics file content as a string. Single VEVENT, GREGORIAN
 * calendar. Lines joined with CRLF per RFC 5545.
 *
 * `uid` should be a stable identifier so re-imports update the event
 * rather than duplicating it. The caller passes the saved itinerary's
 * id (combined with the domain) so a given saved plan always produces
 * the same UID.
 */
export function generateIcsContent(
  itinerary: ItineraryResponse,
  uid: string,
  now: Date = new Date(),
): string {
  const { start, end } = resolveItineraryCalendarTimes(itinerary);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//composer.onpalate.com//Composer//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${formatIcsTimestamp(now)}`,
    `DTSTART:${formatIcsTimestamp(start)}`,
    `DTEND:${formatIcsTimestamp(end)}`,
    `SUMMARY:${escapeIcsText(itinerary.header.title)}`,
    `DESCRIPTION:${escapeIcsText(buildDescription(itinerary))}`,
    `LOCATION:${escapeIcsText(getLocation(itinerary))}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.join("\r\n");
}

/** Browser Blob wrapper for the .ics content (triggers <a download>). */
export function generateIcsBlob(
  itinerary: ItineraryResponse,
  uid: string,
): Blob {
  return new Blob([generateIcsContent(itinerary, uid)], {
    type: "text/calendar;charset=utf-8",
  });
}

/**
 * Build the canonical UID for an itinerary's .ics event. Stable across
 * re-exports of the same saved plan so calendar apps update rather
 * than duplicate.
 */
export function buildIcsUid(savedItineraryId: string): string {
  return `${savedItineraryId}@composer.onpalate.com`;
}
