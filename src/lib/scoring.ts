import {
  Venue,
  ScoredVenue,
  StopRole,
  QuestionnaireAnswers,
  WeatherInfo,
  ItineraryStop,
} from "@/types";

const BUDGET_MAP: Record<string, number[]> = {
  casual: [1],
  "nice-out": [2],
  splurge: [3],
  "no-preference": [1, 2, 3],
};

const VIBE_KEYWORDS: Record<string, string[]> = {
  "food-forward": ["restaurant", "food", "dinner", "tasting", "bistro"],
  "drinks-led": ["bar", "cocktail", "wine", "speakeasy", "drinks"],
  "activity-food": ["activity", "bowling", "comedy", "karaoke", "games"],
  "walk-explore": ["walk", "park", "gallery", "bookstore", "market"],
  "mix-it-up": [],
};

function scoreVenue(
  venue: Venue,
  answers: QuestionnaireAnswers,
  role: StopRole,
  jitter: number
): number {
  let score = 0;

  // Vibe match (35%)
  const vibeKws = VIBE_KEYWORDS[answers.vibe] ?? [];
  if (vibeKws.length === 0) {
    score += 25; // "mix it up" gets decent base
  } else {
    const catLower = venue.category.toLowerCase();
    const tagMatch = venue.vibe_tags.some((t) =>
      vibeKws.some((kw) => t.toLowerCase().includes(kw))
    );
    const catMatch = vibeKws.some((kw) => catLower.includes(kw));
    if (tagMatch || catMatch) score += 35;
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

  // Location — boost if correct neighborhood (10%)
  if (
    answers.neighborhood === "surprise-me" ||
    venue.neighborhood === answers.neighborhood
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
      answers.neighborhood !== "surprise-me" &&
      v.neighborhood !== answers.neighborhood
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

export function selectTrio(
  venues: Venue[],
  answers: QuestionnaireAnswers,
  weather: WeatherInfo | null,
  jitter: number = 10
): { stops: ItineraryStop[]; planBs: Record<string, Venue | null> } {
  const usedIds = new Set<string>();
  const stops: ItineraryStop[] = [];
  const planBs: Record<string, Venue | null> = {};

  const roles: StopRole[] = ["main", "opener", "closer"];
  const fixedRoles = new Set<StopRole>(["main"]);

  for (const role of roles) {
    let candidates = hardFilter(venues, role, answers, weather, usedIds);

    // Progressive relaxation: drop neighborhood filter if too few
    if (candidates.length === 0) {
      candidates = relaxedFilter(venues, role, usedIds, weather);
    }

    // Score and sort
    const scored: ScoredVenue[] = candidates.map((v) => ({
      ...v,
      score: scoreVenue(v, answers, role, jitter),
    }));
    scored.sort((a, b) => b.score - a.score);

    const best = scored[0] ?? null;
    const isFixed = fixedRoles.has(role);

    if (best) {
      usedIds.add(best.id);
      stops.push({
        role,
        venue: best,
        curation_note: best.curation_note,
        spend_estimate: spendEstimate(best.price_tier),
        is_fixed: isFixed,
        plan_b: null, // filled below
      });

      // Plan B for flexible stops
      if (!isFixed && scored.length > 1) {
        const backup = scored[1];
        planBs[role] = backup;
      } else {
        planBs[role] = null;
      }
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
