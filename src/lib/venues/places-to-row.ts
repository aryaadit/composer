// Deterministic mapper: Google Places (v1) PlaceData -> a partial row
// keyed by lowercase sheet header.
//
// "Deterministic" here means every field this module sets is a pure
// function of Places data plus a small set of constants. The Gemini
// drafting step in the route layers on top of this output (filling
// taxonomy slugs and editorial copy); the two halves stay separate
// so the deterministic shape is the same regardless of Gemini's
// availability.
//
// Column-keying is lowercase to match how src/lib/venues/sheet.ts
// reads headers (.trim().toLowerCase()). The route projects this
// map onto the live `NYC Venues` header order at apply time, so
// keys this module DOES NOT emit simply render as empty cells.

import type { PlaceData } from "@/lib/google-places";

import {
  blocksForDayIntervals,
  DAY_COLUMN_BY_KEY,
  scheduleToDayBlocks,
  unionTimeBlocks,
  type DayBlocksMap,
  type DayKey,
  type Schedule,
} from "./hours-to-blocks";

// ─── PRICE_LEVEL_MAP ─────────────────────────────────────────────
//
// Google Places (v1) returns priceLevel as one of these string
// enum values. We mirror the canonical Python map from
// scripts/backfill_price_tier.py so the TS path and the Python
// backfill agree on every venue. FREE and UNSPECIFIED both map to
// null (the venue ships without a price tier rather than landing
// on a silently wrong one).
const PRICE_LEVEL_MAP: Record<string, 1 | 2 | 3 | 4 | null> = {
  PRICE_LEVEL_FREE: null,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
  PRICE_LEVEL_UNSPECIFIED: null,
};

export function mapPriceLevel(priceLevel: unknown): 1 | 2 | 3 | 4 | null {
  if (typeof priceLevel !== "string") return null;
  return PRICE_LEVEL_MAP[priceLevel] ?? null;
}

// ─── Maps URL / Place ID extraction ──────────────────────────────

/**
 * True if `s` matches the Places API v1 place_id shape: a base64-ish
 * string of letters / digits / `_` / `-`, no colons, ~27+ chars.
 * Place_ids never contain colons; the `0x...:0x...` shape in Maps
 * URLs is a hex feature ID (a `!1s` payload), not a place_id, and
 * feeding it to /v1/places/<id> returns nothing. This predicate
 * rejects that shape by virtue of disallowing the colon.
 */
function looksLikeChIJ(s: string): boolean {
  return /^[A-Za-z][A-Za-z0-9_-]{22,}$/.test(s);
}

/**
 * Pull a Places API v1 place_id (ChIJ-form) out of an input string.
 * Accepted shapes:
 *   - A bare place_id (operator pasted just the ID)
 *   - `?q=place_id:ChIJ...` (canonical Maps URL form)
 *   - `?place_id=ChIJ...` or `&place_id=ChIJ...` (query param form)
 *
 * Explicitly NOT accepted:
 *   - `!1s0x...:0x...` (hex feature ID, not a place_id)
 *   - `/g/...` (Knowledge Graph MID, not a place_id)
 *   - `/maps/place/<NAME>/<id>` trailing segments (often a CID or MID)
 *
 * Returns null when the input has no ChIJ-form id. The route handles
 * the null case by extracting name + coords (see extractMapsContext)
 * and falling back to Places Text Search.
 */
export function extractPlaceIdFromInput(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Bare place_id.
  if (looksLikeChIJ(trimmed)) return trimmed;

  // ?q=place_id:ChIJ... — the documented canonical form.
  const qPrefixedMatch = trimmed.match(/[?&]q=place_id:([A-Za-z0-9_-]+)/);
  if (qPrefixedMatch && looksLikeChIJ(qPrefixedMatch[1])) {
    return qPrefixedMatch[1];
  }

  // ?place_id=ChIJ... — older form.
  const queryMatch = trimmed.match(/[?&]place_id=([A-Za-z0-9_-]+)/);
  if (queryMatch && looksLikeChIJ(queryMatch[1])) {
    return queryMatch[1];
  }

  return null;
}

/**
 * Context useful for Places Text Search when the URL has no ChIJ
 * place_id (the common case for /maps.app.goo.gl/ shortlinks once
 * they resolve). Returns whatever the URL exposes:
 *   - name from the `/maps/place/<NAME>/` segment, URL-decoded
 *   - lat/lng from `!3d<lat>!4d<lng>` (the precise pin coords) when
 *     present, otherwise from `@<lat>,<lng>` (viewport center).
 * Fields are independently null when the URL doesn't expose them;
 * the caller is responsible for handling partial context.
 */
export function extractMapsContext(input: string): {
  name: string | null;
  lat: number | null;
  lng: number | null;
} {
  const trimmed = input.trim();

  let name: string | null = null;
  const nameMatch = trimmed.match(/\/maps\/place\/([^/]+)\//);
  if (nameMatch) {
    try {
      name = decodeURIComponent(nameMatch[1]).replace(/\+/g, " ");
    } catch {
      // URL-decode failed (malformed percent-encoding). Treat as
      // no-name; Text Search needs a query, so the route will
      // surface unresolved_place_id.
      name = null;
    }
  }

  let lat: number | null = null;
  let lng: number | null = null;
  // Prefer !3d/!4d (the pin coords) over @lat,lng (the viewport
  // center), which can be off by hundreds of meters.
  const dataMatch = trimmed.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (dataMatch) {
    lat = Number.parseFloat(dataMatch[1]);
    lng = Number.parseFloat(dataMatch[2]);
  } else {
    const atMatch = trimmed.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (atMatch) {
      lat = Number.parseFloat(atMatch[1]);
      lng = Number.parseFloat(atMatch[2]);
    }
  }

  return { name, lat, lng };
}

/**
 * Follow a `maps.app.goo.gl` shortlink one hop to reveal the
 * underlying Maps URL containing the place_id. Uses a HEAD request
 * with redirect: "manual" so we read the Location header without
 * fetching the destination body. Returns null on any failure or
 * non-redirect response.
 */
export async function resolveMapsShortlink(
  url: string,
): Promise<string | null> {
  if (!/^https:\/\/maps\.app\.goo\.gl\//.test(url)) return null;
  try {
    const res = await fetch(url, {
      method: "HEAD",
      redirect: "manual",
    });
    const location = res.headers.get("location");
    return location ?? null;
  } catch (err) {
    console.error("[places-to-row] shortlink resolution failed:", err);
    return null;
  }
}

// ─── Schedule extraction ─────────────────────────────────────────
//
// Google Places returns regularOpeningHours.periods as an array of
//   { open: { day, hour, minute }, close: { day, hour, minute } }
// where day is 0=Sunday..6=Saturday. We convert into the Schedule
// shape (per-day [open, close] float arrays) the rest of the
// codebase uses. Closes that wrap past midnight produce a close
// hour >= 24 (e.g. 25.5 = 1:30 AM next day) on the SAME day as the
// open, matching the formatHour convention in src/lib/format/hours.ts.

const DAY_INDEX_TO_KEY: DayKey[] = [
  "sun",
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
];

interface PlacesTimePoint {
  day?: number;
  hour?: number;
  minute?: number;
}

interface PlacesPeriod {
  open?: PlacesTimePoint;
  close?: PlacesTimePoint;
}

export function extractSchedule(place: PlaceData): Schedule {
  const hours = place.regularOpeningHours;
  if (!hours || typeof hours !== "object") return {};
  const periodsRaw = (hours as { periods?: unknown }).periods;
  if (!Array.isArray(periodsRaw)) return {};
  const periods = periodsRaw as PlacesPeriod[];

  const result: Schedule = {};
  for (const period of periods) {
    if (!period.open || typeof period.open.day !== "number") continue;
    const dayIdx = period.open.day;
    if (dayIdx < 0 || dayIdx > 6) continue;
    const dayKey = DAY_INDEX_TO_KEY[dayIdx];

    const openFloat = toFloatHour(period.open);
    if (openFloat == null) continue;

    // Missing close = 24-hour service; project as [open, 24] for the
    // open day so block coverage still computes. Past-midnight closes
    // arrive as { day: dayIdx+1, hour: small } and we fold them into
    // the open day's interval by adding 24 to the close.
    let closeFloat: number;
    if (!period.close || typeof period.close.day !== "number") {
      closeFloat = 24;
    } else {
      const closeRaw = toFloatHour(period.close);
      if (closeRaw == null) continue;
      const wrap = period.close.day !== dayIdx;
      closeFloat = wrap ? closeRaw + 24 : closeRaw;
    }

    if (!result[dayKey]) result[dayKey] = [];
    result[dayKey]!.push([openFloat, closeFloat]);
  }
  return result;
}

function toFloatHour(point: PlacesTimePoint): number | null {
  if (typeof point.hour !== "number") return null;
  const minute = typeof point.minute === "number" ? point.minute : 0;
  return point.hour + minute / 60;
}

const DAY_ORDER: DayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

// ─── Amenity boolean helpers ─────────────────────────────────────

/**
 * Google Places returns Places amenity fields as undefined (unknown),
 * true, or false. Our sheet stores yes/no/blank — yes/no are
 * explicit assertions, blank means "we don't know" and avoids
 * shipping a confident "no" the operator never verified. Used for
 * dog_friendly, kid_friendly, wheelchair_accessible.
 */
function yesNoOrBlank(v: unknown): string {
  if (v === true) return "yes";
  if (v === false) return "no";
  return "";
}

// ─── Main mapping ────────────────────────────────────────────────

export interface DeterministicRow {
  /** Lowercase-keyed partial row, ready to be merged with the
   *  Gemini-drafted editorial fields and projected onto the live
   *  sheet header order. */
  fields: Record<string, string>;
  /** Computed per-day blocks. Surfaced separately so the route can
   *  pass them into both the row map AND the Gemini prompt (the
   *  drafter sees what blocks the deterministic side already picked
   *  and writes consistent prose). */
  dayBlocks: DayBlocksMap;
  /** Union across the week. Used for the global time_blocks column
   *  and as a sanity hint in the preview UI. */
  timeBlocks: ReturnType<typeof unionTimeBlocks>;
  /** Raw schedule for the editor + Gemini prompt context. */
  schedule: Schedule;
}

/**
 * Build the deterministic half of the new-venue row. Caller (the
 * route) supplies the constants that don't come from Places
 * (curated_by, active, etc.) and the place id used as the upstream
 * identifier.
 */
export function placesToRow(
  place: PlaceData,
  opts: {
    placeId: string;
    today: string; // YYYY-MM-DD for last_verified; passed in so the route owns Date.now() use
  },
): DeterministicRow {
  const fields: Record<string, string> = {};

  // Identity + Google fields.
  const displayName = (place.displayName as { text?: string } | undefined)?.text;
  if (displayName) fields["name"] = displayName;
  if (typeof place.formattedAddress === "string") {
    fields["address"] = place.formattedAddress;
  }
  const loc = place.location as { latitude?: number; longitude?: number } | undefined;
  if (typeof loc?.latitude === "number") fields["latitude"] = String(loc.latitude);
  if (typeof loc?.longitude === "number") fields["longitude"] = String(loc.longitude);
  fields["google_place_id"] = opts.placeId;
  // maps_url is constructed deterministically from the place_id so
  // every new row matches the canonical form every existing NYC
  // Venues row uses ("https://www.google.com/maps/place/?q=place_id:
  // ChIJ..."). The googleMapsUri Places returns is the share-link
  // shape (maps.google.com/?cid=... with tracking params) which
  // makes diffing the catalog noisy and doesn't reopen at the same
  // pin in some clients. The constructed form is the documented
  // canonical Maps URL for place_id lookups.
  fields["maps_url"] = `https://www.google.com/maps/place/?q=place_id:${opts.placeId}`;
  if (typeof place.nationalPhoneNumber === "string") {
    fields["google_phone"] = place.nationalPhoneNumber;
  }
  if (typeof place.rating === "number") fields["google_rating"] = String(place.rating);
  if (typeof place.userRatingCount === "number") {
    fields["google_review_count"] = String(place.userRatingCount);
  }
  if (Array.isArray(place.types)) {
    fields["google_types"] = (place.types as unknown[])
      .filter((t): t is string => typeof t === "string")
      .join(",");
  }
  if (typeof place.businessStatus === "string") {
    fields["business_status"] = place.businessStatus;
  }
  const priceTier = mapPriceLevel(place.priceLevel);
  fields["price_tier"] = priceTier == null ? "" : String(priceTier);

  // Amenities -> yes/no/blank.
  fields["outdoor_seating"] = yesNoOrBlank(place.outdoorSeating);
  fields["dog_friendly"] = yesNoOrBlank(place.allowsDogs);
  fields["kid_friendly"] = yesNoOrBlank(place.goodForChildren);
  const a11y = place.accessibilityOptions as
    | { wheelchairAccessibleEntrance?: unknown; wheelchairAccessibleRestroom?: unknown }
    | undefined;
  fields["wheelchair_accessible"] = yesNoOrBlank(
    a11y?.wheelchairAccessibleEntrance ?? a11y?.wheelchairAccessibleRestroom,
  );

  // Schedule + blocks + hours JSON.
  const schedule = extractSchedule(place);
  const dayBlocks = scheduleToDayBlocks(schedule);
  const timeBlocks = unionTimeBlocks(dayBlocks);
  for (const day of DAY_ORDER) {
    fields[DAY_COLUMN_BY_KEY[day]] = dayBlocks[day].join(",");
  }
  fields["time_blocks"] = timeBlocks.join(",");
  // JSON-serialized schedule, e.g. {"fri":[[18,25.5]]} — the same
  // shape src/lib/format/hours.ts::parseSchedule consumes when
  // rendering the venue card, and the same shape every live NYC
  // Venues row stores after the JSON migration. Keys are day codes
  // (mon..sun), values are arrays of [open, close] intervals as
  // 24h decimal floats with past-midnight closes >24 (e.g. 25.5 =
  // 1:30 AM next day).
  fields["hours"] = JSON.stringify(schedule);

  // Constants.
  fields["curated_by"] = "adit";
  fields["curation_boost"] = "0";
  fields["active"] = "yes";
  fields["enriched"] = "yes";
  fields["last_verified"] = opts.today;

  return { fields, dayBlocks, timeBlocks, schedule };
}

// Re-export for the route's input-parsing path so it doesn't have
// to dual-import from hours-to-blocks.
export type { DayBlocksMap, DayKey, Schedule } from "./hours-to-blocks";
export { blocksForDayIntervals };
