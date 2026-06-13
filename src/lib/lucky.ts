// Pure roll logic for the surprise-me ("Lucky") compose entry. Side-
// effect-free so the dice-space, cutoff, and gate-predicate invariants
// are testable against the same constants the UI consumes.
//
// Architectural rule (non-negotiable per the spec): Lucky randomizes
// QUESTIONNAIRE INPUTS and calls /api/generate unchanged. It never
// selects venues, never touches the filter stack, never bypasses the
// gate. The dice space is defined by `isGroupVisible` and
// `isTierSelectable` so a hidden group or disabled tier is unrollable
// by construction — the same predicates the picker uses.

import {
  expandNeighborhoodGroup,
  NEIGHBORHOOD_GROUPS,
} from "@/config/neighborhoods";
import {
  isGroupVisible,
  isTierSelectable,
  COMPOSE_TIERS,
} from "@/config/group-visibility";
import {
  COMPOSE_START_TIMES,
  type ComposeStartTime,
} from "@/lib/itinerary/time-blocks";
import { LUCKY } from "@/config/lucky";
import { createSeededRandom, fnv1a32 } from "@/lib/itinerary/seed";
import type {
  GenerateRequestBody,
  OccasionBucket,
  Vibe,
  Neighborhood,
} from "@/types";

/** Three focus vibes only. `mix_it_up` is "no specific focus" — a
 *  random pick of it would mean "anything goes," which isn't a real
 *  surprise. 2026-06-13: activity_food was retired with the Activity
 *  focus collapse; the dice space is now Meal + Drinks. */
export const LUCKY_VIBES: readonly Vibe[] = [
  "food_forward",
  "drinks_led",
] as const;

/** Occasion is scoring-only (no filter), so a fixed default is fine.
 *  "friends" is the most generic of the three UI buckets — least bias
 *  toward a specific company. */
export const LUCKY_OCCASION_DEFAULT: OccasionBucket = "friends" as const;

function pick<T>(arr: readonly T[], rand: () => number): T {
  return arr[Math.floor(rand() * arr.length)];
}

/** ISO date for "today" in the local NYC clock — same shape the
 *  questionnaire's day step stores. */
export function isoDateToday(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Earliest COMPOSE_START_TIMES pill at least `cutoffBufferMin` minutes
 *  from `now`, or null if all of today's pills are too close. Local
 *  time only (NYC product, NYC clock — same assumption the rest of the
 *  compose flow makes). */
export function nextEligibleStartTime(
  now: Date,
  cutoffBufferMin: number = LUCKY.cutoffBufferMin,
): ComposeStartTime | null {
  const cutoff = new Date(now.getTime() + cutoffBufferMin * 60_000);
  // Midnight guard: if `now + buffer` rolled into tomorrow, none of
  // today's pills are reachable. Same-day is the product definition
  // (no silent rollover to tomorrow per the spec), so return null and
  // let the button render disabled.
  if (
    cutoff.getDate() !== now.getDate() ||
    cutoff.getMonth() !== now.getMonth() ||
    cutoff.getFullYear() !== now.getFullYear()
  ) {
    return null;
  }
  const cutoffH = cutoff.getHours();
  const cutoffM = cutoff.getMinutes();
  for (const slot of COMPOSE_START_TIMES) {
    const [hStr, mStr] = slot.split(":");
    const h = Number(hStr);
    const m = Number(mStr);
    // A pill is eligible iff (h,m) >= cutoff (h,m).
    if (h > cutoffH || (h === cutoffH && m >= cutoffM)) return slot;
  }
  return null;
}

export interface LuckyRollResult {
  /** Shape ready to POST as the /api/generate body — same as the
   *  questionnaire produces, just with random dimensions. */
  body: GenerateRequestBody;
  /** The single rolled group id (NEIGHBORHOOD_GROUPS key). Surfaced
   *  for analytics/tests; the picker would otherwise expand it to
   *  storage slugs and lose the human-readable handle. */
  groupId: string;
}

/** Roll an input set for /api/generate.
 *
 *  Dice space is defined by the gate predicates:
 *    - group: uniform random over groups where `isGroupVisible(g)`
 *    - budget: uniform random over tiers where
 *              `isTierSelectable(rolledGroup, tier)`
 *    - vibe: uniform random over the three focus vibes
 *    - occasion: LUCKY_OCCASION_DEFAULT (scoring-only)
 *    - day: today (local NYC clock — same as the rest of the compose
 *           flow assumes)
 *    - startTime: caller-supplied (must come from `nextEligibleStartTime`
 *      first; we don't recompute so the button can disable itself
 *      when there's no eligible slot today)
 *
 *  Throws if the bake leaves zero visible groups or zero selectable
 *  tiers for the rolled group — both are bake misconfigurations that
 *  would silently degrade the questionnaire too, so failing loudly
 *  surfaces the problem at deploy time. */
export function rollLuckyInputs(
  now: Date,
  startTime: ComposeStartTime,
  rand: () => number = Math.random,
): LuckyRollResult {
  const visibleGroups = NEIGHBORHOOD_GROUPS.filter(isGroupVisible);
  if (visibleGroups.length === 0) {
    throw new Error("[lucky] no visible groups — bake misconfigured");
  }
  const group = pick(visibleGroups, rand);
  const selectableTiers = COMPOSE_TIERS.filter((t) =>
    isTierSelectable(group, t),
  );
  if (selectableTiers.length === 0) {
    // Should be unreachable: isGroupVisible's predicate (median tier
    // count >= bar) means at least the median tier clears the same
    // bar isTierSelectable checks. Defensive throw so a future
    // GROUP_VISIBILITY mode change doesn't silently produce an empty
    // budget space.
    throw new Error(
      `[lucky] no selectable tiers for visible group ${group.id} — bake misconfigured`,
    );
  }
  const budget = pick(selectableTiers, rand);
  const vibe = pick(LUCKY_VIBES, rand);
  return {
    body: {
      occasion: LUCKY_OCCASION_DEFAULT,
      neighborhoods: expandNeighborhoodGroup(group.id) as Neighborhood[],
      budget,
      vibe,
      day: isoDateToday(now),
      startTime,
    },
    groupId: group.id,
  };
}

/** Deterministic variant of `rollLuckyInputs`. Same dice space, same
 *  predicates — only the randomness source is swapped from Math.random
 *  to a PRNG seeded by `(seedSource, attempt)`.
 *
 *  Used by Tonight's Pick (seed = `${user_id}|${pick_date}`) so the
 *  daily roll is stable across the day and across retries. Each retry
 *  passes a higher `attempt` so the seed differs — without that the
 *  same dice space + same seed would just re-roll the same losing
 *  combination on every 422.
 *
 *  Returns the same shape as `rollLuckyInputs`. */
export function rollLuckyInputsSeeded(
  now: Date,
  startTime: ComposeStartTime,
  seedSource: string,
  attempt: number = 1,
): LuckyRollResult {
  const seed = fnv1a32(`${seedSource}|attempt:${attempt}`);
  const rand = createSeededRandom(seed);
  return rollLuckyInputs(now, startTime, rand);
}
