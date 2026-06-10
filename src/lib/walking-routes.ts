// Phase 10: Fetch + cache Mapbox Directions walking routes per
// venue pair. Cache row lives in composer_walking_routes; the
// cache is permanent (walking routes between fixed points don't
// change). Failure modes always return null geometry + fallback
// straight-line minutes/distance so callers never have to branch
// on Mapbox outages.
//
// All callers are server-side (API routes). We use the service-role
// Supabase client to read/write the cache table — there's no RLS to
// satisfy here because the table is internal infrastructure, not
// user-scoped data.

import type { LineString } from "geojson";
import { getServiceSupabase } from "@/lib/supabase";

const MAPBOX_DIRECTIONS_TIMEOUT_MS = 3000;

export interface WalkingRoute {
  /** Real route geometry from Mapbox Directions, or null on failure. */
  routeGeometry: LineString | null;
  /** Authoritative walk minutes (Mapbox duration / 60, rounded). On
   * failure, callers should pass in their straight-line fallback. */
  walkMinutes: number;
  /** Distance in meters. On failure, 0 (callers convert their
   * straight-line km fallback to meters before recording). */
  walkDistanceMeters: number;
}

interface CacheRow {
  route_geometry: LineString;
  walk_minutes: number;
  walk_distance_meters: number;
  origin_lat: number | string;
  origin_lng: number | string;
  dest_lat: number | string;
  dest_lng: number | string;
}

/** Round to 6 decimal places (~11 cm). Stored coords + lookup coords
 * are both rounded so the equality check is deterministic across the
 * supabase-js NUMERIC → string transport (PG NUMERIC arrives as a
 * decimal string, not a JS number — Number() reparses safely for the
 * range of valid lat/lng values). Matches the NUMERIC(9, 6) precision
 * on the composer_walking_routes coord columns. */
const COORD_FACTOR = 1e6;
function roundCoord(n: number): number {
  return Math.round(n * COORD_FACTOR) / COORD_FACTOR;
}
function coordsMatch(
  storedLat: number | string,
  storedLng: number | string,
  currentLat: number,
  currentLng: number,
): boolean {
  return (
    roundCoord(Number(storedLat)) === roundCoord(currentLat) &&
    roundCoord(Number(storedLng)) === roundCoord(currentLng)
  );
}

/**
 * Lookup-or-fetch a walking route between two venues. Returns the
 * Mapbox-derived geometry + minutes/distance from cache when the
 * row exists; on cache miss, calls Mapbox Directions, persists the
 * result, and returns it.
 *
 * Failure handling (never throws):
 *   - DB lookup error: log + try Mapbox
 *   - Mapbox HTTP error / timeout / malformed response: return
 *     { routeGeometry: null, walkMinutes: fallbackMinutes,
 *       walkDistanceMeters: fallbackDistanceMeters }
 *   - DB write error after successful Mapbox fetch: log + still
 *     return the live result (cache miss on next call, but the user
 *     still gets the route this time)
 *
 * @param fallbackMinutes - Straight-line walk-time estimate the caller
 *   already computed. Returned when Mapbox is unreachable.
 * @param fallbackDistanceMeters - Straight-line distance in METERS
 *   (not km — convert at the call site).
 */
export async function fetchOrCacheWalkingRoute(
  originVenueId: string,
  destinationVenueId: string,
  originCoords: [number, number], // [lng, lat]
  destinationCoords: [number, number],
  fallbackMinutes: number,
  fallbackDistanceMeters: number,
): Promise<WalkingRoute> {
  const supabase = getServiceSupabase();
  const [originLng, originLat] = originCoords;
  const [destLng, destLat] = destinationCoords;

  // 1. Cache lookup. Treat a row whose stored coords no longer match
  // the current venue coords (after rounding) as a miss — the geometry
  // was computed against stale coords (typically a Google Places
  // backfill or manual cleanup nudged the venue). Falls through to
  // the Mapbox fetch + upsert below, which overwrites the stale row
  // via the (origin_venue_id, destination_venue_id) UNIQUE constraint.
  try {
    const { data, error } = await supabase
      .from("composer_walking_routes")
      .select(
        "route_geometry, walk_minutes, walk_distance_meters, origin_lat, origin_lng, dest_lat, dest_lng",
      )
      .eq("origin_venue_id", originVenueId)
      .eq("destination_venue_id", destinationVenueId)
      .maybeSingle<CacheRow>();
    if (error) {
      console.warn(
        `[walking-routes] cache lookup failed for ${originVenueId} → ${destinationVenueId}:`,
        error.message,
      );
    } else if (data) {
      const fresh =
        coordsMatch(data.origin_lat, data.origin_lng, originLat, originLng) &&
        coordsMatch(data.dest_lat, data.dest_lng, destLat, destLng);
      if (fresh) {
        return {
          routeGeometry: data.route_geometry,
          walkMinutes: data.walk_minutes,
          walkDistanceMeters: data.walk_distance_meters,
        };
      }
      console.info(
        `[walking-routes] stale cached coords for ${originVenueId} → ${destinationVenueId}; refetching`,
      );
    }
  } catch (err) {
    console.warn("[walking-routes] cache lookup threw:", err);
  }

  // 2. Mapbox Directions fetch with 3-second timeout.
  // Use the server-only token. NEXT_PUBLIC_MAPBOX_TOKEN is URL-allowlisted
  // for browser origins, and server-side fetches don't send a matching
  // Referer header — so reusing the public token here silently 403s on
  // every call and falls through to straight-line geometry, with no
  // signal anything is wrong. MAPBOX_SERVER_TOKEN has no URL restrictions
  // and is scoped to the Directions API. No cross-fallback to the public
  // token on purpose: a silent 403 is worse than a loud miss.
  const token = process.env.MAPBOX_SERVER_TOKEN ?? "";
  if (!token) {
    console.error(
      "[walking-routes] MAPBOX_SERVER_TOKEN is not set; skipping Mapbox " +
        "Directions and returning straight-line fallback. Set MAPBOX_SERVER_TOKEN " +
        "(server-only, no URL allowlist) in the environment to enable real routes.",
    );
    return fallbackResult(fallbackMinutes, fallbackDistanceMeters);
  }
  const url =
    `https://api.mapbox.com/directions/v5/mapbox/walking/` +
    `${originLng},${originLat};${destLng},${destLat}` +
    `?geometries=geojson&overview=full&access_token=${token}`;

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    MAPBOX_DIRECTIONS_TIMEOUT_MS,
  );

  let geometry: LineString | null = null;
  let mapboxMinutes = fallbackMinutes;
  let mapboxDistanceMeters = fallbackDistanceMeters;

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      console.warn(`[walking-routes] mapbox directions HTTP ${res.status}`);
      return fallbackResult(fallbackMinutes, fallbackDistanceMeters);
    }
    const data = (await res.json()) as {
      routes?: Array<{
        geometry?: LineString;
        duration?: number;
        distance?: number;
      }>;
    };
    const route = data.routes?.[0];
    if (
      !route?.geometry ||
      typeof route.duration !== "number" ||
      typeof route.distance !== "number"
    ) {
      console.warn("[walking-routes] mapbox directions returned malformed payload");
      return fallbackResult(fallbackMinutes, fallbackDistanceMeters);
    }
    geometry = route.geometry;
    mapboxMinutes = Math.max(1, Math.round(route.duration / 60));
    mapboxDistanceMeters = Math.round(route.distance);
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      console.warn("[walking-routes] mapbox directions timed out");
    } else {
      console.warn("[walking-routes] mapbox directions threw:", err);
    }
    return fallbackResult(fallbackMinutes, fallbackDistanceMeters);
  } finally {
    clearTimeout(timer);
  }

  // 3. Cache write (best-effort; failure doesn't deny the route).
  // Coords are rounded to 6 decimal places to match the lookup
  // comparison and the storage column's precision.
  try {
    const { error } = await supabase
      .from("composer_walking_routes")
      .upsert(
        {
          origin_venue_id: originVenueId,
          destination_venue_id: destinationVenueId,
          origin_lat: roundCoord(originLat),
          origin_lng: roundCoord(originLng),
          dest_lat: roundCoord(destLat),
          dest_lng: roundCoord(destLng),
          route_geometry: geometry,
          walk_minutes: mapboxMinutes,
          walk_distance_meters: mapboxDistanceMeters,
        },
        { onConflict: "origin_venue_id,destination_venue_id" },
      );
    if (error) {
      console.warn(
        `[walking-routes] cache write failed for ${originVenueId} → ${destinationVenueId}:`,
        error.message,
      );
    }
  } catch (err) {
    console.warn("[walking-routes] cache write threw:", err);
  }

  return {
    routeGeometry: geometry,
    walkMinutes: mapboxMinutes,
    walkDistanceMeters: mapboxDistanceMeters,
  };
}

function fallbackResult(
  walkMinutes: number,
  walkDistanceMeters: number,
): WalkingRoute {
  return {
    routeGeometry: null,
    walkMinutes,
    walkDistanceMeters,
  };
}

// ── Google polyline algorithm encoder ────────────────────────
//
// Mapbox Static API path overlays expect Google's polyline
// algorithm (precision 5). We store routes as GeoJSON LineStrings
// (easier for Mapbox GL JS) and re-encode to polyline at static-URL
// build time. The encoder is tiny (~25 lines) and avoids a new npm
// dependency.

function encodeSignedNumber(num: number): string {
  let sgn = num << 1;
  if (num < 0) sgn = ~sgn;
  return encodeNumber(sgn);
}

function encodeNumber(num: number): string {
  let n = num;
  let result = "";
  while (n >= 0x20) {
    result += String.fromCharCode((0x20 | (n & 0x1f)) + 63);
    n >>= 5;
  }
  result += String.fromCharCode(n + 63);
  return result;
}

/**
 * Encode a GeoJSON LineString's coordinates as a Google polyline
 * (precision 5) string. Format-compatible with the Mapbox Static
 * API `path-…(encodedPolyline)` overlay syntax.
 *
 * Coordinates are [lng, lat] per GeoJSON convention; polyline
 * encodes (lat, lng) pairs.
 */
export function encodeGeoJsonLineToPolyline(line: LineString): string {
  const coords = line.coordinates;
  let prevLat = 0;
  let prevLng = 0;
  let result = "";
  for (const [lng, lat] of coords) {
    const intLat = Math.round(lat * 1e5);
    const intLng = Math.round(lng * 1e5);
    result += encodeSignedNumber(intLat - prevLat);
    result += encodeSignedNumber(intLng - prevLng);
    prevLat = intLat;
    prevLng = intLng;
  }
  return result;
}
