import {
  Venue,
  ScoredVenue,
  StopRole,
  QuestionnaireAnswers,
  WeatherInfo,
} from "@/types";
import { walkDistanceKm } from "@/lib/geo";
import { BUDGET_TIER_MAP } from "@/config/budgets";
import { VIBE_VENUE_TAGS } from "@/config/vibes";

// Walking distance caps. Bad weather collapses the cap to keep the user
// from getting drenched between stops.
const MAX_WALK_KM_NORMAL = 1.5; // ~20 min walk
const MAX_WALK_KM_BAD_WEATHER = 0.4; // ~5 min walk

function getMaxWalkKm(weather: WeatherInfo | null): number {
  return weather?.is_bad_weather ? MAX_WALK_KM_BAD_WEATHER : MAX_WALK_KM_NORMAL;
}

function scoreVenue(
  venue: Venue,
  answers: QuestionnaireAnswers,
  role: StopRole,
  jitter: number
): number {
  let score = 0;

  // Vibe match (35%) — exact canonical tag matching
  const vibeTags = VIBE_VENUE_TAGS[answers.vibe] ?? [];
  if (vibeTags.length === 0) {
    score += 25; // "mix it up" gets decent base
  } else {
    const vibeSet = new Set(vibeTags);
    const matchCount = venue.vibe_tags.filter((t) => vibeSet.has(t)).length;
    if (matchCount >= 2) score += 35;
    else if (matchCount === 1) score += 25;
    else score += 10;
  }

  // Occasion match (15%)
  if (venue.occasion_tags.includes(answers.occasion)) {
    score += 15;
  }

  // Budget match (15%)
  const allowedTiers = BUDGET_TIER_MAP[answers.budget] ?? [1, 2, 3];
  if (allowedTiers.includes(venue.price_tier)) {
    score += 15;
  }

  // Location — boost if venue is in one of the selected neighborhoods (10%).
  // Empty array = no neighborhood preference, everyone gets the boost.
  if (
    answers.neighborhoods.length === 0 ||
    answers.neighborhoods.includes(venue.neighborhood)
  ) {
    score += 10;
  }

  // Time relevance (10%) — base for now; role-aware logic lives in composer.
  void role;
  score += 10;

  // Quality score (10%)
  score += (venue.quality_score / 10) * 10;

  // Curation boost (5%)
  score += venue.curation_boost * 5;

  // Random jitter for variety on regenerate
  score += Math.random() * jitter;

  return score;
}

function hardFilter(
  venues: Venue[],
  role: StopRole,
  answers: QuestionnaireAnswers,
  weather: WeatherInfo | null,
  exclude: Set<string>
): Venue[] {
  return venues.filter((v) => {
    if (!v.active) return false;
    if (exclude.has(v.id)) return false;
    if (!v.stop_roles.includes(role)) return false;
    if (
      answers.neighborhoods.length > 0 &&
      !answers.neighborhoods.includes(v.neighborhood)
    ) {
      return false;
    }
    if (weather?.is_bad_weather && v.outdoor_seating) return false;
    return true;
  });
}

function relaxedFilter(
  venues: Venue[],
  role: StopRole,
  exclude: Set<string>,
  weather: WeatherInfo | null
): Venue[] {
  return venues.filter((v) => {
    if (!v.active) return false;
    if (exclude.has(v.id)) return false;
    if (!v.stop_roles.includes(role)) return false;
    if (weather?.is_bad_weather && v.outdoor_seating) return false;
    return true;
  });
}

function isWithinWalkRange(a: Venue, b: Venue, maxKm: number): boolean {
  return (
    walkDistanceKm(a.latitude, a.longitude, b.latitude, b.longitude) <= maxKm
  );
}

function filterByProximity(
  candidates: Venue[],
  anchor: Venue,
  maxKm: number
): Venue[] {
  return candidates.filter((v) => isWithinWalkRange(v, anchor, maxKm));
}

/**
 * Hard-filter, then relax progressively, score the survivors, and return the
 * best venue for the given role plus the full ranked list. The ranked list is
 * how the composer picks Plan B alternatives without re-scoring.
 */
export function pickBestForRole(
  venues: Venue[],
  role: StopRole,
  answers: QuestionnaireAnswers,
  weather: WeatherInfo | null,
  usedIds: Set<string>,
  anchor: Venue | null,
  jitter: number
): { best: ScoredVenue | null; scored: ScoredVenue[] } {
  const maxWalkKm = getMaxWalkKm(weather);

  // 1. Hard filter (neighborhood match)
  let candidates = hardFilter(venues, role, answers, weather, usedIds);

  // 2. Enforce proximity to anchor
  if (anchor && candidates.length > 0) {
    const nearby = filterByProximity(candidates, anchor, maxWalkKm);
    if (nearby.length > 0) candidates = nearby;
    // If no nearby candidates survive, fall through to relaxed filter
    else candidates = [];
  }

  // 3. Progressive relaxation: drop neighborhood, keep proximity
  if (candidates.length === 0) {
    candidates = relaxedFilter(venues, role, usedIds, weather);
    if (anchor && candidates.length > 0) {
      const nearby = filterByProximity(candidates, anchor, maxWalkKm);
      if (nearby.length > 0) candidates = nearby;
    }
  }

  const scored: ScoredVenue[] = candidates.map((v) => ({
    ...v,
    score: scoreVenue(v, answers, role, jitter),
  }));
  scored.sort((a, b) => b.score - a.score);

  return { best: scored[0] ?? null, scored };
}
