import {
  Venue,
  ScoredVenue,
  StopRole,
  VenueRole,
  QuestionnaireAnswers,
  WeatherInfo,
} from "@/types";
import { walkDistanceKm } from "@/lib/geo";
import { BUDGET_TIER_MAP } from "@/config/budgets";
import { VIBE_VENUE_TAGS } from "@/config/vibes";
import { ALGORITHM } from "@/config/algorithm";
import { weightedPickByRank } from "@/lib/itinerary/weighted-pick";
import { blockCoverageFraction, type DayColumn, type TimeBlock } from "@/lib/itinerary/time-blocks";

// ─── Role expansion ────────────────────────────────────────────────────
// Generated from the Stop Roles sheet. Maps the 6 raw venue roles to
// the 3 canonical composition roles (opener/main/closer). The sheet's
// "Serves As" column is the source of truth.
import { ROLE_EXPANSION as GEN_ROLE_EXPANSION } from "@/config/generated/stop-roles";

const ROLE_EXPANSION = GEN_ROLE_EXPANSION as Record<VenueRole, readonly StopRole[]>;

/**
 * Check whether a venue can serve a given canonical composition role.
 *
 * Maps the venue's raw stop_roles (opener, main, closer, drinks,
 * activity, coffee) through ROLE_EXPANSION to canonical roles. A venue
 * with stop_roles=["drinks"] can serve both "opener" and "closer".
 *
 * @param venue - The venue to check.
 * @param role  - The canonical role being filled (opener, main, closer).
 * @returns True if any of the venue's roles expand to include the target role.
 */
function venueMatchesRole(venue: Venue, role: StopRole): boolean {
  return venue.stop_roles.some(
    (vr) => (ROLE_EXPANSION[vr as VenueRole] ?? []).includes(role)
  );
}

function getMaxWalkKm(weather: WeatherInfo | null): number {
  return weather?.is_bad_weather
    ? ALGORITHM.distance.maxWalkKmBadWeather
    : ALGORITHM.distance.maxWalkKmNormal;
}

function scoreVenue(
  venue: Venue,
  answers: QuestionnaireAnswers,
  role: StopRole,
  jitter: number,
  random: () => number,
  dayColumn: DayColumn | null,
  timeBlock: TimeBlock | null,
  savedVenueIds: ReadonlySet<string> = new Set()
): number {
  let score = 0;

  const W = ALGORITHM.weights;

  // Vibe match — exact canonical tag matching
  const vibeTags = VIBE_VENUE_TAGS[answers.vibe] ?? [];
  if (vibeTags.length === 0) {
    score += W.vibeMixItUpBaseline;
  } else {
    const vibeSet = new Set(vibeTags);
    const matchCount = venue.vibe_tags.filter((t) => vibeSet.has(t)).length;
    if (matchCount >= 2) score += W.vibeMatch2Plus;
    else if (matchCount === 1) score += W.vibeMatch1;
    else score += W.vibeMatch0;
  }

  // Occasion match
  if (venue.occasion_tags.includes(answers.occasion)) {
    score += W.occasion;
  }

  // Budget match
  const allowedTiers = BUDGET_TIER_MAP[answers.budget] ?? [1, 2, 3];
  if (allowedTiers.includes(venue.price_tier ?? 2)) {
    score += W.budget;
  }

  // Location — boost if venue is in one of the selected neighborhoods.
  // Empty array = no neighborhood preference, everyone gets the boost.
  if (
    answers.neighborhoods.length === 0 ||
    answers.neighborhoods.includes(venue.neighborhood)
  ) {
    score += W.neighborhood;
  }

  // Time relevance — score based on per-day block coverage. When the
  // caller has no day/block context (legacy callers, tests), fall back
  // to full points so the component doesn't penalize anything.
  if (dayColumn && timeBlock) {
    score += blockCoverageFraction(venue, dayColumn, timeBlock) * W.timeRelevance;
  } else {
    void role; // role was used by the original stub; kept for future role-aware logic
    score += W.timeRelevance;
  }

  // Quality score
  score += (venue.quality_score / 10) * W.qualityNormalize;

  // Curation boost
  score += venue.curation_boost * W.curationMultiplier;

  // Google rating — normalized: 3.5→0, 5.0→max. Below 3.5 contributes 0.
  if (venue.google_rating != null) {
    const normalized = Math.max(0, (venue.google_rating - 3.5) / 1.5);
    score += Math.min(1, normalized) * W.googleRating;
  }

  // Saved-venue boost — gentle (+5/~100), doesn't override discovery.
  if (savedVenueIds.has(venue.id)) score += 5;

  // Random jitter for variety on regenerate
  score += random() * jitter;

  return score;
}

function hardFilter(
  venues: Venue[],
  role: StopRole,
  answers: QuestionnaireAnswers,
  weather: WeatherInfo | null,
  exclude: Set<string>,
  enforceNeighborhood: boolean = true,
  venueRoleHint?: VenueRole
): Venue[] {
  return venues.filter((v) => {
    if (!v.active) return false;
    if (exclude.has(v.id)) return false;
    if (!venueMatchesRole(v, role)) return false;
    if (venueRoleHint && !v.stop_roles.includes(venueRoleHint)) return false;
    if (
      enforceNeighborhood &&
      answers.neighborhoods.length > 0 &&
      !answers.neighborhoods.includes(v.neighborhood)
    ) {
      return false;
    }
    if (weather?.is_bad_weather && v.outdoor_seating === "yes") return false;
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
    if (!venueMatchesRole(v, role)) return false;
    if (weather?.is_bad_weather && v.outdoor_seating === "yes") return false;
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

function applyProximity(candidates: Venue[], anchor: Venue | null, maxKm: number): Venue[] {
  if (!anchor || candidates.length === 0) return candidates;
  const nearby = filterByProximity(candidates, anchor, maxKm);
  return nearby.length > 0 ? nearby : [];
}

// Pick the best venue for a role. Cascade: strict → drop hint → drop hood.
// Weighted top-N pick for variety; jitter=0 → deterministic top-1.
export function pickBestForRole(
  venues: Venue[],
  role: StopRole,
  answers: QuestionnaireAnswers,
  weather: WeatherInfo | null,
  usedIds: Set<string>,
  anchor: Venue | null,
  jitter: number,
  random: () => number = Math.random,
  usedCategories: Set<string> = new Set(),
  dayColumn: DayColumn | null = null,
  timeBlock: TimeBlock | null = null,
  venueRoleHint?: VenueRole,
  savedVenueIds: ReadonlySet<string> = new Set()
): { best: ScoredVenue | null; scored: ScoredVenue[] } {
  const maxWalkKm = getMaxWalkKm(weather);
  const enforceNeighborhood = anchor === null;

  // Cascade: strict (with hint) → drop hint → drop neighborhood.
  // Proximity to anchor is always hard.
  let candidates = hardFilter(venues, role, answers, weather, usedIds, enforceNeighborhood, venueRoleHint);
  candidates = applyProximity(candidates, anchor, maxWalkKm);

  if (candidates.length === 0 && venueRoleHint) {
    candidates = hardFilter(venues, role, answers, weather, usedIds, enforceNeighborhood);
    candidates = applyProximity(candidates, anchor, maxWalkKm);
  }
  if (candidates.length === 0) {
    candidates = applyProximity(
      relaxedFilter(venues, role, usedIds, weather), anchor, maxWalkKm
    );
  }

  const scored: ScoredVenue[] = candidates.map((v) => {
    let score = scoreVenue(v, answers, role, jitter, random, dayColumn, timeBlock, savedVenueIds);
    if (v.category && usedCategories.has(v.category)) {
      score -= ALGORITHM.penalties.categoryDuplicate;
    }
    return { ...v, score };
  });
  scored.sort((a, b) => {
    const scoreDiff = b.score - a.score;
    if (Math.abs(scoreDiff) > 0.01) return scoreDiff;
    const ratingDiff = (b.google_rating ?? 0) - (a.google_rating ?? 0);
    if (Math.abs(ratingDiff) > 0.01) return ratingDiff;
    const reviewDiff = (b.google_review_count ?? 0) - (a.google_review_count ?? 0);
    if (reviewDiff !== 0) return reviewDiff;
    return b.quality_score - a.quality_score;
  });

  // Weighted top-N pick for variety. When jitter=0 (health checks) or
  // topN=1, falls back to deterministic top-1.
  const topN = jitter === 0 ? 1 : (ALGORITHM.pools.pickTopN ?? 1);
  const best =
    topN <= 1 || scored.length <= 1
      ? scored[0] ?? null
      : weightedPickByRank(
          scored.slice(0, Math.min(topN, scored.length)),
          ALGORITHM.pools.pickWeights,
          random
        );

  return { best, scored };
}
