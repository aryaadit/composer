import { NextResponse } from 'next/server';
import {
  buildItinerary,
  planStopMix,
  getMaxWalkMinutes,
  walkMinutesToMeters,
  getWalkingMinutes,
} from '@/lib/itinerary-engine';
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
      // Client can force bad weather (e.g. "plan for rain" toggle). Otherwise
      // we fetch from Open-Meteo below.
      weatherOverride = null,
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

    // 1. Determine weather + walking cap
    const weather =
      weatherOverride !== null
        ? { badWeather: !!weatherOverride, source: 'client' }
        : await fetchNycWeather(date);
    const badWeather = !!weather.badWeather;
    const maxWalkMinutes = getMaxWalkMinutes(dateTypeId, badWeather);
    const anchorRadiusMeters = walkMinutesToMeters(maxWalkMinutes);

    // 2. Plan the stop mix (durations + walk buffers use the cap)
    const stopPlan = planStopMix(dateTypeId, vibeId, startTime, endTime, badWeather);

    // 3. Collect dietary flags for nudging queries
    const diet = onboarding?.diet || [];
    const avoidCategories = new Set();
    diet.forEach((d) => (DIET_FILTERS[d] || []).forEach((c) => avoidCategories.add(c)));
    const dietQueryHint = buildDietHint(diet);

    // 4. Search for places for each stop, anchoring to the previous one so
    //    every walk stays within the per-date-type cap.
    const places = [];
    for (const stop of stopPlan) {
      /* Skip categories explicitly clashing with diet (e.g. vegan + dive-bar) */
      if (avoidCategories.has(stop.category)) continue;

      const hood =
        selectedNeighborhoods[Math.floor(Math.random() * selectedNeighborhoods.length)];

      const prevPlace = places.length > 0 ? places[places.length - 1] : null;
      const anchor =
        prevPlace && prevPlace.lat && prevPlace.lng
          ? { lat: prevPlace.lat, lng: prevPlace.lng }
          : null;

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
        const place = await searchGooglePlaces(query, stop.category, budget, {
          anchor,
          anchorRadiusMeters,
          maxWalkMinutes,
        });
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

    // 5. Build the timed itinerary (buildItinerary tags any walks that exceed the cap)
    const itinerary = buildItinerary({
      places,
      dateTypeId,
      vibeId,
      startTime,
      budgetTier: budget,
      badWeather,
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
        weather,
        walkingCap: {
          maxWalkMinutes,
          reason: badWeather
            ? 'bad-weather'
            : dateTypeId === 'first-date' || dateTypeId === 'early-dating'
              ? 'first-or-early-date'
              : 'standard',
        },
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

/* ─── Google Places ───────────────────────────────────────
   When an anchor point (previous stop) is supplied, the search biases to
   a tight circle around it and the result nearest to the anchor (and
   within the walking cap) wins. Without an anchor, we fall back to the
   full NYC rectangle and a random top-3 pick. */
async function searchGooglePlaces(
  query,
  category,
  budget,
  { anchor = null, anchorRadiusMeters = null, maxWalkMinutes = null } = {}
) {
  if (!GOOGLE_PLACES_API_KEY) {
    // Mock mode: fabricate a place that is guaranteed within the cap so
    // local dev without a key still produces a valid itinerary.
    const base = anchor
      ? { lat: anchor.lat, lng: anchor.lng }
      : { lat: 40.7128, lng: -74.006 };
    // ~0.003 deg ≈ 250 m ≈ 3 min walk
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

  /* Tight circle bias around the previous stop when we have one,
     otherwise the full NYC rectangle. */
  const locationBias =
    anchor && anchorRadiusMeters
      ? {
          circle: {
            center: { latitude: anchor.lat, longitude: anchor.lng },
            radius: Math.max(200, anchorRadiusMeters),
          },
        }
      : {
          rectangle: {
            low: { latitude: 40.57, longitude: -74.04 },
            high: { latitude: 40.88, longitude: -73.87 },
          },
        };

  const searchBody = {
    textQuery: query,
    maxResultCount: 10,
    languageCode: 'en',
    locationBias,
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

  /* If we have an anchor, rank results by actual walking time and keep
     only those within the cap. If none qualify, pick the closest anyway
     (we flag the over-cap stop in the itinerary meta). */
  let pick;
  if (anchor && maxWalkMinutes) {
    const ranked = results
      .filter((p) => p.location?.latitude && p.location?.longitude)
      .map((p) => ({
        place: p,
        walkMin: getWalkingMinutes(
          anchor.lat,
          anchor.lng,
          p.location.latitude,
          p.location.longitude
        ),
      }))
      .sort((a, b) => a.walkMin - b.walkMin);

    const withinCap = ranked.filter((r) => r.walkMin <= maxWalkMinutes);
    if (withinCap.length > 0) {
      // Random pick among top 3 within the cap for variety
      pick = withinCap[Math.floor(Math.random() * Math.min(3, withinCap.length))].place;
    } else if (ranked.length > 0) {
      pick = ranked[0].place;
    }
  }

  if (!pick) {
    pick = results[Math.floor(Math.random() * Math.min(3, results.length))];
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
  };
}

/* ─── Weather (Open-Meteo, no API key) ─────────────────────
   Returns { badWeather: bool, reason: string|null, raw: {...}, source }.
   Good weather = no precip > 2 mm, temps between 32°F and 95°F, wind ≤ 30 km/h.
   Any network/parse failure is treated as good weather so the endpoint
   never fails because the weather lookup did. */
async function fetchNycWeather(dateStr) {
  try {
    if (!dateStr) return { badWeather: false, source: 'missing-date' };
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude', '40.7128');
    url.searchParams.set('longitude', '-74.006');
    url.searchParams.set(
      'daily',
      'precipitation_sum,temperature_2m_max,temperature_2m_min,wind_speed_10m_max'
    );
    url.searchParams.set('temperature_unit', 'fahrenheit');
    url.searchParams.set('wind_speed_unit', 'kmh');
    url.searchParams.set('precipitation_unit', 'mm');
    url.searchParams.set('timezone', 'America/New_York');
    url.searchParams.set('start_date', dateStr);
    url.searchParams.set('end_date', dateStr);

    const res = await fetch(url.toString(), { next: { revalidate: 3600 } });
    if (!res.ok) return { badWeather: false, source: 'open-meteo-error' };
    const data = await res.json();
    const d = data?.daily;
    if (!d) return { badWeather: false, source: 'open-meteo-nodata' };

    const precip = d.precipitation_sum?.[0] ?? 0;
    const tMax = d.temperature_2m_max?.[0] ?? 60;
    const tMin = d.temperature_2m_min?.[0] ?? 60;
    const wind = d.wind_speed_10m_max?.[0] ?? 0;

    let reason = null;
    if (precip >= 2) reason = 'rain';
    else if (tMax < 32) reason = 'freezing';
    else if (tMin < 20) reason = 'freezing';
    else if (tMax > 95) reason = 'heat';
    else if (wind > 30) reason = 'wind';

    return {
      badWeather: !!reason,
      reason,
      raw: { precipMm: precip, tMaxF: tMax, tMinF: tMin, windKmh: wind },
      source: 'open-meteo',
    };
  } catch (err) {
    return { badWeather: false, source: 'open-meteo-exception', error: err.message };
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
