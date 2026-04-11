/**
 * Add-stop endpoint
 *
 * Append a single new stop to an existing itinerary when the user taps
 * "Add stop" on the itinerary view ("the date is going well, where next?").
 *
 * Takes the last existing stop as the anchor, picks a category based on
 * what's already in the plan + the current vibe, runs the same search
 * cascade as the main generator, and returns ONE serialized stop ready
 * to be pushed into `itinerary.stops`.
 *
 * It also walks the existing search dedupe set through the request so
 * we never return a venue that's already in the plan.
 */

import { NextResponse } from 'next/server';
import {
  getWalkingMinutes,
  getMaxWalkMinutes,
  walkMinutesToMeters,
} from '@/lib/itinerary-engine';
import { VIBES, BUDGET_TIERS } from '@/lib/constants';
import { buildBookingLinks, isBookable } from '@/lib/booking-links';
import {
  searchGooglePlaces,
  getGoogleType,
  normalizeVenueName,
} from '@/lib/places-search';

/* Pick the most natural next category given what's already been visited.
   Rule of thumb: late-night plans end on a bar, earlier plans end on a
   cafe or dessert. If the current last stop is already a bar, try a
   different bar (change of scenery). */
function pickNextCategory({ lastCategory, vibeId, lastStopStartsAtMinutes }) {
  const hour = Math.floor((lastStopStartsAtMinutes || 18 * 60) / 60);
  const late = hour >= 21;

  if (late) {
    // After 9 PM: bar > dessert > another bar
    if (lastCategory !== 'bar') return 'bar';
    return 'bar';
  }
  // Afternoon/early evening: bar > cafe > activity
  if (lastCategory === 'bar') return 'cafe';
  if (lastCategory === 'cafe') return 'bar';
  return vibeId === 'creative' ? 'culture' : 'bar';
}

/* Minutes since midnight → "7:30 PM" */
function formatTime(minutes) {
  const safe = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const hrs = Math.floor(safe / 60) % 24;
  const mins = safe % 60;
  const period = hrs >= 12 ? 'PM' : 'AM';
  const displayHrs = hrs % 12 || 12;
  return `${displayHrs}:${mins.toString().padStart(2, '0')} ${period}`;
}

/* "7:30 PM" → minutes since midnight. Accepts already-numeric too. */
function parseTime(str) {
  if (typeof str === 'number') return str;
  if (!str) return null;
  const m = String(str).trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const mins = parseInt(m[2], 10);
  const period = (m[3] || '').toUpperCase();
  if (period === 'PM' && h < 12) h += 12;
  if (period === 'AM' && h === 12) h = 0;
  return h * 60 + mins;
}

function estimateCost(priceLevel, budget) {
  const baseCosts = { 1: 15, 2: 30, 3: 55, 4: 90 };
  return baseCosts[priceLevel] || baseCosts[budget?.priceLevel] || 30;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const {
      lastStop, // { place: { lat, lng, name, category }, leaveAt, order }
      vibeId,
      budgetId,
      dateTypeId,
      date,
      desiredCategory = null, // optional user override
      existingStopNames = [], // venue names already used, for dedupe
      badWeather = false,
      partySize = 2,
    } = body;

    if (!lastStop?.place?.lat || !lastStop?.place?.lng) {
      return NextResponse.json(
        { error: 'lastStop with coordinates is required' },
        { status: 400 }
      );
    }
    if (!vibeId || !budgetId || !dateTypeId) {
      return NextResponse.json(
        { error: 'vibeId, budgetId, and dateTypeId are required' },
        { status: 400 }
      );
    }

    const vibe = VIBES.find((v) => v.id === vibeId);
    const budget = BUDGET_TIERS.find((b) => b.id === budgetId);

    const maxWalkMinutes = getMaxWalkMinutes(dateTypeId, badWeather);
    const anchorRadiusMeters = Math.max(
      1200,
      walkMinutesToMeters(maxWalkMinutes * 2.2)
    );

    const anchor = { lat: lastStop.place.lat, lng: lastStop.place.lng };

    // Figure out what category to try next unless the user named one.
    const lastLeaveMinutes = parseTime(lastStop.leaveAt) ?? 20 * 60;
    const nextCategory =
      desiredCategory ||
      pickNextCategory({
        lastCategory: lastStop.place.category,
        vibeId,
        lastStopStartsAtMinutes: lastLeaveMinutes,
      });

    /* Category fallbacks — if the requested category has nothing within
       walking distance, try these alternatives before giving up. */
    const FALLBACKS = {
      restaurant: ['restaurant', 'bar', 'cafe'],
      bar: ['bar', 'cafe', 'restaurant'],
      cafe: ['cafe', 'bar', 'restaurant'],
      activity: ['activity', 'bar', 'cafe'],
      culture: ['culture', 'bar', 'cafe'],
      outdoors: ['outdoors', 'cafe', 'bar'],
    };
    const cats = FALLBACKS[nextCategory] || [nextCategory];
    const vibeWord = vibe?.searchTerms?.[0] || '';

    const usedNames = new Set(existingStopNames.map(normalizeVenueName));

    const runCascade = async (opts) => {
      for (const cat of cats) {
        const googleType = getGoogleType(cat);
        const variations = [
          [vibeWord, cat].filter(Boolean).join(' ').trim(),
          cat,
        ];
        for (const q of variations) {
          if (!q) continue;
          try {
            const p = await searchGooglePlaces(q, cat, budget, {
              anchor,
              anchorRadiusMeters,
              maxWalkMinutes,
              includedType: googleType,
              excludeNames: usedNames,
              normalizeName: normalizeVenueName,
              relaxPriceLevel: true,
              ...opts,
            });
            if (p) return p;
          } catch (err) {
            console.error(
              `[add-stop] places search failed for "${q}":`,
              err.message
            );
          }
        }
      }
      return null;
    };

    // Pass 1: strict walking cap + includedType
    let place = await runCascade({});
    // Pass 2: allow slightly over-cap (still bounded at 2x inside searchGooglePlaces)
    if (!place) place = await runCascade({ acceptOverCap: true });
    // Pass 3: drop includedType, wider radius, still anchored
    if (!place) {
      try {
        place = await searchGooglePlaces(nextCategory, nextCategory, budget, {
          anchor,
          anchorRadiusMeters: anchorRadiusMeters * 1.5,
          maxWalkMinutes,
          relaxPriceLevel: true,
          acceptOverCap: true,
          excludeNames: usedNames,
          normalizeName: normalizeVenueName,
        });
      } catch (err) {
        console.error('[add-stop] pass-3 failed:', err.message);
      }
    }

    if (!place) {
      return NextResponse.json(
        {
          error:
            'Couldn\'t find another spot within walking distance. Try heading back to the plan.',
        },
        { status: 404 }
      );
    }

    // Compute walking time and arrive/leave times.
    const walkMin = getWalkingMinutes(
      anchor.lat,
      anchor.lng,
      place.lat,
      place.lng
    );
    const arriveAtMinutes = lastLeaveMinutes + 5 /* buffer */ + walkMin;
    // Pick a reasonable duration for the new category.
    const DURATIONS = {
      restaurant: 90,
      bar: 60,
      cafe: 45,
      activity: 75,
      culture: 75,
      outdoors: 60,
    };
    const duration = DURATIONS[nextCategory] || 60;
    const leaveAtMinutes = arriveAtMinutes + duration;

    const costEstimate = estimateCost(place.priceLevel, budget);

    const newStop = {
      order: (lastStop.order || 0) + 1,
      place: {
        name: place.name,
        address: place.address,
        lat: place.lat,
        lng: place.lng,
        rating: place.rating,
        priceLevel: place.priceLevel,
        photoUrl: place.photoUrl,
        category: place.category,
        source: place.source || 'google_places',
        bookingUrl: null,
      },
      role: 'extended',
      arriveAt: formatTime(arriveAtMinutes),
      duration,
      leaveAt: formatTime(leaveAtMinutes),
      walkFromPrevious: {
        minutes: walkMin,
        description: `${walkMin} min walk`,
        overCap: walkMin > maxWalkMinutes,
        maxAllowed: maxWalkMinutes,
      },
      costEstimate,
    };

    // Attach booking links for the new stop (same as main generator).
    if (isBookable(newStop.place)) {
      const links = buildBookingLinks(newStop.place, {
        date,
        time: newStop.arriveAt,
        partySize,
      });
      newStop.place.bookingLinks = links;
      if (links?.primary?.url) {
        newStop.place.bookingUrl = links.primary.url;
      }
    } else {
      newStop.place.bookingLinks = null;
    }

    return NextResponse.json({
      stop: newStop,
      meta: {
        requestedCategory: nextCategory,
        walkMinutes: walkMin,
        overCap: walkMin > maxWalkMinutes,
      },
    });
  } catch (err) {
    console.error('[add-stop] fatal:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
