// Tuning constants live in src/config/algorithm.ts — adjust there, not here.

import {
  Venue,
  QuestionnaireAnswers,
  WeatherInfo,
  ItineraryStop,
  StopRole,
} from "@/types";
import { pickBestForRole } from "@/lib/scoring";
import { spendEstimate } from "@/config/budgets";
import { ALGORITHM } from "@/config/algorithm";
import type { DayColumn, TimeBlock } from "@/lib/itinerary/time-blocks";

export type StopPattern = StopRole[];

// Re-export so route.ts can reference role durations for end-time buffering.
export const ROLE_AVG_DURATION_MIN: Record<StopRole, number> =
  ALGORITHM.composition.roleDurationMin as Record<StopRole, number>;

// Stop templates ranked largest → smallest. `planStopMix` returns the
// first one whose budget fits the user's window (+ slack). Minimum of
// 2 stops is locked by our product design.
const STOP_TEMPLATES: StopPattern[] = [
  ["opener", "main", "closer", "closer"],
  ["opener", "main", "closer"],
  ["opener", "main"],
];

function templateBudgetMin(pattern: StopPattern): number {
  const durations = pattern.reduce(
    (sum, role) => sum + ROLE_AVG_DURATION_MIN[role],
    0
  );
  const walks = Math.max(0, pattern.length - 1) * ALGORITHM.composition.avgWalkBetweenStopsMin;
  return durations + walks;
}

export function windowMinutes(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let diff = eh * 60 + em - (sh * 60 + sm);
  if (diff <= 0) diff += 24 * 60; // wrap past midnight
  return diff;
}

/**
 * Pick the largest stop pattern whose time budget fits the user's window.
 *
 * Tries templates largest→smallest:
 *   4 stops (opener, main, closer, closer) — needs ≥5h15m
 *   3 stops (opener, main, closer) — needs ≥4h05m
 *   2 stops (opener, main) — needs ≥3h00m (hard minimum)
 *
 * @param answers - Must include resolved startTime and endTime (HH:MM).
 * @returns The role sequence to fill. Always at least 2 stops.
 */
export function planStopMix(answers: QuestionnaireAnswers): StopPattern {
  const window = windowMinutes(answers.startTime, answers.endTime);
  for (const template of STOP_TEMPLATES) {
    if (templateBudgetMin(template) <= window + ALGORITHM.composition.budgetSlackMin) {
      return template;
    }
  }
  // Pathologically short window (under ~3h): still return 2 stops. The
  // end-time buffer check in the API route may drop the closer later.
  return ["opener", "main"];
}

/**
 * Compose a complete itinerary from a pool of candidate venues.
 *
 * 1. Calls `planStopMix` to determine how many stops fit the time window.
 * 2. Picks Main first (no anchor constraint — scored freely).
 * 3. Fills remaining roles anchored to Main for proximity.
 * 4. Tracks `usedIds` and `usedCategories` across picks to avoid
 *    repeats and apply the category-diversity penalty.
 *
 * If no candidate is found for a role, that slot is silently skipped —
 * the returned array may have fewer stops than the planned pattern.
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
  const pattern = planStopMix(answers);
  const usedIds = new Set<string>();
  const usedCategories = new Set<string>();

  // 1. Pick the Main first — it anchors geographic clustering for all others.
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
    timeBlock
  );
  if (!main) return { stops: [], pattern };
  usedIds.add(main.id);
  if (main.category) usedCategories.add(main.category);

  // 2. Place stops in pattern order. The Main fills its declared slot; every
  //    other slot is picked anchored to Main, in left-to-right order.
  let mainPlaced = false;
  const positioned: (ItineraryStop | null)[] = pattern.map((role) => {
    if (role === "main" && !mainPlaced) {
      mainPlaced = true;
      return makeStop("main", main, main.curation_note ?? "", true, null);
    }
    return null;
  });

  for (let i = 0; i < pattern.length; i++) {
    if (positioned[i]) continue;
    const role = pattern[i];
    const { best, scored } = pickBestForRole(
      venues,
      role,
      answers,
      weather,
      usedIds,
      main,
      jitter,
      random,
      usedCategories,
      dayColumn,
      timeBlock
    );
    if (!best) continue;
    usedIds.add(best.id);
    if (best.category) usedCategories.add(best.category);
    const planB = scored.find((v) => v.id !== best.id) ?? null;
    positioned[i] = makeStop(role, best, best.curation_note ?? "", false, planB);
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
