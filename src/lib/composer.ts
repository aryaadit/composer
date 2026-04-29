// Tuning constants live in src/config/algorithm.ts — adjust there, not here.

import {
  Venue,
  QuestionnaireAnswers,
  WeatherInfo,
  ItineraryStop,
  StopRole,
} from "@/types";
import type { StopPattern } from "@/types";
import { pickBestForRole } from "@/lib/scoring";
import { spendEstimate } from "@/config/budgets";
import { ALGORITHM } from "@/config/algorithm";
import { getTemplatesForVibe } from "@/config/templates";
import type { DayColumn, TimeBlock } from "@/lib/itinerary/time-blocks";

export type { StopPattern };

// Re-export so route.ts can reference role durations for end-time buffering.
export const ROLE_AVG_DURATION_MIN: Record<StopRole, number> =
  ALGORITHM.composition.roleDurationMin as Record<StopRole, number>;

function templateBudgetMin(pattern: StopPattern): number {
  const durations = pattern.reduce(
    (sum, hint) => sum + (ROLE_AVG_DURATION_MIN[hint.role] ?? 60),
    0
  );
  const walks =
    Math.max(0, pattern.length - 1) *
    ALGORITHM.composition.avgWalkBetweenStopsMin;
  return durations + walks;
}

export function windowMinutes(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let diff = eh * 60 + em - (sh * 60 + sm);
  if (diff <= 0) diff += 24 * 60;
  return diff;
}

/**
 * Pick the largest vibe-specific stop pattern whose time budget fits.
 *
 * Each vibe maps to its own template list (via `src/config/templates.ts`)
 * with per-slot venueRoleHints. "mix_it_up" randomly picks a concrete
 * vibe's templates at runtime.
 *
 * @param answers - Must include resolved startTime, endTime, and vibe.
 * @param random  - Seeded PRNG for "mix_it_up" vibe selection.
 * @returns The stop hint sequence to fill. Always at least 2 stops.
 */
export function planStopMix(
  answers: QuestionnaireAnswers,
  random: () => number = Math.random
): StopPattern {
  const templates = getTemplatesForVibe(answers.vibe, random);
  const window = windowMinutes(answers.startTime, answers.endTime);
  const slack = ALGORITHM.composition.budgetSlackMin;

  for (const t of templates) {
    if (templateBudgetMin(t) <= window + slack) return t;
  }
  // Pathological short window: return smallest template, min 2 stops.
  return templates[templates.length - 1] ?? [
    { role: "opener" },
    { role: "main" },
  ];
}

/**
 * Compose a complete itinerary from a pool of candidate venues.
 *
 * 1. Calls `planStopMix` to pick a vibe-specific template.
 * 2. Picks Main first (no anchor constraint — scored freely).
 * 3. Fills remaining roles anchored to Main for proximity.
 * 4. Each slot's `venueRoleHint` biases toward specific venue types
 *    (e.g., "drinks" for bar slots in a drinks-led itinerary).
 * 5. Tracks `usedIds` and `usedCategories` across picks.
 *
 * If no candidate is found for a role, that slot is silently skipped.
 *
 * @param venues    - Pre-filtered venue pool (post candidate-filtering).
 * @param answers   - User's questionnaire responses with resolved times.
 * @param weather   - Weather info; affects proximity cap and outdoor filter.
 * @param jitter    - Jitter magnitude. Defaults to ALGORITHM.jitter.magnitude.
 * @param random    - Seeded PRNG. Defaults to Math.random.
 * @param dayColumn - Per-day column for time relevance scoring. Null = skip.
 * @param timeBlock - Time block for time relevance scoring. Null = skip.
 *
 * @returns `{ stops, pattern }` — the assembled stops and the planned
 *          role sequence (pattern may be longer than stops if roles were skipped).
 */
export function composeItinerary(
  venues: Venue[],
  answers: QuestionnaireAnswers,
  weather: WeatherInfo | null,
  jitter: number = ALGORITHM.jitter.magnitude,
  random: () => number = Math.random,
  dayColumn: DayColumn | null = null,
  timeBlock: TimeBlock | null = null
): { stops: ItineraryStop[]; pattern: StopPattern } {
  const pattern = planStopMix(answers, random);
  const usedIds = new Set<string>();
  const usedCategories = new Set<string>();

  // Find the Main entry in the pattern to read its venueRoleHint.
  const mainHint = pattern.find((h) => h.role === "main");

  // 1. Pick Main first — it anchors geographic clustering.
  const { best: main } = pickBestForRole(
    venues,
    "main",
    answers,
    weather,
    usedIds,
    null,
    jitter,
    random,
    usedCategories,
    dayColumn,
    timeBlock,
    mainHint?.venueRoleHint
  );
  if (!main) return { stops: [], pattern };
  usedIds.add(main.id);
  if (main.category) usedCategories.add(main.category);

  // 2. Place stops in pattern order. Main fills its slot; others are
  //    picked anchored to Main for proximity.
  let mainPlaced = false;
  const positioned: (ItineraryStop | null)[] = pattern.map((hint) => {
    if (hint.role === "main" && !mainPlaced) {
      mainPlaced = true;
      return makeStop("main", main, main.curation_note ?? "", true, null);
    }
    return null;
  });

  for (let i = 0; i < pattern.length; i++) {
    if (positioned[i]) continue;
    const hint = pattern[i];
    const { best, scored } = pickBestForRole(
      venues,
      hint.role,
      answers,
      weather,
      usedIds,
      main,
      jitter,
      random,
      usedCategories,
      dayColumn,
      timeBlock,
      hint.venueRoleHint
    );
    if (!best) continue;
    usedIds.add(best.id);
    if (best.category) usedCategories.add(best.category);
    const planB = scored.find((v) => v.id !== best.id) ?? null;
    positioned[i] = makeStop(
      hint.role,
      best,
      best.curation_note ?? "",
      false,
      planB
    );
  }

  const stops = positioned.filter((s): s is ItineraryStop => s !== null);
  return { stops, pattern };
}

function makeStop(
  role: StopRole,
  venue: Venue,
  note: string,
  isFixed: boolean,
  planB: Venue | null
): ItineraryStop {
  return {
    role,
    venue,
    curation_note: note,
    spend_estimate: spendEstimate(venue.price_tier ?? 2),
    is_fixed: isFixed,
    plan_b: planB,
  };
}
