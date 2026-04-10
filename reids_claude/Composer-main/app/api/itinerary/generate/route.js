import { NextResponse } from 'next/server';
import { buildItinerary, planStopMix } from '@/lib/itinerary-engine';
import { VIBES, BUDGET_TIERS, ALL_NEIGHBORHOODS, CURATED_VENUES } from '@/lib/constants';

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const PLACES_API_URL = 'https://places.googleapis.com/v1/places:searchText';

/**
 * POST /api/itinerary/generate
 *
 * The main endpoint. Takes all user selections and returns a full
 * timed itinerary with multiple stops.
 *
 * Body: {
 *   neighborhoods: string[],  // neighborhood IDs
 *   vibeId: string,
 *   budgetId: string,
 *   dateTypeId: string,
 *   date: string,             // "2026-04-12"
 *   endTime: string,          // "21:00"
 *   startTime: string,        // "18:00"
 * }
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const {
      neighborhoods = [],
      vibeId,
      budgetId,
      dateTypeId,
      date,
      endTime = '21:00',
      startTime = '18:00',
    } = body;

    if (!vibeId || !budgetId || !dateTypeId || !date) {
      return NextResponse.json(
        { error: 'vibeId, budgetId, dateTypeId, and date are required' },
        { status: 400 }
      );
    }

    const vibe = VIBES.find((v) => v.id === vibeId);
    const budget = BUDGET_TIERS.find((b) => b.id === budgetId);
    const selectedNeighborhoods = neighborhoods
      .map((id) => ALL_NEIGHBORHOODS.find((n) => n.id === id))
      .filter(Boolean);

    if (selectedNeighborhoods.length === 0) {
      return NextResponse.json(
        { error: 'At least one valid neighborhood is required' },
        { status: 400 }
      );
    }

    // 1. Plan the stop mix based on date type and vibe
    const timeSlot = { startHour: parseInt(startTime.split(':')[0]) };
    const stopPlan = planStopMix(dateTypeId, vibeId, startTime, endTime);

    // 2. Search for places for each stop
    const places = [];
    for (const stop of stopPlan) {
      // Pick a random neighborhood from their selections
      const hood =
        selectedNeighborhoods[Math.floor(Math.random() * selectedNeighborhoods.length)];

      // Check curated venues first for activities/culture
      if (['activity', 'culture'].includes(stop.category)) {
        const curatedMatch = CURATED_VENUES.find(
          (v) =>
            v.vibes.includes(vibeId) &&
            (neighborhoods.includes(v.neighborhood) || neighborhoods.length === 0)
        );
        if (curatedMatch) {
          places.push({
            name: curatedMatch.name,
            address: curatedMatch.address,
            lat: null, // Would need geocoding
            lng: null,
            rating: null,
            priceLevel: budget.priceLevel,
            photoUrl: null,
            category: curatedMatch.type,
            source: 'curated',
            bookingUrl: curatedMatch.bookingUrl,
            role: stop.role,
            suggestedDuration: stop.suggestedDuration,
            costEstimate: curatedMatch.priceRange?.min || 30,
          });
          continue;
        }
      }

      // Search Google Places
      const searchTerms = vibe?.searchTerms || [];
      const query = `${searchTerms[0] || ''} ${stop.category === 'restaurant' ? 'restaurant' : stop.category} ${hood.searchTerm}`.trim();

      try {
        const place = await searchGooglePlaces(query, stop.category, budget);
        if (place) {
          places.push({
            ...place,
            role: stop.role,
            suggestedDuration: stop.suggestedDuration,
          });
        }
      } catch (err) {
        console.error(`Failed to find place for "${query}":`, err.message);
      }
    }

    if (places.length === 0) {
      return NextResponse.json(
        { error: 'Could not find any places matching your criteria. Try adjusting your filters.' },
        { status: 404 }
      );
    }

    // 3. Build the timed itinerary
    const itinerary = buildItinerary({
      places,
      dateTypeId,
      vibeId,
      startTime,
      budgetTier: budget,
    });

    return NextResponse.json({
      itinerary,
      meta: {
        neighborhoods: selectedNeighborhoods.map((n) => n.name),
        vibe: vibe?.name,
        budget: budget?.name,
        dateType: dateTypeId,
        date,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Itinerary generation error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Search Google Places for a single place matching the query
 */
async function searchGooglePlaces(query, category, budget) {
  if (!GOOGLE_PLACES_API_KEY) {
    // Return mock data if no API key
    return {
      name: `Sample ${category}`,
      address: 'New York, NY',
      lat: 40.7128 + (Math.random() - 0.5) * 0.02,
      lng: -74.006 + (Math.random() - 0.5) * 0.02,
      rating: 4.2 + Math.random() * 0.6,
      priceLevel: budget?.priceLevel || 2,
      photoUrl: null,
      category,
      source: 'mock',
      costEstimate: budget?.range?.max
        ? Math.round((budget.range.min + budget.range.max) / 4)
        : 50,
    };
  }

  const priceLevelMap = {
    1: ['PRICE_LEVEL_INEXPENSIVE'],
    2: ['PRICE_LEVEL_MODERATE'],
    3: ['PRICE_LEVEL_MODERATE', 'PRICE_LEVEL_EXPENSIVE'],
    4: ['PRICE_LEVEL_EXPENSIVE', 'PRICE_LEVEL_VERY_EXPENSIVE'],
  };

  const searchBody = {
    textQuery: query,
    maxResultCount: 5,
    languageCode: 'en',
    locationBias: {
      rectangle: {
        low: { latitude: 40.57, longitude: -74.04 },
        high: { latitude: 40.88, longitude: -73.87 },
      },
    },
    priceLevels: priceLevelMap[budget?.priceLevel] || ['PRICE_LEVEL_MODERATE'],
  };

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
      'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
      'X-Goog-FieldMask': fieldMask,
    },
    body: JSON.stringify(searchBody),
  });

  if (!response.ok) return null;

  const data = await response.json();
  const results = (data.places || []).filter(
    (p) => !p.businessStatus || p.businessStatus === 'OPERATIONAL'
  );

  if (results.length === 0) return null;

  // Pick a random result from top 3 for variety
  const pick = results[Math.floor(Math.random() * Math.min(3, results.length))];

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
  };
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
