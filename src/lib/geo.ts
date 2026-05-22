const MANHATTAN_GRID_FACTOR = 1.3;
const WALK_SPEED_KMH = 4.8; // average walking speed

export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function walkDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  return haversineKm(lat1, lon1, lat2, lon2) * MANHATTAN_GRID_FACTOR;
}

export function walkTimeMinutes(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const km = walkDistanceKm(lat1, lon1, lat2, lon2);
  return Math.round((km / WALK_SPEED_KMH) * 60);
}

export function buildGoogleMapsUrl(
  stops: {
    latitude: number;
    longitude: number;
    google_place_id?: string | null;
  }[]
): string {
  if (stops.length === 0) return "https://maps.google.com";

  const origin = `${stops[0].latitude},${stops[0].longitude}`;
  const destination = `${stops[stops.length - 1].latitude},${stops[stops.length - 1].longitude}`;
  const waypoints = stops
    .slice(1, -1)
    .map((s) => `${s.latitude},${s.longitude}`)
    .join("|");

  let url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&travelmode=walking`;
  if (waypoints) {
    url += `&waypoints=${encodeURIComponent(waypoints)}`;
  }

  // Add place_id params alongside coords when EVERY stop has one. Google's
  // Directions API requires waypoint_place_ids to have the same count as
  // waypoints — partial coverage is invalid and gets the whole batch
  // ignored. Coords stay as the source-of-truth fallback. With place_ids
  // present, Maps renders the route with actual venue names and listings
  // instead of bare coordinate pins.
  const placeIds = stops.map((s) => s.google_place_id);
  const allHavePlaceIds = placeIds.every(
    (id): id is string => typeof id === "string" && id.length > 0
  );
  if (allHavePlaceIds) {
    url += `&origin_place_id=${placeIds[0]}`;
    url += `&destination_place_id=${placeIds[placeIds.length - 1]}`;
    const waypointPids = placeIds.slice(1, -1).join("|");
    if (waypointPids) {
      url += `&waypoint_place_ids=${encodeURIComponent(waypointPids)}`;
    }
  }
  return url;
}
