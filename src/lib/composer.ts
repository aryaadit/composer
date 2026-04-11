import {
  Venue,
  QuestionnaireAnswers,
  WeatherInfo,
  ItineraryStop,
  StopRole,
} from "@/types";
import { pickBestForRole } from "@/lib/scoring";

export type StopPattern = StopRole[];

const SHORT_WINDOW_MIN = 150; // 2.5h cutoff for 2-stop nights
const LONG_WINDOW_MIN = 270; // 4.5h cutoff for 4-stop nights

/**
 * Decide how many stops fit in the user's evening window and which roles to
 * fill. Always returns 2-4 stops anchored on a single Main.
 *
 * - <2.5h: ["opener", "main"]                  drinks → dinner
 * - <4.5h: ["opener", "main", "closer"]        the classic trio
 * - else:  ["opener", "main", "closer", "closer"]   extended evening
 */
export function planStopMix(answers: QuestionnaireAnswers): StopPattern {
  const minutes = windowMinutes(answers.startTime, answers.endTime);
  if (minutes < SHORT_WINDOW_MIN) return ["opener", "main"];
  if (minutes < LONG_WINDOW_MIN) return ["opener", "main", "closer"];
  return ["opener", "main", "closer", "closer"];
}

function windowMinutes(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let diff = eh * 60 + em - (sh * 60 + sm);
  if (diff <= 0) diff += 24 * 60; // wrap past midnight
  return diff;
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
  jitter: number = 10
): { stops: ItineraryStop[]; pattern: StopPattern } {
  const pattern = planStopMix(answers);
  const usedIds = new Set<string>();

  // 1. Pick the Main first — it anchors geographic clustering for all others.
  const { best: main } = pickBestForRole(
    venues,
    "main",
    answers,
    weather,
    usedIds,
    null,
    jitter
  );
  if (!main) return { stops: [], pattern };
  usedIds.add(main.id);

  // 2. Place stops in pattern order. The Main fills its declared slot; every
  //    other slot is picked anchored to Main, in left-to-right order.
  let mainPlaced = false;
  const positioned: (ItineraryStop | null)[] = pattern.map((role) => {
    if (role === "main" && !mainPlaced) {
      mainPlaced = true;
      return makeStop("main", main, main.curation_note, true, null);
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
      jitter
    );
    if (!best) continue;
    usedIds.add(best.id);
    const planB = scored.find((v) => v.id !== best.id) ?? null;
    positioned[i] = makeStop(role, best, best.curation_note, false, planB);
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
    spend_estimate: spendEstimate(venue.price_tier),
    is_fixed: isFixed,
    plan_b: planB,
  };
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
