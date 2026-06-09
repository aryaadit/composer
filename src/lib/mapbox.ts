// Build a Mapbox Static Images URL showing the actual walking route between
// two points. Returns null on any failure so callers can render the plain
// text-only WalkConnector without branching.
//
// Flow:
//   1. Directions API (walking profile) → encoded polyline
//   2. Static Images API → URL with the polyline + two pins as overlays
//
// Token is NEXT_PUBLIC_MAPBOX_TOKEN. Same token is used by the interactive
// client-side ItineraryMap (Mapbox GL JS), so it must be NEXT_PUBLIC_-prefixed.
// The token is already de facto public — embedded in every <img src> URL this
// helper renders — so the NEXT_PUBLIC_ prefix just makes that explicit.
// When missing, we short-circuit to null and log once per request so dev
// without a token still works.

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
const STYLE = "mapbox/light-v11";
const STROKE = "6B1E2E"; // brand burgundy
const WIDTH = 512;
const HEIGHT = 120;
const PADDING = 30;

async function fetchWalkingPolyline(
  fromLat: number,
  fromLon: number,
  toLat: number,
  toLon: number
): Promise<string | null> {
  try {
    const coords = `${fromLon},${fromLat};${toLon},${toLat}`;
    const url =
      `https://api.mapbox.com/directions/v5/mapbox/walking/${coords}` +
      `?geometries=polyline&overview=full&access_token=${TOKEN}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[mapbox] directions HTTP ${res.status}`);
      return null;
    }
    const data = await res.json();
    const polyline = data?.routes?.[0]?.geometry;
    return typeof polyline === "string" && polyline.length > 0 ? polyline : null;
  } catch (err) {
    console.warn("[mapbox] directions failed:", err);
    return null;
  }
}

/**
 * Build a synchronous Mapbox Static Images URL showing all itinerary
 * stops as numbered burgundy pins. Used by SavedPlanRowExpanded's
 * functional map zone. No polyline (no Directions API roundtrip),
 * just numbered pins with `/auto/` bounds + padding so Mapbox fits
 * everything in frame.
 *
 *   Defaults: 600×180@2x, padding 60.
 *   - 600×180 is a card-friendly 10:3 aspect — wider than tall for
 *     east-west routes (typical NYC neighborhoods) while staying
 *     short enough to feel like a preview, not a hero.
 *   - padding 60 gives the pins breathing room from the edges; with
 *     the prior 30 px padding, pins crowded the frame edges and read
 *     as visual noise instead of waypoints.
 *   - @2x is mandatory for crisp pins on retina — otherwise the 24px
 *     pin glyph blurs.
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
  options: { width?: number; height?: number; padding?: number } = {},
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
  const height = options.height ?? 180;
  const padding = options.padding ?? 60;
  const pins = valid
    .map((s, i) => `pin-s-${i + 1}+${STROKE}(${s.longitude},${s.latitude})`)
    .join(",");
  return (
    `https://api.mapbox.com/styles/v1/${STYLE}/static/${pins}` +
    `/auto/${width}x${height}@2x` +
    `?access_token=${token}&padding=${padding}`
  );
}

export async function buildWalkMapUrl(
  fromLat: number,
  fromLon: number,
  toLat: number,
  toLon: number
): Promise<string | null> {
  if (!TOKEN) {
    console.warn("[mapbox] NEXT_PUBLIC_MAPBOX_TOKEN not set; walk maps disabled");
    return null;
  }

  const polyline = await fetchWalkingPolyline(fromLat, fromLon, toLat, toLon);
  if (!polyline) return null;

  // Polyline contains reserved characters (`\`, `?`, `#`) — it must be
  // percent-encoded before being embedded in the path overlay.
  const encoded = encodeURIComponent(polyline);
  const path = `path-3+${STROKE}-0.9(${encoded})`;
  const pinFrom = `pin-s+${STROKE}(${fromLon},${fromLat})`;
  const pinTo = `pin-s+${STROKE}(${toLon},${toLat})`;
  const overlays = `${path},${pinFrom},${pinTo}`;

  return (
    `https://api.mapbox.com/styles/v1/${STYLE}/static/${overlays}` +
    `/auto/${WIDTH}x${HEIGHT}@2x` +
    `?access_token=${TOKEN}&padding=${PADDING}`
  );
}
