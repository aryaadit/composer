import { NextResponse } from 'next/server';
import {
  buildItinerary,
  planStopMix,
  getMaxWalkMinutes,
  walkMinutesToMeters,
} from '@/lib/itinerary-engine';
import { VIBES, BUDGET_TIERS, ALL_NEIGHBORHOODS, CURATED_VENUES } from '@/lib/constants';
import { buildBookingLinks, isBookable } from '@/lib/booking-links';
import { searchGooglePlaces, normalizeVenueName } from '@/lib/places-search';

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
    /* Search circle is deliberately larger than the strict walking cap so
       Google returns enough candidates — we then enforce the actual
       walking cap (including NYC grid adjustment) with a post-filter.
       Minimum 1200 m so even a 5-min bad-weather cap still gets a decent
       candidate pool. */
    const anchorRadiusMeters = Math.max(
      1200,
      walkMinutesToMeters(maxWalkMinutes * 2.2)
    );

    /* ─── Neighborhood anchors ────────────────────────────────────────
       Every search now uses a hard locationRestriction tied to one of
       the user's selected neighborhoods (for the first stop) or to the
       previous stop (for subsequent stops). This is what actually keeps
       recommendations inside the user's picked area — the old code
       biased to the whole NYC rectangle which allowed Google to return
       matches anywhere in the tri-state region.

       HOOD_RADIUS_METERS is big enough to cover a whole NYC neighborhood
       (~10-12 min walk) and is NOT tied to the date type walking cap —
       the cap only applies to walks BETWEEN stops, not to how far the
       first stop can be from the neighborhood centroid.                 */
    const HOOD_RADIUS_METERS = 900;
    const hoodsWithCenters = selectedNeighborhoods.filter((n) => n?.center);
    if (hoodsWithCenters.length === 0) {
      return NextResponse.json(
        { error: 'Selected neighborhoods are missing location data' },
        { status: 400 }
      );
    }
    const pickRandomHood = () =>
      hoodsWithCenters[Math.floor(Math.random() * hoodsWithCenters.length)];

    // 2. Plan the stop mix (durations + walk buffers use the cap)
    const stopPlan = planStopMix(dateTypeId, vibeId, startTime, endTime, badWeather);

    // 3. Collect dietary flags for nudging queries
    const diet = onboarding?.diet || [];
    const avoidCategories = new Set();
    diet.forEach((d) => (DIET_FILTERS[d] || []).forEach((c) => avoidCategories.add(c)));
    const dietQueryHint = buildDietHint(diet);

    // 4. Search for places for each stop, anchoring to the previous one so
    //    every walk stays within the per-date-type cap. We try multiple
    //    query + category variations so a narrow vibe doesn't leave stops
    //    empty.
    const places = [];
    const droppedStops = [];
    const searchTerms = vibe?.searchTerms || [];
    /* Names of places already used in this itinerary, normalized for dedupe. */
    const usedNames = new Set();
    const normalizeName = normalizeVenueName;

    /* Category → Google Places includedType (soft type filter) + fallback
       text terms. Google's textSearch supports includedType which is far
       more reliable than stuffing the category into the text query. */
    const CATEGORY_TO_GOOGLE_TYPE = {
      restaurant: 'restaurant',
      bar: 'bar',
      cafe: 'cafe',
      activity: 'tourist_attraction',
      outdoors: 'park',
      culture: 'museum',
    };

    /* Category fallbacks: if the planned category can't be found within the
       cap, try these alternatives (still within the cap) before giving up. */
    const CATEGORY_FALLBACKS = {
      restaurant: ['restaurant', 'bar', 'cafe'],
      bar: ['bar', 'restaurant', 'cafe'],
      cafe: ['cafe', 'bar', 'restaurant'],
      activity: ['activity', 'cafe', 'bar'],
      outdoors: ['outdoors', 'cafe', 'restaurant'],
      culture: ['culture', 'cafe', 'bar'],
    };

    for (const stop of stopPlan) {
      /* Skip categories explicitly clashing with diet (e.g. vegan + dive-bar) */
      if (avoidCategories.has(stop.category)) continue;

      const hood = pickRandomHood();

      const prevPlace = places.length > 0 ? places[places.length - 1] : null;
      const firstStop = !(prevPlace && prevPlace.lat && prevPlace.lng);
      /* First stop → anchor on the selected neighborhood centroid with a
         hood-sized radius. There's no previous place to walk from, so the
         date-type walking cap doesn't apply here.
         Subsequent stops → anchor on the previous place with the tighter
         date-type walking cap. */
      const anchor = firstStop
        ? { lat: hood.center.lat, lng: hood.center.lng }
        : { lat: prevPlace.lat, lng: prevPlace.lng };
      const radiusForThisStop = firstStop ? HOOD_RADIUS_METERS : anchorRadiusMeters;
      const walkCapForThisStop = firstStop ? null : maxWalkMinutes;

      /* Curated venues first for activity/culture (only if anchor check OK) */
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

      /* Build a cascade of category + query variations to try. */
      const cats = CATEGORY_FALLBACKS[stop.category] || [stop.category];
      const vibeWord = searchTerms[0] || '';

      /* Helper: run the full category/query cascade with a given set of
         search options. Returns the first non-duplicate place or null.
         When firstStop is true we stuff the neighborhood name into the
         text query too so Google prefers matches whose name/description
         mention that area. */
      const runCascade = async (opts) => {
        for (const cat of cats) {
          const googleType = CATEGORY_TO_GOOGLE_TYPE[cat] || cat;
          const variations = firstStop
            ? [
                [dietQueryHint, vibeWord, cat, hood.searchTerm].filter(Boolean).join(' ').trim(),
                [dietQueryHint, cat, hood.searchTerm].filter(Boolean).join(' ').trim(),
                [cat, hood.searchTerm].filter(Boolean).join(' ').trim(),
              ]
            : [
                [dietQueryHint, vibeWord, cat].filter(Boolean).join(' ').trim(),
                [dietQueryHint, cat].filter(Boolean).join(' ').trim(),
                cat,
              ];
          for (const q of variations) {
            if (!q) continue;
            try {
              const p = await searchGooglePlaces(q, cat, budget, {
                anchor: opts.anchor !== undefined ? opts.anchor : anchor,
                anchorRadiusMeters:
                  opts.anchorRadiusMeters !== undefined
                    ? opts.anchorRadiusMeters
                    : radiusForThisStop,
                maxWalkMinutes:
                  opts.maxWalkMinutes !== undefined
                    ? opts.maxWalkMinutes
                    : walkCapForThisStop,
                includedType: googleType,
                excludeNames: usedNames,
                normalizeName,
                relaxPriceLevel: opts.relaxPriceLevel,
                acceptOverCap: opts.acceptOverCap,
              });
              if (p) return p;
            } catch (err) {
              console.error(`[itinerary] Places search failed for "${q}":`, err.message);
            }
          }
        }
        return null;
      };

      /* Price is the MOST flexible filter — we never pass it as a hard
         Google-side priceLevels restriction. Instead we use it as a soft
         ranking hint inside searchGooglePlaces, so "prefer cheap" still
         works when plenty of options exist, but price never starves a
         stop to zero results. Every pass uses relaxPriceLevel: true. */

      const searchLog = [];

      // Pass 1: strict walking cap + includedType, no price filter.
      let place = await runCascade({ relaxPriceLevel: true });
      searchLog.push(`pass1=${place ? 'hit' : 'miss'}`);

      // Pass 2 (non-first stops only): accept the closest place even if
      // it's slightly over the walking cap. searchGooglePlaces bounds
      // this at 2x maxWalkMinutes internally so we never return a
      // 40-minute walk. The returned place is tagged _overCap so the
      // UI can show a small warning on that walk.
      if (!place && !firstStop) {
        place = await runCascade({ relaxPriceLevel: true, acceptOverCap: true });
        searchLog.push(`pass2=${place ? 'hit' : 'miss'}`);
      }

      /* Pass 3 (wider radius, still anchored): drop includedType AND the
         vibe word. For non-first stops we widen the anchor radius by 1.5x.
         For the first stop we stay inside the neighborhood radius so we
         don't drift into a different borough. */
      if (!place) {
        try {
          place = await searchGooglePlaces(stop.category, stop.category, budget, {
            anchor,
            anchorRadiusMeters: firstStop
              ? HOOD_RADIUS_METERS
              : anchorRadiusMeters * 1.5,
            maxWalkMinutes: walkCapForThisStop,
            relaxPriceLevel: true,
            acceptOverCap: !firstStop,
            excludeNames: usedNames,
            normalizeName,
          });
          searchLog.push(`pass3=${place ? 'hit' : 'miss'}`);
        } catch (err) {
          console.error('[itinerary] Pass-3 bailout failed:', err.message);
          searchLog.push('pass3=err');
        }
      }

      /* Pass 4 (re-anchor on a different selected hood): the previous
         version dropped the anchor entirely and searched the whole NYC
         rectangle, which happily returned places in NJ / UWS / Harlem
         when the user had picked West Village / SoHo / LES. Instead, we
         now walk through every remaining selected neighborhood centroid
         in order and try anchored searches there. The winning place
         still has to fit inside HOOD_RADIUS_METERS of A selected hood,
         so recommendations stay inside the user's picked area. */
      if (!place && hoodsWithCenters.length > 0) {
        for (const altHood of hoodsWithCenters) {
          if (altHood.id === hood.id) continue;
          try {
            const altPlace = await searchGooglePlaces(
              stop.category,
              stop.category,
              budget,
              {
                anchor: { lat: altHood.center.lat, lng: altHood.center.lng },
                anchorRadiusMeters: HOOD_RADIUS_METERS,
                // For first stop there's still no walking cap; for
                // subsequent stops allow the normal cap + overCap safety.
                maxWalkMinutes: firstStop ? null : maxWalkMinutes,
                relaxPriceLevel: true,
                acceptOverCap: !firstStop,
                excludeNames: usedNames,
                normalizeName,
              }
            );
            if (altPlace) {
              place = altPlace;
              place._rehomedTo = altHood.name;
              searchLog.push(`pass4=${altHood.id}`);
              break;
            }
          } catch (err) {
            console.error('[itinerary] Pass-4 rehome failed:', err.message);
          }
        }
        if (!place) searchLog.push('pass4=miss');
      }

      console.log(
        `[itinerary] stop role=${stop.role} cat=${stop.category} anchor=${!!anchor} ${searchLog.join(' ')}`
      );

      if (place) {
        const key = normalizeName(place.name);
        if (key) usedNames.add(key);
        places.push({
          ...place,
          role: stop.role,
          suggestedDuration: stop.suggestedDuration,
        });
      } else {
        console.warn(
          `[itinerary] Dropped stop: role=${stop.role} category=${stop.category} anchor=${!!anchor} log=${searchLog.join(',')}`
        );
        droppedStops.push({
          role: stop.role,
          category: stop.category,
          searchLog,
        });
      }
    }

    console.log(
      `[itinerary] planned=${stopPlan.length} resolved=${places.length} dropped=${droppedStops.length}`
    );

    if (places.length === 0) {
      return NextResponse.json(
        {
          error:
            'Could not find any places within walking distance. Try a bigger area or a longer date type.',
        },
        { status: 404 }
      );
    }

    /* IMPORTANT: we do NOT redistribute dropped-stop time across the
       remaining stops. The old behavior inflated a single surviving stop
       to fill the entire window, so a 3-hour "bar → restaurant → bar"
       plan that dropped 2 stops turned into a 210-minute bar, which is
       nonsense and misled the user into thinking the search had worked.
       If stops drop now, the itinerary just ends earlier — each stop
       keeps its category-appropriate planned duration — and the user
       can re-roll. The drop is also reported in meta.droppedStops so
       the UI can show a "we only found 1 of 3 planned stops" hint. */

    // 5. Build the timed itinerary. buildItinerary honors the user's
    //    endTime and drops trailing stops that would overrun it, so a
    //    7-10 PM request can't silently stretch past midnight.
    const itinerary = buildItinerary({
      places,
      dateTypeId,
      vibeId,
      startTime,
      endTime,
      budgetTier: budget,
      badWeather,
    });

    /* 6. Attach booking deep-links (primary + 2 alternates) to each
          bookable stop, using the stop's actual arrival time. We do this
          after buildItinerary so arriveAt reflects walking-time + buffers.
          Non-bookable stops (museums, parks, etc.) get null. */
    const partySize = onboarding?.partySize || 2;
    if (itinerary?.stops) {
      for (const stop of itinerary.stops) {
        if (!stop?.place) continue;
        if (!isBookable(stop.place)) {
          stop.place.bookingLinks = null;
          continue;
        }
        const links = buildBookingLinks(stop.place, {
          date,
          time: stop.arriveAt,
          partySize,
        });
        stop.place.bookingLinks = links;
        /* Keep the legacy single bookingUrl pointing at the primary so any
           old UI path still works. */
        if (links?.primary?.url && !stop.place.bookingUrl) {
          stop.place.bookingUrl = links.primary.url;
        }
      }
    }

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
        plannedStops: stopPlan.length,
        resolvedStops: places.length,
        droppedStops,
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

