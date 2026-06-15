// Google Places API helpers for batch-fetching venue details and photos.
// Used by scripts and admin API routes — not called from client components.

function getApiKey(): string {
  return process.env.GOOGLE_PLACES_API_KEY ?? "";
}

const FIELD_MASK = [
  "displayName",
  "formattedAddress",
  "location",
  "nationalPhoneNumber",
  "internationalPhoneNumber",
  "websiteUri",
  "googleMapsUri",
  "rating",
  "userRatingCount",
  "priceLevel",
  "priceRange",
  "businessStatus",
  "editorialSummary",
  "currentOpeningHours",
  "regularOpeningHours",
  "photos",
  "types",
  "primaryType",
  "primaryTypeDisplayName",
  "addressDescriptor",
  "takeout",
  "delivery",
  "dineIn",
  "reservable",
  "servesLunch",
  "servesDinner",
  "servesBeer",
  "servesWine",
  "servesBrunch",
  "servesVegetarianFood",
  "servesCocktails",
  "servesDessert",
  "servesCoffee",
  "outdoorSeating",
  "liveMusic",
  "restroom",
  "goodForChildren",
  "allowsDogs",
  "paymentOptions",
  "accessibilityOptions",
  "goodForWatchingSports",
].join(",");

// Only strip fields that are truly useless bulk (reviews, HTML formatting, etc.)
const FIELDS_TO_STRIP = [
  "addressComponents",
  "reviews",
  "adrFormatAddress",
  "googleMapsLinks",
  "postalAddress",
  "plusCode",
  "viewport",
  "utcOffsetMinutes",
];

export type PlaceData = Record<string, unknown>;

/**
 * Fetch Places API v1 details for a single place_id. Returns null
 * on missing API key or any non-2xx response (logged via
 * console.error); intentional graceful degradation so callers can
 * surface a domain-appropriate fallback rather than throwing.
 *
 * `opts.withReviews: true` widens the FieldMask to include
 * `reviews` AND skips the `reviews` strip step, so the caller gets
 * back the top user reviews. Default is false (reviews are bulky;
 * most callers don't need them). The add-venue drafter path uses
 * this to feed review snippets as PROMPT CONTEXT ONLY (signal for
 * vibe / occasion / curation_note); review text is never persisted
 * to the sheet or DB.
 */
export async function fetchPlaceDetails(
  placeId: string,
  opts?: { withReviews?: boolean }
): Promise<PlaceData | null> {
  if (!getApiKey()) {
    console.error("[google-places] GOOGLE_PLACES_API_KEY not set");
    return null;
  }

  const fieldMask = opts?.withReviews ? `${FIELD_MASK},reviews` : FIELD_MASK;

  const res = await fetch(
    `https://places.googleapis.com/v1/places/${placeId}`,
    {
      headers: {
        "X-Goog-Api-Key": getApiKey(),
        "X-Goog-FieldMask": fieldMask,
      },
    }
  );

  if (!res.ok) {
    console.error(
      `[google-places] Failed to fetch ${placeId}: ${res.status}`
    );
    return null;
  }

  const data = (await res.json()) as Record<string, unknown>;
  return trimPlaceData(data, { keepReviews: opts?.withReviews ?? false });
}

function trimPlaceData(
  data: Record<string, unknown>,
  opts: { keepReviews: boolean }
): PlaceData {
  const trimmed = { ...data };
  for (const field of FIELDS_TO_STRIP) {
    if (field === "reviews" && opts.keepReviews) continue;
    delete trimmed[field];
  }
  return trimmed;
}

/**
 * Places API v1 Text Search. Used by the add-venue route as the
 * fallback path when a Maps URL has no ChIJ place_id (the common
 * case for share / shortlinks, which carry only a `!1s` hex feature
 * ID and a `/g/` MID — neither usable as a place_id). The caller
 * supplies the name parsed from `/maps/place/<NAME>/` plus a
 * locationBias circle centered on the URL's pin coordinates so the
 * top candidate is the venue at THAT spot, not a same-named place
 * elsewhere in the city.
 *
 * Returns up to a handful of candidates (the API caps at 20; the
 * field mask only requests id + location + displayName so payloads
 * stay small). Returns an empty array on missing key, non-2xx, or
 * an empty response body.
 */
export async function textSearchPlaces(opts: {
  textQuery: string;
  locationBias?: {
    latitude: number;
    longitude: number;
    radiusMeters: number;
  };
}): Promise<
  Array<{
    id: string;
    location: { latitude: number; longitude: number };
    displayName: { text: string };
  }>
> {
  if (!getApiKey()) {
    console.error("[google-places] GOOGLE_PLACES_API_KEY not set");
    return [];
  }

  const body: Record<string, unknown> = { textQuery: opts.textQuery };
  if (opts.locationBias) {
    body.locationBias = {
      circle: {
        center: {
          latitude: opts.locationBias.latitude,
          longitude: opts.locationBias.longitude,
        },
        radius: opts.locationBias.radiusMeters,
      },
    };
  }

  const res = await fetch(
    "https://places.googleapis.com/v1/places:searchText",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": getApiKey(),
        "X-Goog-FieldMask": "places.id,places.location,places.displayName",
      },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    console.error(
      `[google-places] Text Search failed: ${res.status} for "${opts.textQuery}"`
    );
    return [];
  }

  const data = (await res.json()) as {
    places?: Array<{
      id?: unknown;
      location?: { latitude?: unknown; longitude?: unknown };
      displayName?: { text?: unknown };
    }>;
  };

  const places = data.places ?? [];
  const result: Array<{
    id: string;
    location: { latitude: number; longitude: number };
    displayName: { text: string };
  }> = [];
  for (const p of places) {
    const id = typeof p.id === "string" ? p.id : null;
    const lat =
      typeof p.location?.latitude === "number" ? p.location.latitude : null;
    const lng =
      typeof p.location?.longitude === "number" ? p.location.longitude : null;
    const name =
      typeof p.displayName?.text === "string" ? p.displayName.text : null;
    if (id && lat != null && lng != null && name) {
      result.push({ id, location: { latitude: lat, longitude: lng }, displayName: { text: name } });
    }
  }
  return result;
}

export async function fetchPlacePhoto(
  photoName: string,
  maxWidthPx = 800
): Promise<Buffer | null> {
  if (!getApiKey()) {
    console.error("[google-places] GOOGLE_PLACES_API_KEY not set");
    return null;
  }

  const res = await fetch(
    `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=${maxWidthPx}&key=${getApiKey()}`
  );

  if (!res.ok) {
    console.error(
      `[google-places] Failed to fetch photo ${photoName}: ${res.status}`
    );
    return null;
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
