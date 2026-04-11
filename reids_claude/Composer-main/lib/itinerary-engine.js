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
 * Determine the stop mix based on available time, date type, and vibe.
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
  let availableMinutes = (eh * 60 + em) - (sh * 60 + sm);
  // Handle wrapping past midnight
  if (availableMinutes <= 0) availableMinutes += 24 * 60;

  const startHour = sh;
  const isEvening = startHour >= 17;
  const isMorning = startHour < 12;

  // Use the walking-minute cap to budget realistic walk time between stops.
  const maxWalk = getMaxWalkMinutes(dateTypeId, badWeather);
  const AVG_STOP_PLUS_WALK = 60 + maxWalk;
  let numStops = Math.max(1, Math.floor(availableMinutes / AVG_STOP_PLUS_WALK));
  // Cap at 5 — more than that gets exhausting
  numStops = Math.min(numStops, 5);

  const stops = [];

  if (numStops === 1) {
    stops.push({
      category: isEvening ? 'bar' : 'cafe',
      role: 'main',
      suggestedDuration: Math.min(availableMinutes, 90),
    });
  } else if (numStops === 2) {
    const mainDur = Math.round(availableMinutes * 0.55);
    const secondDur = availableMinutes - mainDur - maxWalk; // walk buffer
    if (vibeId === 'active' || vibeId === 'chill') {
      stops.push(
        { category: isMorning ? 'cafe' : 'outdoors', role: 'opener', suggestedDuration: Math.min(secondDur, 60) },
        { category: 'restaurant', role: 'main', suggestedDuration: Math.min(mainDur, 90) }
      );
    } else {
      stops.push(
        { category: 'restaurant', role: 'main', suggestedDuration: Math.min(mainDur, 90) },
        { category: isEvening ? 'bar' : 'cafe', role: 'closer', suggestedDuration: Math.min(secondDur, 75) }
      );
    }
  } else if (numStops === 3) {
    const walkBuffer = 2 * maxWalk; // 2 walks at the cap
    const usable = availableMinutes - walkBuffer;
    stops.push(
      { category: isEvening ? 'bar' : 'cafe', role: 'opener', suggestedDuration: Math.round(usable * 0.25) },
      { category: vibeId === 'creative' ? 'culture' : 'restaurant', role: 'main', suggestedDuration: Math.round(usable * 0.45) },
      { category: isEvening ? 'bar' : 'activity', role: 'closer', suggestedDuration: Math.round(usable * 0.30) }
    );
  } else {
    // 4-5 stops
    const walkBuffer = (numStops - 1) * maxWalk;
    const usable = availableMinutes - walkBuffer;
    const perStop = Math.round(usable / numStops);

    stops.push(
      { category: isEvening ? 'bar' : 'cafe', role: 'opener', suggestedDuration: Math.round(perStop * 0.7) },
      { category: 'activity', role: 'activity', suggestedDuration: perStop },
      { category: 'restaurant', role: 'main', suggestedDuration: Math.round(perStop * 1.3) },
      { category: 'bar', role: 'closer', suggestedDuration: perStop }
    );
    if (numStops === 5) {
      stops.splice(2, 0, {
        category: 'culture',
        role: 'bonus',
        suggestedDuration: perStop,
      });
    }
  }

  return stops;
}

/**
 * Build the itinerary with timed stops, walking directions, and cost estimates
 */
export function buildItinerary({
  places, // Array of resolved places from Google Places / curated list
  dateTypeId,
  vibeId,
  startTime, // "17:00" format
  budgetTier,
  badWeather = false,
}) {
  if (!places || places.length === 0) return null;

  const [startHour, startMin] = startTime.split(':').map(Number);
  let currentTime = startHour * 60 + startMin; // minutes since midnight
  const maxWalk = getMaxWalkMinutes(dateTypeId, badWeather);

  const itinerary = [];
  let totalCostEstimate = 0;
  let anyOverCap = false;
  let longestWalk = 0;

  places.forEach((place, index) => {
    const stop = {
      order: index + 1,
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
      duration: place.suggestedDuration || 60,
      leaveAt: null,
      walkFromPrevious: null,
      costEstimate: place.costEstimate || estimateCost(place.priceLevel, budgetTier),
    };

    // Calculate leave time
    stop.leaveAt = formatTime(currentTime + stop.duration);
    totalCostEstimate += stop.costEstimate;

    // Calculate walking time from previous stop
    if (index > 0) {
      const prev = places[index - 1];
      if (prev.lat && prev.lng && place.lat && place.lng) {
        const walkMin = getWalkingMinutes(prev.lat, prev.lng, place.lat, place.lng);
        const overCap = walkMin > maxWalk;
        if (overCap) anyOverCap = true;
        if (walkMin > longestWalk) longestWalk = walkMin;
        stop.walkFromPrevious = {
          minutes: walkMin,
          description: `${walkMin} min walk`,
          overCap,
          maxAllowed: maxWalk,
        };
        // Adjust arrival time to include walking
        stop.arriveAt = formatTime(currentTime);
      }
    }

    currentTime += stop.duration + (stop.walkFromPrevious?.minutes || 0) + 5; // 5 min buffer
    itinerary.push(stop);
  });

  return {
    stops: itinerary,
    totalStops: itinerary.length,
    startTime: formatTime(startHour * 60 + startMin),
    endTime: formatTime(currentTime - 5),
    totalDurationMinutes: currentTime - 5 - (startHour * 60 + startMin),
    totalCostEstimate,
    dateType: dateTypeId,
    vibe: vibeId,
    walkingConstraint: {
      maxWalkMinutes: maxWalk,
      longestWalkMinutes: longestWalk,
      anyOverCap,
      badWeather,
    },
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
