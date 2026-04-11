/**
 * Itinerary Engine
 *
 * Takes user selections (neighborhoods, vibe, budget, date type, day, time)
 * and assembles a multi-stop date itinerary using Google Places results
 * and curated venue data.
 */

import { DATE_TYPES, VIBES, CURATED_VENUES } from './constants';

// Average walking speed in NYC: ~3 mph ≈ 20 min/mile
const WALKING_SPEED_MPH = 3;
const EARTH_RADIUS_MILES = 3959;
// Multiplier to convert straight-line distance to grid-walking distance
const GRID_MULTIPLIER = 1.3;

/**
 * Calculate walking time between two coordinates (in minutes)
 */
function getWalkingMinutes(lat1, lng1, lat2, lng2) {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distanceMiles = EARTH_RADIUS_MILES * c;
  // Add 30% for NYC grid (not straight line)
  const adjustedMiles = distanceMiles * GRID_MULTIPLIER;
  return Math.round((adjustedMiles / WALKING_SPEED_MPH) * 60);
}

/**
 * Maximum walking minutes allowed between two stops, given the date type
 * and current weather. Rules:
 *   - first-date / early-dating → 10 min
 *   - date-night / special-occasion → 15 min
 *   - bad weather → 5 min (overrides everything)
 */
function getMaxWalkMinutes(dateTypeId, badWeather = false) {
  if (badWeather) return 5;
  if (dateTypeId === 'first-date' || dateTypeId === 'early-dating') return 10;
  return 15;
}

/**
 * Convert a walking-minute cap to a straight-line search radius in meters.
 * Inverse of getWalkingMinutes(): minutes → miles → meters, removing the
 * grid multiplier so the API search radius is slightly generous (we'll
 * filter the hard cap by actual walking minutes after results come back).
 */
function walkMinutesToMeters(minutes) {
  const miles = (minutes / 60) * WALKING_SPEED_MPH; // straight-line miles at that pace
  const meters = miles * 1609.344;
  return Math.round(meters);
}

/**
 * Determine how many stops and durations based on date type
 */
function getDateTypeConfig(dateTypeId) {
  const dateType = DATE_TYPES.find((d) => d.id === dateTypeId);
  if (!dateType) return DATE_TYPES[0];
  return dateType;
}

/**
 * Typical duration per category, in minutes. Used as the default
 * suggestedDuration on each planned stop so the itinerary isn't stretching
 * a cafe into a 2-hour marathon or cramming a restaurant into 40 minutes.
 *
 * Rule-of-thumb (per user request):
 *   bar         ~1h
 *   restaurant  ~1.5-2h (we use 105, midpoint)
 *   cafe        ~45m
 */
const CATEGORY_DURATIONS = {
  restaurant: 105,
  bar: 60,
  cafe: 45,
  activity: 75,
  culture: 90,
  outdoors: 60,
};

/**
 * Minimum viable duration per category. Used for the fit check so we can
 * squeeze in an extra stop when time is borderline — a restaurant still
 * works at 90 min, a bar at 45. Always ≤ CATEGORY_DURATIONS[cat].
 */
const CATEGORY_MIN_DURATIONS = {
  restaurant: 90,
  bar: 50,
  cafe: 30,
  activity: 60,
  culture: 75,
  outdoors: 45,
};

/**
 * Template stop mixes, indexed by desired stop count (1-5).
 * Each template is resolved at call time with isEvening/vibe substitutions.
 */
function templateForCount(n, { isEvening, isMorning, vibeId }) {
  const openerCat = isEvening ? 'bar' : 'cafe';
  const mainCat = vibeId === 'creative' ? 'culture' : 'restaurant';
  const closerCat = isEvening ? 'bar' : 'activity';
  const activeOpener = isMorning ? 'cafe' : 'outdoors';

  switch (n) {
    case 1:
      return [{ category: isEvening ? 'restaurant' : 'cafe', role: 'main' }];
    case 2:
      if (vibeId === 'active' || vibeId === 'chill') {
        return [
          { category: activeOpener, role: 'opener' },
          { category: 'restaurant', role: 'main' },
        ];
      }
      return [
        { category: 'restaurant', role: 'main' },
        { category: openerCat, role: 'closer' },
      ];
    case 3:
      return [
        { category: openerCat, role: 'opener' },
        { category: mainCat, role: 'main' },
        { category: closerCat, role: 'closer' },
      ];
    case 4:
      return [
        { category: 'cafe', role: 'opener' },
        { category: 'activity', role: 'activity' },
        { category: 'restaurant', role: 'main' },
        { category: 'bar', role: 'closer' },
      ];
    case 5:
      return [
        { category: 'cafe', role: 'opener' },
        { category: 'activity', role: 'activity' },
        { category: 'culture', role: 'bonus' },
        { category: 'restaurant', role: 'main' },
        { category: 'bar', role: 'closer' },
      ];
    default:
      return [];
  }
}

/**
 * Compute the minimum minutes a template needs to execute: sum of each
 * stop's MIN duration + walking time between stops. We use minimums for
 * the fit check so we squeeze in an extra stop whenever it's physically
 * possible; the surplus is redistributed to typical durations afterward.
 */
function templateBudget(template, maxWalk) {
  const durations = template.reduce(
    (acc, s) => acc + (CATEGORY_MIN_DURATIONS[s.category] || 50),
    0
  );
  const walks = Math.max(0, template.length - 1) * maxWalk;
  return durations + walks;
}

/**
 * Determine the stop mix based on available time, date type, and vibe.
 *
 * Strategy (per user feedback: "prioritize multiple locations if time
 * permits"): start from 5 stops and walk down, returning the FIRST
 * template that fits in the available window. This maximizes stop count
 * for any given time block, instead of the old floor-division approach
 * which rounded down aggressively and routinely returned one stop for
 * anything under ~2.5h.
 *
 * @param {string} dateTypeId
 * @param {string} vibeId
 * @param {string} startTime  – "HH:MM"
 * @param {string} endTime    – "HH:MM"
 * @returns {Array<{category, role, suggestedDuration}>}
 */
function planStopMix(dateTypeId, vibeId, startTime, endTime, badWeather = false) {
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  let availableMinutes = eh * 60 + em - (sh * 60 + sm);
  // Handle wrapping past midnight
  if (availableMinutes <= 0) availableMinutes += 24 * 60;

  const startHour = sh;
  const isEvening = startHour >= 17;
  const isMorning = startHour < 12;
  const maxWalk = getMaxWalkMinutes(dateTypeId, badWeather);

  // Try templates from most → fewest stops. First fit wins.
  // Allow a 15-min slack: better to fit 3 stops with 10 min to spare than
  // drop to 2 and have 80 minutes of dead time.
  const SLACK = 15;
  let chosen = null;
  let chosenBudget = 0;
  for (let n = 5; n >= 1; n--) {
    const template = templateForCount(n, { isEvening, isMorning, vibeId });
    if (!template.length) continue;
    const budget = templateBudget(template, maxWalk);
    if (budget <= availableMinutes + SLACK) {
      chosen = template;
      chosenBudget = budget;
      break;
    }
  }

  // Extreme short-window fallback: 1 stop filling whatever time there is.
  if (!chosen) {
    return [
      {
        category: isEvening ? 'restaurant' : 'cafe',
        role: 'main',
        suggestedDuration: Math.max(30, Math.min(availableMinutes, 120)),
      },
    ];
  }

  // Distribute the surplus/deficit across stops proportional to their
  // typical duration, so a 3-stop plan with 20 extra minutes gives the
  // restaurant most of that time, not the cafe.
  const surplus = availableMinutes - chosenBudget;
  const totalTypical = chosen.reduce(
    (acc, s) => acc + (CATEGORY_DURATIONS[s.category] || 60),
    0
  );

  return chosen.map((stop) => {
    const typical = CATEGORY_DURATIONS[stop.category] || 60;
    const share = typical / totalTypical;
    const adjusted = typical + Math.round(surplus * share);
    return {
      ...stop,
      suggestedDuration: Math.max(30, adjusted),
    };
  });
}

/**
 * Build the itinerary with timed stops, walking directions, and cost estimates.
 *
 * Respects a soft end-time: new stops are only allowed to START up to
 * LAST_START_BUFFER minutes before endTime. If a stop's arrival time
 * lands after (endTime − LAST_START_BUFFER), that stop and everything
 * after it is dropped. Once a stop starts, it runs its natural duration
 * even if that pushes past endTime — so a 7-10 PM request that lands the
 * 3rd stop at 9:25 PM will happily run until ~10:30 PM, but a 4th stop
 * that would start at 10:15 PM is dropped.
 */
export function buildItinerary({
  places, // Array of resolved places from Google Places / curated list
  dateTypeId,
  vibeId,
  startTime, // "17:00" format
  endTime = null, // "21:00" format — optional hard cap on the whole night
  budgetTier,
  badWeather = false,
}) {
  if (!places || places.length === 0) return null;

  const [startHour, startMin] = startTime.split(':').map(Number);
  const startMinutes = startHour * 60 + startMin;
  let currentTime = startMinutes; // minutes since midnight
  const maxWalk = getMaxWalkMinutes(dateTypeId, badWeather);

  // Hard end-time cap. If endTime < startTime we assume it wraps past
  // midnight (e.g. 23:00 → 01:00) and add 24h.
  let endMinutes = null;
  if (endTime) {
    const [eh, em] = endTime.split(':').map(Number);
    endMinutes = eh * 60 + em;
    if (endMinutes <= startMinutes) endMinutes += 24 * 60;
  }
  /* Don't START a new stop within this many minutes of endTime. 30 means
     "if it's 9:30 PM and the user said 10 PM, don't kick off another
     spot." The stop that's already running is allowed to finish naturally. */
  const LAST_START_BUFFER = 30;

  const itinerary = [];
  let totalCostEstimate = 0;
  let anyOverCap = false;
  let longestWalk = 0;
  let truncatedForEndTime = false;

  for (let index = 0; index < places.length; index++) {
    const place = places[index];

    // 1. Walk from previous stop (if any) comes BEFORE we compute arriveAt
    //    so the displayed arrival reflects post-walk time, not pre-walk.
    let walkMin = 0;
    let overCap = false;
    let walkFromPrevious = null;
    if (index > 0) {
      const prev = places[index - 1];
      if (prev.lat && prev.lng && place.lat && place.lng) {
        walkMin = getWalkingMinutes(prev.lat, prev.lng, place.lat, place.lng);
        overCap = walkMin > maxWalk;
        if (overCap) anyOverCap = true;
        if (walkMin > longestWalk) longestWalk = walkMin;
        walkFromPrevious = {
          minutes: walkMin,
          description: `${walkMin} min walk`,
          overCap,
          maxAllowed: maxWalk,
        };
      }
    }

    // Advance the clock by the walk before we set arriveAt.
    currentTime += walkMin;

    const duration = place.suggestedDuration || 60;
    const leaveAtMinutes = currentTime + duration;

    // 2. End-time gate. We don't START a new stop within LAST_START_BUFFER
    //    of endTime — so the 7-10 PM user doesn't get pushed into a bar
    //    that opens at 9:55. But once a stop has started, it runs its
    //    full duration even if that lands past 10 PM. First stop is
    //    always kept so the user still gets at least one place.
    if (
      endMinutes !== null &&
      index > 0 &&
      currentTime > endMinutes - LAST_START_BUFFER
    ) {
      truncatedForEndTime = true;
      break;
    }

    const stop = {
      order: itinerary.length + 1,
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
        bookingUrl: place.bookingUrl || null,
      },
      role: place.role || 'stop',
      arriveAt: formatTime(currentTime),
      duration,
      leaveAt: formatTime(leaveAtMinutes),
      walkFromPrevious,
      costEstimate: place.costEstimate || estimateCost(place.priceLevel, budgetTier),
    };

    totalCostEstimate += stop.costEstimate;
    // Advance clock past this stop + 5 min transition buffer
    currentTime = leaveAtMinutes + 5;
    itinerary.push(stop);
  }

  // If every stop got dropped by the overflow guard (extreme edge), keep
  // the first one with whatever time it takes — better than an empty plan.
  if (itinerary.length === 0 && places.length > 0) {
    const first = places[0];
    const duration = first.suggestedDuration || 60;
    itinerary.push({
      order: 1,
      place: {
        name: first.name,
        address: first.address,
        lat: first.lat,
        lng: first.lng,
        rating: first.rating,
        priceLevel: first.priceLevel,
        photoUrl: first.photoUrl,
        category: first.category,
        source: first.source || 'google_places',
        bookingUrl: first.bookingUrl || null,
      },
      role: first.role || 'stop',
      arriveAt: formatTime(startMinutes),
      duration,
      leaveAt: formatTime(startMinutes + duration),
      walkFromPrevious: null,
      costEstimate: first.costEstimate || estimateCost(first.priceLevel, budgetTier),
    });
    totalCostEstimate = itinerary[0].costEstimate;
    currentTime = startMinutes + duration + 5;
  }

  const lastStop = itinerary[itinerary.length - 1];
  // Rebuild currentTime end-of-evening so we don't include the trailing buffer.
  const endOfEvening =
    currentTime - 5 >= startMinutes ? currentTime - 5 : startMinutes;

  return {
    stops: itinerary,
    totalStops: itinerary.length,
    startTime: formatTime(startMinutes),
    endTime: formatTime(endOfEvening),
    totalDurationMinutes: endOfEvening - startMinutes,
    totalCostEstimate,
    dateType: dateTypeId,
    vibe: vibeId,
    walkingConstraint: {
      maxWalkMinutes: maxWalk,
      longestWalkMinutes: longestWalk,
      anyOverCap,
      badWeather,
    },
    truncatedForEndTime,
  };
}

/**
 * Convert minutes since midnight to "7:30 PM" format
 */
function formatTime(minutes) {
  const hrs = Math.floor(minutes / 60) % 24;
  const mins = minutes % 60;
  const period = hrs >= 12 ? 'PM' : 'AM';
  const displayHrs = hrs % 12 || 12;
  return `${displayHrs}:${mins.toString().padStart(2, '0')} ${period}`;
}

/**
 * Estimate cost per person based on price level
 */
function estimateCost(priceLevel, budgetTier) {
  const baseCosts = { 1: 15, 2: 30, 3: 55, 4: 90 };
  return baseCosts[priceLevel] || baseCosts[budgetTier?.priceLevel] || 30;
}

export {
  planStopMix,
  getWalkingMinutes,
  getDateTypeConfig,
  getMaxWalkMinutes,
  walkMinutesToMeters,
};
