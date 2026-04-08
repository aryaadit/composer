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
  stops: { address: string; latitude: number; longitude: number }[]
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
  return url;
}
