// Mapbox helpers for static image URLs (cards, walk previews) and the
// path-overlay encoder for cached walking routes (Phase 10).
//
// Token is NEXT_PUBLIC_MAPBOX_TOKEN. Same token is used by the interactive
// client-side ItineraryMap (Mapbox GL JS), so it must be NEXT_PUBLIC_-prefixed.
// The token is already de facto public — embedded in every <img src> URL this
// helper renders — so the NEXT_PUBLIC_ prefix just makes that explicit.

import type { LineString } from "geojson";
import { encodeGeoJsonLineToPolyline } from "@/lib/walking-routes";

const STYLE = "mapbox/light-v11";
const STROKE = "6B1E2E"; // brand burgundy
const PATH_STROKE_WIDTH = 3;
const PATH_OPACITY = "0.9";

/**
 * Build a synchronous Mapbox Static Images URL showing all itinerary
 * stops as numbered burgundy pins. Used by SavedPlanRowExpanded's
 * functional map zone. No polyline (no Directions API roundtrip),
 * just numbered pins with `/auto/` bounds + padding so Mapbox fits
 * everything in frame.
 *
 *   Defaults: 600×280@2x, padding 40.
 *   - Mapbox empirical constraint: padding < min(width, height) / 2.
 *     Violating it returns HTTP 422 "The padding cannot exceed the
 *     height or width of the requested image." 40 ≪ 140 — safe.
 *   - Tuning history (each empirically curl-tested against the real
 *     endpoint):
 *       30  Phase 6 — pins at the very edge of the frame
 *       60  Phase 9.1 — slight improvement, still crowded
 *       120 Phase 9.2 — 422 on the 180-tall image we shipped first
 *       120@280 Phase 9.3 — 200 OK, but Mapbox zooms WAY out: the
 *         tight pin bbox (~500m, taller-than-wide) had to fit
 *         inside a 360×40 inner area, so the auto-fit zoomed out
 *         to regional level (Newark visible in NYC plans).
 *       40@280 Phase 9.4 (current) — zooms in tight on the pin bbox
 *         with 16px of safety above the pin glyph (24px tall).
 *   - 600×280 dimensions retained from 9.3 so future tuning can move
 *     padding without re-checking the < min/2 constraint.
 *   - @2x is mandatory for crisp pins on retina — otherwise the 24px
 *     pin glyph blurs.
 *   - If you need different padding behavior for far-apart pins
 *     (where 40px leaves them feeling cramped), the next step is
 *     to compute explicit center+zoom from the pin bbox client-side
 *     and pass `lng,lat,zoom` instead of `auto` — gives full control
 *     over framing regardless of how close or far apart the pins are.
 *
 * NOTE on token scopes — the public `pk.*` token used here MUST have
 * the Static Images API enabled in the Mapbox dashboard. Default
 * public tokens usually include it, but a URL allowlist (configured
 * on the token) is enforced on every request: composer.onpalate.com,
 * Vercel preview URLs, and localhost all need to be in the allowlist
 * for the static endpoint to return 200 instead of 403.
 *
 * Returns null when:
 *   - No NEXT_PUBLIC_MAPBOX_TOKEN
 *   - Empty stops array
 *   - No stop has finite lat/lon (defensive — old saves may have NaN)
 */
export function buildItineraryStaticMapUrl(
  stops: ReadonlyArray<{ latitude: number; longitude: number }>,
  options: {
    width?: number;
    height?: number;
    padding?: number;
    /**
     * Phase 10: optional GeoJSON LineString route geometries (one per
     * walk segment, i.e. stops.length - 1 entries). When present, the
     * Mapbox Static URL adds a `path-…(encoded)` overlay per segment
     * BEFORE the pins so the routes draw underneath the pins. Null
     * entries are skipped (mixed real-route + straight-line legacy
     * data degrades gracefully — straight lines aren't drawn on the
     * static surface; the inline interactive map handles those).
     */
    routeGeometries?: ReadonlyArray<LineString | null | undefined>;
  } = {},
): string | null {
  // Re-read the token at call time (not module load) so test harnesses
  // can stub process.env before invoking. The async buildWalkMapUrl
  // below captures TOKEN at module load for legacy reasons — leaving
  // that alone since it's already shipped.
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
  if (!token) return null;
  const valid = stops.filter(
    (s) => Number.isFinite(s.latitude) && Number.isFinite(s.longitude),
  );
  if (valid.length === 0) return null;
  const width = options.width ?? 600;
  const height = options.height ?? 280;
  const padding = options.padding ?? 40;
  // Path overlays (Phase 10) come BEFORE pins so routes render
  // underneath the numbered pin glyphs. Null/undefined entries are
  // skipped — a single missing geometry doesn't break the rest of
  // the overlay set. Polyline is percent-encoded because the
  // encoding alphabet includes characters Mapbox reserves in the
  // path segment (e.g. backslash, question mark).
  const pathOverlays = (options.routeGeometries ?? [])
    .filter((g): g is LineString => !!g)
    .map((line) => {
      const encoded = encodeURIComponent(encodeGeoJsonLineToPolyline(line));
      return `path-${PATH_STROKE_WIDTH}+${STROKE}-${PATH_OPACITY}(${encoded})`;
    });
  const pins = valid.map(
    (s, i) => `pin-s-${i + 1}+${STROKE}(${s.longitude},${s.latitude})`,
  );
  const overlays = [...pathOverlays, ...pins].join(",");
  return (
    `https://api.mapbox.com/styles/v1/${STYLE}/static/${overlays}` +
    `/auto/${width}x${height}@2x` +
    `?access_token=${token}&padding=${padding}`
  );
}

/**
 * Single-walk-segment Mapbox Static URL for the WalkConnector.
 * Phase 10 replaced the async `buildWalkMapUrl` — the Directions
 * fetch + cache lives server-side now (composer_walking_routes),
 * and the client builds the URL synchronously from the geometry
 * shipped in the WalkSegment response.
 *
 * Returns null when:
 *   - No NEXT_PUBLIC_MAPBOX_TOKEN
 *   - No geometry (legacy itineraries pre-Phase 10) — caller renders
 *     text-only walk minutes, matching the existing fallback path
 */
export function buildWalkSegmentStaticMapUrl(
  routeGeometry: LineString | null | undefined,
  options: { width?: number; height?: number; padding?: number } = {},
): string | null {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
  if (!token || !routeGeometry) return null;
  const coords = routeGeometry.coordinates;
  if (coords.length < 2) return null;
  const width = options.width ?? 512;
  const height = options.height ?? 120;
  const padding = options.padding ?? 30;
  const [fromLng, fromLat] = coords[0];
  const [toLng, toLat] = coords[coords.length - 1];
  const pinFrom = `pin-s+${STROKE}(${fromLng},${fromLat})`;
  const pinTo = `pin-s+${STROKE}(${toLng},${toLat})`;

  const buildUrl = (overlays: string) =>
    `https://api.mapbox.com/styles/v1/${STYLE}/static/${overlays}` +
    `/auto/${width}x${height}@2x` +
    `?access_token=${token}&padding=${padding}`;

  // Try with the path overlay first, fall back to pins-only when the
  // resulting GET URL exceeds Mapbox's 8 KB request-line cap. Long
  // walking routes through dense streets (e.g. Greenwich Village to
  // Hudson Yards via the High Line) generate enough polyline points
  // to push the URL past 10 KB at full overview detail. We pick 8000
  // as the threshold (192 chars of headroom under the documented
  // 8192-byte limit) to stay comfortably under any per-server tweaks
  // and avoid round-trip 414s.
  const encoded = encodeURIComponent(encodeGeoJsonLineToPolyline(routeGeometry));
  const path = `path-${PATH_STROKE_WIDTH}+${STROKE}-${PATH_OPACITY}(${encoded})`;
  const withPath = buildUrl(`${path},${pinFrom},${pinTo}`);
  if (withPath.length <= 8000) return withPath;

  return buildUrl(`${pinFrom},${pinTo}`);
}
