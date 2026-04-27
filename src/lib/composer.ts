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
 * Pick the largest stop pattern whose budget fits the user's window.
 *
 * Budgets (with AVG_WALK=10, slack 15):
 *   4 stops: 60+120+60+60 + 3×10 = 330 min  (needs ≥ 5h15m window)
 *   3 stops: 60+120+60   + 2×10 = 260 min  (needs ≥ 4h05m window)
 *   2 stops: 60+120      + 1×10 = 190 min  (needs ≥ 3h00m window)
 *   else:    2 stops as the hard minimum.
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
 * Compose the evening: ask `planStopMix` for the role pattern, then pick the
 * Main as the geographic anchor and fill the remaining slots in pattern order
 * subject to walking-distance proximity. Each non-Main stop carries its own
 * Plan B alternative pulled from the same scored list.
 */
export function composeItinerary(
  venues: Venue[],
  answers: QuestionnaireAnswers,
  weather: WeatherInfo | null,
  jitter: number = ALGORITHM.jitter.magnitude,
  random: () => number = Math.random
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
    usedCategories
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
      usedCategories
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
