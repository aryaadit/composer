/**
 * Shared Google Places text-search helper.
 *
 * Extracted from app/api/itinerary/generate/route.js so both the main
 * generate endpoint AND the add-stop endpoint can reuse the same search
 * logic (ranking by walking distance, price fit, rating; hard bound on
 * over-cap picks; tight NYC rectangle fallback).
 *
 * This module runs on the server only — it hits process.env directly.
 */

import { getWalkingMinutes } from './itinerary-engine';

/* Straight-line distance in meters between two lat/lng points. Used as
   a hard boundary check in the ranker, since Google Places Text Search
   only accepts circle anchors as a soft locationBias (not a real
   locationRestriction). Without this the first-stop centroid search
   could drift outside the selected neighborhood. */
function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000; // earth radius in meters
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const PLACES_API_URL = 'https://places.googleapis.com/v1/places:searchText';

const CATEGORY_TO_GOOGLE_TYPE = {
  restaurant: 'restaurant',
  bar: 'bar',
  cafe: 'cafe',
  activity: 'tourist_attraction',
  outdoors: 'park',
  culture: 'museum',
};

export function getGoogleType(category) {
  return CATEGORY_TO_GOOGLE_TYPE[category] || category;
}

export function parsePriceLevel(level) {
  const map = {
    PRICE_LEVEL_FREE: 0,
    PRICE_LEVEL_INEXPENSIVE: 1,
    PRICE_LEVEL_MODERATE: 2,
    PRICE_LEVEL_EXPENSIVE: 3,
    PRICE_LEVEL_VERY_EXPENSIVE: 4,
  };
  return map[level] ?? 2;
}

/**
 * Text-search Google Places with optional anchor + walking cap.
 *
 * Opts:
 *   anchor              – { lat, lng } used for hard locationRestriction.
 *                         When omitted, we bias (not restrict) to a tight
 *                         NYC rectangle that excludes New Jersey.
 *   anchorRadiusMeters  – radius of the locationRestriction circle.
 *   maxWalkMinutes      – if set, only candidates within this walking cap
 *                         are eligible. Ignored for the first stop (no
 *                         previous place to walk from).
 *   acceptOverCap       – allow a pick slightly over the walking cap.
 *                         Capped at 2 × maxWalkMinutes internally so we
 *                         never return a 40-minute walk.
 *   relaxPriceLevel     – price becomes a soft ranking hint, never a hard
 *                         filter. Currently always true in the caller.
 *   includedType        – Google's text-search type filter.
 *   excludeNames        – Set of normalized names to skip (dedupe).
 *   normalizeName       – matching normalizer for excludeNames.
 */
export async function searchGooglePlaces(
  query,
  category,
  budget,
  {
    anchor = null,
    anchorRadiusMeters = null,
    maxWalkMinutes = null,
    relaxPriceLevel = false,
    acceptOverCap = false,
    includedType = null,
    excludeNames = null,
    normalizeName = null,
  } = {}
) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;

  if (!apiKey) {
    // Mock mode: fabricate a place that is guaranteed within the cap so
    // local dev without a key still produces a valid itinerary.
    const base = anchor
      ? { lat: anchor.lat, lng: anchor.lng }
      : { lat: 40.7128, lng: -74.006 };
    const jitter = 0.002;
    return {
      name: `Sample ${category}`,
      address: 'New York, NY',
      lat: base.lat + (Math.random() - 0.5) * jitter,
      lng: base.lng + (Math.random() - 0.5) * jitter,
      rating: 4.2 + Math.random() * 0.6,
      priceLevel: budget?.priceLevel || 2,
      photoUrl: null,
      category,
      source: 'mock',
      costEstimate: 50,
    };
  }

  /* Price is never sent to Google as a hard filter — it's applied as a
     soft ranking boost below instead. NYC spots are often priced one
     tier higher than users expect, so Google's priceLevels filter is far
     too strict for our use case. */
  const preferredPriceLevel = budget?.priceLevel || 2;

  const searchBody = {
    textQuery: query,
    maxResultCount: 20,
    languageCode: 'en',
  };
  if (includedType) {
    searchBody.includedType = includedType;
  }

  if (anchor && anchorRadiusMeters) {
    /* IMPORTANT: Google Places Text Search does NOT accept
       `locationRestriction.circle` — that's only valid on the Nearby
       Search endpoint. For Text Search, circles can only appear under
       `locationBias`, which is a soft hint. We use the soft bias here
       and then hard-enforce the radius in the post-ranker below
       (radiusCheck) so the anchor still acts as a real boundary. */
    searchBody.locationBias = {
      circle: {
        center: { latitude: anchor.lat, longitude: anchor.lng },
        radius: Math.max(200, anchorRadiusMeters),
      },
    };
  } else {
    /* Tightened NYC rectangle — excludes Jersey City / Edgewater NJ
       and sticks to the core of Manhattan + Brooklyn. */
    searchBody.locationBias = {
      rectangle: {
        low: { latitude: 40.66, longitude: -74.02 },
        high: { latitude: 40.82, longitude: -73.88 },
      },
    };
  }

  const fieldMask = [
    'places.displayName',
    'places.formattedAddress',
    'places.location',
    'places.rating',
    'places.priceLevel',
    'places.photos',
    'places.primaryTypeDisplayName',
    'places.businessStatus',
  ].join(',');

  const response = await fetch(PLACES_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': fieldMask,
    },
    body: JSON.stringify(searchBody),
  });

  if (!response.ok) return null;

  const data = await response.json();
  let results = (data.places || []).filter(
    (p) => !p.businessStatus || p.businessStatus === 'OPERATIONAL'
  );

  if (excludeNames && excludeNames.size > 0 && normalizeName) {
    results = results.filter((p) => {
      const key = normalizeName(p.displayName?.text || '');
      return key && !excludeNames.has(key);
    });
  }

  if (results.length === 0) return null;

  const scoreByPrice = (p) => {
    const lvl = parsePriceLevel(p.priceLevel);
    if (!lvl) return 0;
    const diff = Math.abs(lvl - preferredPriceLevel);
    return [0, 3, 8, 15][Math.min(3, diff)];
  };

  let pick;
  let pickedWalkMin = null;
  let overCap = false;
  if (anchor) {
    /* Hard radius boundary. `locationBias.circle` above is only a soft
       hint, so we enforce `anchorRadiusMeters` ourselves. A small 25%
       slack handles Google returning places right at the edge of the
       biased circle (e.g. a restaurant 920 m from a 900 m anchor). */
    const radiusCeiling = anchorRadiusMeters
      ? anchorRadiusMeters * 1.25
      : null;

    const ranked = results
      .filter((p) => p.location?.latitude && p.location?.longitude)
      .map((p) => {
        const walkMin = getWalkingMinutes(
          anchor.lat,
          anchor.lng,
          p.location.latitude,
          p.location.longitude
        );
        const meters = haversineMeters(
          anchor.lat,
          anchor.lng,
          p.location.latitude,
          p.location.longitude
        );
        const pricePenalty = scoreByPrice(p);
        const ratingBoost = p.rating ? (p.rating - 4.0) * -2 : 0;
        return {
          place: p,
          walkMin,
          meters,
          score: walkMin + pricePenalty + ratingBoost,
        };
      })
      .filter((r) => (radiusCeiling ? r.meters <= radiusCeiling : true))
      .sort((a, b) => a.score - b.score);

    if (ranked.length === 0) return null;

    if (maxWalkMinutes) {
      const withinCap = ranked.filter((r) => r.walkMin <= maxWalkMinutes);
      if (withinCap.length > 0) {
        const chosen =
          withinCap[Math.floor(Math.random() * Math.min(3, withinCap.length))];
        pick = chosen.place;
        pickedWalkMin = chosen.walkMin;
      } else if (acceptOverCap) {
        const hardCap = maxWalkMinutes * 2;
        const bounded = ranked.filter((r) => r.walkMin <= hardCap);
        if (bounded.length === 0) return null;
        pick = bounded[0].place;
        pickedWalkMin = bounded[0].walkMin;
        overCap = true;
      } else {
        return null;
      }
    } else {
      const topN = ranked.slice(0, Math.min(3, ranked.length));
      const chosen = topN[Math.floor(Math.random() * topN.length)];
      pick = chosen.place;
      pickedWalkMin = chosen.walkMin;
    }
  } else {
    const ranked = results
      .map((p) => {
        const ratingBoost = p.rating ? (p.rating - 4.0) * -2 : 0;
        return { place: p, score: scoreByPrice(p) + ratingBoost };
      })
      .sort((a, b) => a.score - b.score);
    const topN = ranked.slice(0, Math.min(3, ranked.length));
    pick = topN[Math.floor(Math.random() * topN.length)].place;
  }

  return {
    name: pick.displayName?.text || 'Unknown',
    address: pick.formattedAddress || '',
    lat: pick.location?.latitude,
    lng: pick.location?.longitude,
    rating: pick.rating || null,
    priceLevel: parsePriceLevel(pick.priceLevel),
    photoUrl: pick.photos?.[0]?.name
      ? `/api/places/photo?ref=${encodeURIComponent(pick.photos[0].name)}`
      : null,
    category: pick.primaryTypeDisplayName?.text || category,
    source: 'google_places',
    _walkMinFromAnchor: pickedWalkMin,
    _overCap: overCap,
  };
}

/* Normalize a venue name for dedupe: lowercase, strip non-alphanumeric. */
export function normalizeVenueName(name) {
  return (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}
