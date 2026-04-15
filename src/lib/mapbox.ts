// Build a Mapbox Static Images URL showing the actual walking route between
// two points. Returns null on any failure so callers can render the plain
// text-only WalkConnector without branching.
//
// Flow:
//   1. Directions API (walking profile) → encoded polyline
//   2. Static Images API → URL with the polyline + two pins as overlays
//
// Token is MAPBOX_TOKEN (server-side only). When missing, we short-circuit to
// null and log once per request so dev without a token still works.

const TOKEN = process.env.MAPBOX_TOKEN ?? "";
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

export async function buildWalkMapUrl(
  fromLat: number,
  fromLon: number,
  toLat: number,
  toLon: number
): Promise<string | null> {
  if (!TOKEN) {
    console.warn("[mapbox] MAPBOX_TOKEN not set; walk maps disabled");
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
