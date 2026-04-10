import { NextResponse } from 'next/server';

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const PLACES_API_URL = 'https://places.googleapis.com/v1/places:searchText';

/**
 * POST /api/places/search
 *
 * Search Google Places (New) API with filters for date planning.
 *
 * Body: {
 *   query: string,           // e.g. "romantic restaurant West Village Manhattan"
 *   types: string[],         // e.g. ["restaurant", "bar"]
 *   maxResults: number,      // default 5
 *   priceLevels: string[],   // e.g. ["PRICE_LEVEL_MODERATE"]
 *   openNow: boolean,        // filter to only open places
 * }
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const {
      query,
      types = [],
      maxResults = 5,
      priceLevels = [],
      openNow = false,
    } = body;

    if (!query) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }

    if (!GOOGLE_PLACES_API_KEY) {
      return NextResponse.json(
        { error: 'Google Places API key not configured' },
        { status: 500 }
      );
    }

    // Build the request body for Google Places (New) Text Search
    const searchBody = {
      textQuery: query,
      maxResultCount: maxResults,
      languageCode: 'en',
      locationBias: {
        rectangle: {
          // Bounding box for Manhattan + Brooklyn
          low: { latitude: 40.57, longitude: -74.04 },
          high: { latitude: 40.88, longitude: -73.87 },
        },
      },
    };

    if (types.length > 0) {
      searchBody.includedType = types[0]; // API only supports one type at a time
    }

    if (priceLevels.length > 0) {
      searchBody.priceLevels = priceLevels;
    }

    if (openNow) {
      searchBody.openNow = true;
    }

    const fieldMask = [
      'places.displayName',
      'places.formattedAddress',
      'places.location',
      'places.rating',
      'places.userRatingCount',
      'places.priceLevel',
      'places.photos',
      'places.types',
      'places.websiteUri',
      'places.regularOpeningHours',
      'places.primaryTypeDisplayName',
      'places.id',
      'places.businessStatus',
    ].join(',');

    const response = await fetch(PLACES_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
        'X-Goog-FieldMask': fieldMask,
      },
      body: JSON.stringify(searchBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Google Places API error:', errorText);
      return NextResponse.json(
        { error: 'Failed to search places', details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();
    const places = (data.places || []).map((place) => ({
      id: place.id,
      name: place.displayName?.text || 'Unknown',
      address: place.formattedAddress || '',
      lat: place.location?.latitude,
      lng: place.location?.longitude,
      rating: place.rating || null,
      ratingCount: place.userRatingCount || 0,
      priceLevel: parsePriceLevel(place.priceLevel),
      photoReference: place.photos?.[0]?.name || null,
      types: place.types || [],
      website: place.websiteUri || null,
      category: place.primaryTypeDisplayName?.text || 'Place',
      hours: place.regularOpeningHours?.weekdayDescriptions || [],
      businessStatus: place.businessStatus || 'OPERATIONAL',
      source: 'google_places',
    }));

    return NextResponse.json({ places, total: places.length });
  } catch (error) {
    console.error('Places search error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

function parsePriceLevel(level) {
  const map = {
    PRICE_LEVEL_FREE: 0,
    PRICE_LEVEL_INEXPENSIVE: 1,
    PRICE_LEVEL_MODERATE: 2,
    PRICE_LEVEL_EXPENSIVE: 3,
    PRICE_LEVEL_VERY_EXPENSIVE: 4,
  };
  return map[level] ?? 2;
}
