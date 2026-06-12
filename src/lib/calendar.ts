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
//
// CRITICAL — Google Calendar deep links require the LITERAL slash
// between start/end timestamps. URLSearchParams percent-encodes it to
// %2F, which Google's parser silently falls back to interpreting as
// local time (producing a +4h/+5h shift in NYC). We build the URL
// manually so the slash stays literal.

import type { ItineraryResponse, ItineraryStop, Venue, WalkSegment } from "@/types";

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
 * Google Calendar URLs both accept. The trailing Z is the UTC marker.
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

// ── Description body (Phase 8 — rich) ────────────────────────

function formatRoleLabel(role: string): string {
  switch (role) {
    case "opener":
      return "Start here";
    case "main":
      return "The main event";
    case "closer":
      return "Nightcap";
    default:
      return role;
  }
}

/**
 * Reservation status line for a venue's description block.
 *
 *   - resy + valid URL       → "Reservations recommended on Resy"
 *   - opentable + valid URL  → "Reservations recommended on OpenTable"
 *   - "Walk-in Only" / null  → "Walk-in welcome"
 *   - other / unknown        → null (line omitted entirely)
 *
 * Exported for tests.
 */
export function reservationStatusFor(venue: Venue): string | null {
  const url = venue.reservation_url;
  if (!url || url === "Walk-in Only") return "Walk-in welcome";
  const platform = venue.reservation_platform;
  if (platform === "resy") return "Reservations recommended on Resy";
  if (platform === "opentable")
    return "Reservations recommended on OpenTable";
  return null;
}

/**
 * Build the calendar-event description body. Used identically in the
 * Google Calendar URL's `details` param and the .ics DESCRIPTION
 * field. The `shareUrl` is embedded in the footer when available;
 * otherwise the footer falls back to a plain "Composed by Composer".
 *
 * Exported for tests.
 */
export function buildDescription(
  itinerary: ItineraryResponse,
  shareUrl: string | null = null,
): string {
  const lines: string[] = [];

  // Subtitle — the Gemini-generated tagline ("Cocktails at Attaboy, …").
  const subtitle = itinerary.header.subtitle?.trim();
  if (subtitle) {
    lines.push(subtitle);
    lines.push("");
  }

  // Per-stop blocks with walk lines between.
  const stops = itinerary.stops ?? [];
  const walks: WalkSegment[] = itinerary.walks ?? [];
  for (let i = 0; i < stops.length; i++) {
    const stop: ItineraryStop = stops[i];
    lines.push(`📍 Stop ${i + 1} · ${formatRoleLabel(stop.role)}`);
    lines.push(stop.venue.name);
    if (stop.venue.address) lines.push(stop.venue.address);
    if (stop.curation_note) lines.push(stop.curation_note);
    const resStatus = reservationStatusFor(stop.venue);
    if (resStatus) lines.push(resStatus);
    lines.push("");

    // Walk to next stop
    if (i < stops.length - 1) {
      const walk = walks[i];
      if (walk) {
        lines.push(`🚶 ${walk.walk_minutes} min walk`);
        lines.push("");
      }
    }
  }

  // Footer. Audit item 6: em dash separator replaced with a three-
  // hyphen rule for plain-text rendering in users' calendar apps.
  lines.push("---");
  if (itinerary.header.estimated_total) {
    lines.push(`Budget: ${itinerary.header.estimated_total}`);
  }
  lines.push(
    shareUrl
      ? `Composed by Composer · ${shareUrl}`
      : "Composed by Composer",
  );

  return lines.join("\n");
}

function getLocation(itinerary: ItineraryResponse): string {
  const first = itinerary.stops?.[0];
  if (!first) return "";
  return first.venue.address ?? first.venue.name;
}

// ── .ics escaping + line folding (RFC 5545) ──────────────────

/** Escape a string for safe inclusion in .ics text fields per RFC 5545. */
function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

/**
 * Fold a long .ics line per RFC 5545 §3.1: lines should not exceed 75
 * octets; continuation lines begin with a space (or tab).
 *
 * We fold at 70 chars (not octets) conservatively — UTF-8 multi-byte
 * chars (the emoji 📍 🚶, the em-dash —) make exact octet counting
 * complex, and modern parsers tolerate ≥75. Iteration via Array.from
 * walks code points, so emoji surrogate pairs stay intact.
 *
 * Exported for tests.
 */
export function foldIcsLine(line: string): string {
  const MAX = 70;
  if (line.length <= MAX) return line;
  const chars = Array.from(line); // code-point iteration (emoji-safe)
  const parts: string[] = [];
  let buf = "";
  let isFirst = true;
  for (const ch of chars) {
    if (buf.length + ch.length > MAX) {
      parts.push(isFirst ? buf : " " + buf);
      buf = ch;
      isFirst = false;
    } else {
      buf += ch;
    }
  }
  if (buf.length > 0) parts.push(isFirst ? buf : " " + buf);
  return parts.join("\r\n");
}

// ── Google Calendar URL ──────────────────────────────────────

/**
 * Google Calendar "render" deep link with the itinerary pre-filled.
 * Opens in a new tab; the user confirms / edits in their own Calendar.
 *
 * CRITICAL: built manually (NOT via URLSearchParams) because the
 * `dates` separator MUST be a literal "/" — URLSearchParams would
 * percent-encode it to %2F, and Google's parser silently falls back
 * to local-time interpretation when it can't find the literal slash,
 * producing a +4h/+5h shift (the NYC UTC offset). Only `text`,
 * `details`, `location` need encodeURIComponent — the dates are
 * already URL-safe (digits + T + Z).
 */
export function buildGoogleCalendarUrl(
  itinerary: ItineraryResponse,
  shareUrl: string | null = null,
): string {
  const { start, end } = resolveItineraryCalendarTimes(itinerary);
  const dates = `${formatIcsTimestamp(start)}/${formatIcsTimestamp(end)}`;
  const params = [
    "action=TEMPLATE",
    `text=${encodeURIComponent(itinerary.header.title)}`,
    `dates=${dates}`,
    `details=${encodeURIComponent(buildDescription(itinerary, shareUrl))}`,
    `location=${encodeURIComponent(getLocation(itinerary))}`,
  ];
  return `https://calendar.google.com/calendar/render?${params.join("&")}`;
}

// ── .ics generation ──────────────────────────────────────────

/**
 * Build the .ics file content as a string. Single VEVENT, GREGORIAN
 * calendar. Lines joined with CRLF + folded at 70 chars per RFC 5545.
 *
 * `uid` should be a stable identifier so re-imports update the event
 * rather than duplicating it. The caller passes the saved itinerary's
 * id (combined with the domain) so a given saved plan always produces
 * the same UID. `shareUrl` is embedded in the description footer when
 * available.
 */
export function generateIcsContent(
  itinerary: ItineraryResponse,
  uid: string,
  shareUrl: string | null = null,
  now: Date = new Date(),
): string {
  const { start, end } = resolveItineraryCalendarTimes(itinerary);
  const description = buildDescription(itinerary, shareUrl);
  const location = getLocation(itinerary);
  const title = itinerary.header.title;
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
    foldIcsLine(`SUMMARY:${escapeIcsText(title)}`),
    foldIcsLine(`DESCRIPTION:${escapeIcsText(description)}`),
    foldIcsLine(`LOCATION:${escapeIcsText(location)}`),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.join("\r\n");
}

/** Browser Blob wrapper for the .ics content (triggers <a download>). */
export function generateIcsBlob(
  itinerary: ItineraryResponse,
  uid: string,
  shareUrl: string | null = null,
): Blob {
  return new Blob([generateIcsContent(itinerary, uid, shareUrl)], {
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
