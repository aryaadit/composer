// Tuning constants live in src/config/algorithm.ts — adjust there, not here.

import {
  Venue,
  QuestionnaireAnswers,
  WeatherInfo,
  ItineraryStop,
  StopRole,
  VenueRole,
} from "@/types";
import type { StopPattern } from "@/types";
import { pickBestForRole } from "@/lib/scoring";
import { spendEstimate } from "@/config/budgets";
import { ALGORITHM } from "@/config/algorithm";
import { getStop1Hint } from "@/config/templates";
import { ROLE_EXPANSION } from "@/config/generated/stop-roles";
import type { DayColumn, TimeWindow } from "@/lib/itinerary/time-blocks";

export type { StopPattern };

// Re-export so route.ts can reference role durations for end-time buffering.
export const ROLE_AVG_DURATION_MIN: Record<StopRole, number> =
  ALGORITHM.composition.roleDurationMin as Record<StopRole, number>;

/**
 * Stop 1 venue role pool. Phase 2 collapsed variable-length templates
 * into a flat 2-stop default — stop 1 picks from a UNION of opener-OR-
 * closer-canonical venues, stop 2 always Main. The same pool drives the
 * "+ Add another stop" extension (excluding stop 1's chosen venue).
 */
export const STOP_1_POOL = ["opener", "closer"] as const satisfies readonly StopRole[];

/**
 * Disambiguate a picked stop-1 venue's canonical role for the
 * persisted `ItineraryStop.role`. A drinks-tagged venue serves both
 * opener and closer canonically; we default to "opener" because stop 1
 * is chronologically the start of the night, which matches the "Start
 * here" UI label for opener.
 */
export function disambiguateStop1Role(venue: Venue): StopRole {
  const expanded = new Set<string>();
  for (const vr of venue.stop_roles) {
    for (const r of ROLE_EXPANSION[vr] ?? []) expanded.add(r);
  }
  return expanded.has("opener") ? "opener" : "closer";
}

/**
 * Plan the stop sequence. Phase 2 collapsed this to a flat 2-stop
 * pattern: STOP_1_POOL → main. Vibe still influences stop-1 candidate
 * selection via the venueRoleHint (e.g. drinks_led hints "drinks" so
 * stop 1 biases toward bars); main carries no hint.
 *
 * The mix_it_up vibe is resolved inside `getStop1Hint` by randomly
 * picking a concrete vibe via the seeded PRNG — same semantics the
 * deleted template-list version had.
 */
export function planStopMix(
  answers: QuestionnaireAnswers,
  random: () => number = Math.random,
): StopPattern {
  const stop1Hint = getStop1Hint(answers.vibe, random);
  return [
    {
      role: STOP_1_POOL,
      ...(stop1Hint ? { venueRoleHint: stop1Hint } : {}),
    },
    { role: "main" },
  ];
}

/**
 * Compose a complete itinerary from a pool of candidate venues.
 *
 * Phase 2 flow:
 * 1. `planStopMix` returns a 2-stop pattern: [{role: STOP_1_POOL, hint?}, {role: "main"}].
 * 2. Pick Main first (no anchor — scored freely).
 * 3. Pick stop 1 from STOP_1_POOL anchored to Main for proximity.
 * 4. Disambiguate stop 1's persisted role from the picked venue's expanded roles.
 *
 * Stop ordering in the returned `stops` is the natural chronological
 * shape: stop 1 (opener-or-closer) then stop 2 (main). Plan B is
 * populated for both stops.
 *
 * @returns `{ stops, pattern }` — assembled stops and the planned pattern.
 *          stops may be shorter than pattern if a role couldn't be filled
 *          (single-stop fallback or worse).
 */
export function composeItinerary(
  venues: Venue[],
  answers: QuestionnaireAnswers,
  weather: WeatherInfo | null,
  jitter: number = ALGORITHM.jitter.magnitude,
  random: () => number = Math.random,
  dayColumn: DayColumn | null = null,
  window: TimeWindow | null = null,
): { stops: ItineraryStop[]; pattern: StopPattern } {
  const pattern = planStopMix(answers, random);
  const usedIds = new Set<string>();
  const usedCategories = new Set<string>();

  // 1. Pick Main first — it anchors geographic clustering for stop 1.
  const { best: main, scored: mainScored } = pickBestForRole(
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
    window,
  );
  if (!main) return { stops: [], pattern };
  usedIds.add(main.id);
  if (main.category) usedCategories.add(main.category);
  const mainPlanB = mainScored.find((v) => v.id !== main.id) ?? null;
  const mainStop = makeStop("main", main, main.curation_note ?? "", true, mainPlanB);

  // 2. Pick stop 1 from STOP_1_POOL, anchored to Main.
  const stop1Hint = pattern[0];
  const stop1HintRole = (stop1Hint?.venueRoleHint as VenueRole | undefined) ?? undefined;
  const { best: stop1Venue, scored: stop1Scored } = pickBestForRole(
    venues,
    STOP_1_POOL,
    answers,
    weather,
    usedIds,
    main,
    jitter,
    random,
    usedCategories,
    dayColumn,
    window,
    stop1HintRole,
  );

  // Single-stop fallback: if no STOP_1_POOL match in range, return Main alone.
  if (!stop1Venue) return { stops: [mainStop], pattern };

  usedIds.add(stop1Venue.id);
  if (stop1Venue.category) usedCategories.add(stop1Venue.category);
  const stop1PlanB = stop1Scored.find((v) => v.id !== stop1Venue.id) ?? null;
  const stop1Role = disambiguateStop1Role(stop1Venue);
  const stop1 = makeStop(
    stop1Role,
    stop1Venue,
    stop1Venue.curation_note ?? "",
    false,
    stop1PlanB,
  );

  return { stops: [stop1, mainStop], pattern };
}

function makeStop(
  role: StopRole,
  venue: Venue,
  note: string,
  isFixed: boolean,
  planB: Venue | null,
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
