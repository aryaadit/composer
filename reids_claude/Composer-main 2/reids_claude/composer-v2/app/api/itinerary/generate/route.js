import { NextResponse } from 'next/server';
import { buildItinerary, planStopMix } from '@/lib/itinerary-engine';
import { VIBES, BUDGET_TIERS, ALL_NEIGHBORHOODS, CURATED_VENUES } from '@/lib/constants';

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const PLACES_API_URL = 'https://places.googleapis.com/v1/places:searchText';

/* Map onboarding vibe labels → internal vibe ids, so onboarding vibes
   can act as a fallback / secondary signal. */
const VIBE_LABEL_TO_ID = {
  'Cozy & intimate': 'cozy',
  'Fun & spontaneous': 'fun',
  'Classy night out': 'classy',
  'Artsy & creative': 'creative',
  'Active & outdoors': 'active',
  'Casual & chill': 'chill',
  'Hidden gems': 'cozy',
  'Late-night': 'fun',
  'Live music': 'creative',
  'Rooftop & views': 'classy',
  'Wild & adventurous': 'active',
  'Old-school romantic': 'cozy',
  "Chef's tasting": 'classy',
  'Culture & shows': 'creative',
};

/* Diet labels → disallowed place categories.  The list is intentionally
   conservative — it just nudges categories, it doesn't hard-fail. */
const DIET_FILTERS = {
  Vegan: ['bar'],
  Vegetarian: [],
  'Gluten Free': [],
  Kosher: [],
  Halal: [],
};

export async function POST(request) {
  try {
    const body = await request.json();
    const {
      neighborhoods = [],
      vibeId: planFlowVibeId,
      budgetId,
      dateTypeId,
      date,
      endTime = '21:00',
      startTime = '18:00',
      onboarding = null,
    } = body;

    if (!planFlowVibeId || !budgetId || !dateTypeId || !date) {
      return NextResponse.json(
        { error: 'vibeId, budgetId, dateTypeId, and date are required' },
        { status: 400 }
      );
    }

    /* Use planflow vibe as primary; fall back to best-matching onboarding vibe. */
    let vibeId = planFlowVibeId;
    if (!VIBES.find((v) => v.id === vibeId) && onboarding?.vibes?.length) {
      const mapped = onboarding.vibes
        .map((label) => VIBE_LABEL_TO_ID[label])
        .filter(Boolean);
      if (mapped[0]) vibeId = mapped[0];
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

    // 1. Plan the stop mix
    const stopPlan = planStopMix(dateTypeId, vibeId, startTime, endTime);

    // 2. Collect dietary flags for nudging queries
    const diet = onboarding?.diet || [];
    const avoidCategories = new Set();
    diet.forEach((d) => (DIET_FILTERS[d] || []).forEach((c) => avoidCategories.add(c)));
    const dietQueryHint = buildDietHint(diet);

    // 3. Search for places for each stop
    const places = [];
    for (const stop of stopPlan) {
      /* Skip categories explicitly clashing with diet (e.g. vegan + dive-bar) */
      if (avoidCategories.has(stop.category)) continue;

      const hood =
        selectedNeighborhoods[Math.floor(Math.random() * selectedNeighborhoods.length)];

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
            lat: null,
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

      const searchTerms = vibe?.searchTerms || [];
      const query = [
        dietQueryHint,
        searchTerms[0] || '',
        stop.category === 'restaurant' ? 'restaurant' : stop.category,
        hood.searchTerm,
      ]
        .filter(Boolean)
        .join(' ')
        .trim();

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
        {
          error:
            'Could not find any places matching your criteria. Try adjusting your filters.',
        },
        { status: 404 }
      );
    }

    // 4. Build the timed itinerary
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
        onboardingApplied: !!onboarding,
        diet,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Itinerary generation error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

function buildDietHint(diet = []) {
  if (!diet.length) return '';
  if (diet.includes('Vegan')) return 'vegan';
  if (diet.includes('Vegetarian')) return 'vegetarian';
  if (diet.includes('Gluten Free')) return 'gluten free';
  if (diet.includes('Kosher')) return 'kosher';
  if (diet.includes('Halal')) return 'halal';
  return '';
}

/* ─── Google Places (unchanged from v1) ─────────────────── */
async function searchGooglePlaces(query, category, budget) {
  if (!GOOGLE_PLACES_API_KEY) {
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
