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
import { walkTimeMinutes } from "@/lib/geo";
import type { ZeroingStage } from "@/lib/itinerary/pre-filter";

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
 * Unknown vibes (legacy "mix_it_up", "walk_explore" in old share-links)
 * are resolved inside `getStop1Hint` by randomly picking a concrete
 * vibe via the seeded PRNG — graceful degradation, not load-bearing.
 */
// ── End-time fit projection ──────────────────────────────────────
// Restored 2026-06-11 after the strict-filters change over-deleted the
// post-compose buffer truncation. A 2-stop itinerary whose projected
// timeline overflows the user's window is an honest "doesn't fit"
// failure, not a silent overshoot.
//
// IMPORTANT — constraint source: the user only picks `startTime`. The
// `endTime` on QuestionnaireAnswers is derived from a fixed
// `COMPOSE_WINDOW_HOURS = 5` policy in src/lib/itinerary/time-blocks.ts
// (`resolveTimeWindow`). That makes the available duration invariant
// across user choices — moving startTime moves endTime by the same
// amount. So the fit gate enforces a PRODUCT POLICY (the 5-hour
// "one night" envelope), NOT a user input. The failure copy and
// suggestions reflect this: there's no "earlier start" the user can
// pick to widen the window; the actionable levers are vibe (different
// duration profile) and neighborhood (different venue mix).
//
// Two gates:
//   1. Main candidate fit: loose upper bound — assume the shortest
//      possible stop 1 + a conservative walk estimate. Rejects mains
//      whose duration alone forces overshoot regardless of stop 1.
//   2. Stop 1 candidate fit: exact projection against the picked Main —
//      uses real venue coords for the walk and the picked Main's
//      actual duration.
//
// Both gates skip when `window` is null (legacy/test callers that pass
// no window).

function parseHHMM(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function windowEndMin(startTime: string, endTime: string): number {
  const s = parseHHMM(startTime);
  let e = parseHHMM(endTime);
  if (e <= s) e += 24 * 60; // wrap past midnight (e.g. 19:00 → 00:00)
  return e;
}

function durationMin(venue: Venue, role: StopRole): number {
  return venue.duration_hours
    ? Math.round(venue.duration_hours * 60)
    : ROLE_AVG_DURATION_MIN[role];
}

/** Conservative lower-bound inter-stop walk estimate, used at the Main-
 * fit gate before stop 1 is known. The exact walk replaces this at the
 * stop-1 gate. 5 min ≈ 400 m at 4.8 km/h — well below the proximity cap
 * but realistic for adjacent venues. */
const MIN_INTER_STOP_WALK_MIN = 5;

/** True if Main `m` could possibly fit a 2-stop itinerary in the user's
 * window — uses the shortest STOP_1_POOL duration + the minimum walk
 * estimate as the loosest bound. False mains are dropped before the
 * Main pick. */
function mainCouldFit(
  m: Venue,
  startMin: number,
  endMin: number,
): boolean {
  const minStop1 = Math.min(
    ROLE_AVG_DURATION_MIN.opener,
    ROLE_AVG_DURATION_MIN.closer,
  );
  return startMin + minStop1 + MIN_INTER_STOP_WALK_MIN + durationMin(m, "main") <= endMin;
}

/** True if (`stop1`, picked `main`) project a finish time within the
 * user's window. Uses real coords for the walk and the picked Main's
 * actual duration. Stop 1's role is "opener" — both opener and closer
 * carry the same average so the choice is symmetric. */
function pairFits(
  stop1: Venue,
  main: Venue,
  startMin: number,
  endMin: number,
): boolean {
  const s1Dur = durationMin(stop1, "opener");
  const mainDur = durationMin(main, "main");
  const walk = walkTimeMinutes(
    stop1.latitude,
    stop1.longitude,
    main.latitude,
    main.longitude,
  );
  return startMin + s1Dur + walk + mainDur <= endMin;
}

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
): {
  stops: ItineraryStop[];
  pattern: StopPattern;
  /** Populated when stops is empty so /api/generate can surface the
   * right ComposeFailure stage. `"proximity"` for unfillable stop 1
   * after the cascade; `"fit"` when the projected timeline overshoots
   * endTime; `"hours"` when Main has no role-eligible candidate at all. */
  zeroingStage?: ZeroingStage;
} {
  const pattern = planStopMix(answers, random);
  const usedIds = new Set<string>();
  const usedCategories = new Set<string>();

  // End-time fit projection. Skipped when window is null (test/health
  // callers); always active in production where route.ts builds a real
  // window from the user's startTime.
  const fitGate = window !== null;
  const startMin = fitGate ? parseHHMM(answers.startTime) : 0;
  const endMin = fitGate ? windowEndMin(answers.startTime, answers.endTime) : 0;

  // 1. Filter Main candidates whose duration alone forces overshoot —
  // loose upper bound (shortest stop-1 + minimum walk). This narrows
  // the pool passed to pickBestForRole so a too-long Main can't win
  // the scoring race only to be rejected after the fact.
  const mainPool = fitGate
    ? venues.filter((v) => {
        // Only gate venues that ARE main-eligible. Non-mains are
        // dropped by pickBestForRole's role filter anyway.
        if (!v.stop_roles.some((r) => (ROLE_EXPANSION[r] ?? []).includes("main"))) {
          return true;
        }
        return mainCouldFit(v, startMin, endMin);
      })
    : venues;

  // If every main-eligible venue was dropped by the fit gate, the
  // failure is "fit" — not "proximity" or "hours" — and the user's
  // window is the actionable lever.
  if (fitGate) {
    const survivedMains = mainPool.filter((v) =>
      v.stop_roles.some((r) => (ROLE_EXPANSION[r] ?? []).includes("main")),
    );
    if (survivedMains.length === 0) {
      return { stops: [], pattern, zeroingStage: "fit" };
    }
  }

  // 2. Pick Main first — it anchors geographic clustering for stop 1.
  const { best: main, scored: mainScored } = pickBestForRole(
    mainPool,
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
  if (!main) return { stops: [], pattern, zeroingStage: "proximity" };
  usedIds.add(main.id);
  if (main.category) usedCategories.add(main.category);
  const mainPlanB = mainScored.find((v) => v.id !== main.id) ?? null;
  const mainStop = makeStop("main", main, main.curation_note ?? "", true, mainPlanB);

  // 3. Filter stop 1 candidates by exact projection against the picked
  // Main. Real walk distance, real Main duration — no estimates.
  const stop1Pool = fitGate
    ? venues.filter((v) => v.id !== main.id && pairFits(v, main, startMin, endMin))
    : venues;
  if (fitGate && stop1Pool.length === 0) {
    return { stops: [], pattern, zeroingStage: "fit" };
  }

  // 4. Pick stop 1 from STOP_1_POOL, anchored to Main.
  const stop1Hint = pattern[0];
  const stop1HintRole = (stop1Hint?.venueRoleHint as VenueRole | undefined) ?? undefined;
  const { best: stop1Venue, scored: stop1Scored } = pickBestForRole(
    stop1Pool,
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

  // 2026-06-11: the single-stop fallback was removed (composer used to
  // return { stops: [mainStop] } here). A null stop1 means proximity-
  // restricted candidates ran out — the route handler turns that into
  // an honest ComposeFailure with zeroingStage="proximity" rather than
  // silently shipping a one-stop itinerary.
  if (!stop1Venue) return { stops: [], pattern, zeroingStage: "proximity" };

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

/** Exported for swap-stop / add-stop to post-validate a patched
 * itinerary's timeline. Returns true iff every stop in `stops` (with
 * walk segments between consecutive stops) finishes within the user's
 * window. */
export function itineraryFits(
  stops: { venue: Venue; role: StopRole }[],
  startTime: string,
  endTime: string,
): boolean {
  if (stops.length === 0) return true;
  const startMin = parseHHMM(startTime);
  const endMin = windowEndMin(startTime, endTime);
  let cursor = startMin;
  for (let i = 0; i < stops.length; i++) {
    if (i > 0) {
      cursor += walkTimeMinutes(
        stops[i - 1].venue.latitude,
        stops[i - 1].venue.longitude,
        stops[i].venue.latitude,
        stops[i].venue.longitude,
      );
    }
    cursor += durationMin(stops[i].venue, stops[i].role);
  }
  return cursor <= endMin;
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
