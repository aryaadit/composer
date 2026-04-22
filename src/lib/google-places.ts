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

export async function fetchPlaceDetails(
  placeId: string
): Promise<PlaceData | null> {
  if (!getApiKey()) {
    console.error("[google-places] GOOGLE_PLACES_API_KEY not set");
    return null;
  }

  const res = await fetch(
    `https://places.googleapis.com/v1/places/${placeId}`,
    {
      headers: {
        "X-Goog-Api-Key": getApiKey(),
        "X-Goog-FieldMask": FIELD_MASK,
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
  return trimPlaceData(data);
}

function trimPlaceData(data: Record<string, unknown>): PlaceData {
  const trimmed = { ...data };
  for (const field of FIELDS_TO_STRIP) {
    delete trimmed[field];
  }
  return trimmed;
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
