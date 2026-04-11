import {
  Venue,
  ScoredVenue,
  StopRole,
  QuestionnaireAnswers,
  WeatherInfo,
  ItineraryStop,
} from "@/types";
import { walkDistanceKm } from "@/lib/geo";

const MAX_WALK_KM = 1.5; // ~20 min walk

const BUDGET_MAP: Record<string, number[]> = {
  casual: [1],
  "nice-out": [2],
  splurge: [3],
  "no-preference": [1, 2, 3],
};

// Canonical vibe tags — exact match only. Venues must use these tags.
// Cross-cutting tags (romantic, conversation_friendly, group_friendly,
// late_night, casual, upscale, outdoor) are valid on venues but don't
// participate in vibe scoring.
const VIBE_TAGS: Record<string, string[]> = {
  "food-forward": ["food_forward", "tasting", "dinner", "bistro"],
  "drinks-led": ["cocktail_forward", "wine_bar", "speakeasy", "drinks"],
  "activity-food": ["activity", "comedy", "karaoke", "games", "bowling"],
  "walk-explore": ["walk", "gallery", "bookstore", "market", "park"],
  "mix-it-up": [],
};

function scoreVenue(
  venue: Venue,
  answers: QuestionnaireAnswers,
  role: StopRole,
  jitter: number
): number {
  let score = 0;

  // Vibe match (35%) — exact canonical tag matching
  const vibeTags = VIBE_TAGS[answers.vibe] ?? [];
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
  const allowedTiers = BUDGET_MAP[answers.budget] ?? [1, 2, 3];
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

  // Time relevance (10%) — simple heuristic based on role
  score += 10; // base time score

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

function isWithinWalkRange(a: Venue, b: Venue): boolean {
  return walkDistanceKm(a.latitude, a.longitude, b.latitude, b.longitude) <= MAX_WALK_KM;
}

function filterByProximity(candidates: Venue[], anchor: Venue): Venue[] {
  return candidates.filter((v) => isWithinWalkRange(v, anchor));
}

function pickBestForRole(
  venues: Venue[],
  role: StopRole,
  answers: QuestionnaireAnswers,
  weather: WeatherInfo | null,
  usedIds: Set<string>,
  anchor: Venue | null,
  jitter: number
): { best: ScoredVenue | null; scored: ScoredVenue[] } {
  // 1. Hard filter (neighborhood match)
  let candidates = hardFilter(venues, role, answers, weather, usedIds);

  // 2. Enforce proximity to anchor
  if (anchor && candidates.length > 0) {
    const nearby = filterByProximity(candidates, anchor);
    if (nearby.length > 0) candidates = nearby;
    // If no nearby candidates survive, fall through to relaxed filter
    else candidates = [];
  }

  // 3. Progressive relaxation: drop neighborhood, keep proximity
  if (candidates.length === 0) {
    candidates = relaxedFilter(venues, role, usedIds, weather);
    if (anchor && candidates.length > 0) {
      const nearby = filterByProximity(candidates, anchor);
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

export function selectTrio(
  venues: Venue[],
  answers: QuestionnaireAnswers,
  weather: WeatherInfo | null,
  jitter: number = 10
): { stops: ItineraryStop[]; planBs: Record<string, Venue | null> } {
  const usedIds = new Set<string>();
  const stops: ItineraryStop[] = [];
  const planBs: Record<string, Venue | null> = {};

  // Step 1: Pick main first — it's the anchor for geo clustering
  const { best: main } = pickBestForRole(
    venues, "main", answers, weather, usedIds, null, jitter
  );

  if (main) {
    usedIds.add(main.id);
    stops.push({
      role: "main",
      venue: main,
      curation_note: main.curation_note,
      spend_estimate: spendEstimate(main.price_tier),
      is_fixed: true,
      plan_b: null,
    });
    planBs["main"] = null;
  }

  // Step 2: Pick opener and closer, anchored to main's location
  const flexRoles: StopRole[] = ["opener", "closer"];
  for (const role of flexRoles) {
    const { best, scored } = pickBestForRole(
      venues, role, answers, weather, usedIds, main, jitter
    );

    if (best) {
      usedIds.add(best.id);
      stops.push({
        role,
        venue: best,
        curation_note: best.curation_note,
        spend_estimate: spendEstimate(best.price_tier),
        is_fixed: false,
        plan_b: null,
      });

      // Plan B: next best candidate still within walk range
      const backup = scored.find((v) => v.id !== best.id) ?? null;
      planBs[role] = backup;
    } else {
      planBs[role] = null;
    }
  }

  // Reorder: opener → main → closer
  const ordered = ["opener", "main", "closer"]
    .map((r) => stops.find((s) => s.role === r))
    .filter(Boolean) as ItineraryStop[];

  // Attach plan B
  for (const stop of ordered) {
    if (!stop.is_fixed && planBs[stop.role]) {
      stop.plan_b = planBs[stop.role];
    }
  }

  return { stops: ordered, planBs };
}

function spendEstimate(tier: number): string {
  switch (tier) {
    case 1:
      return "$15–30";
    case 2:
      return "$35–65";
    case 3:
      return "$75–150";
    default:
      return "$30–60";
  }
}
