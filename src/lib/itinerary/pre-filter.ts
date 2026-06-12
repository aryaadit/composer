// Canonical pre-scoring filter stack consumed by /api/generate,
// /api/swap-stop, and /api/add-stop. The principle: user inputs are
// inviolable. Every filter here enforces something the user picked or a
// dataset hygiene rule. NONE of them widen, drop, or otherwise relax
// when the pool comes up thin — that's the spec change documented in
// docs/algorithm-relaxation-audit.md.
//
// Stages in order — chosen so the cheapest cut runs first and so the
// `zeroingStage` returned on failure is the most user-actionable answer
// (e.g. an exclusion-zeroed pool is reported as "exclusions" before the
// downstream filters would have had a chance to also zero it):
//   1. exclusions   — every venue the client asked us to skip
//   2. drinks=no    — alcohol-vibe drop driven by the signed-in profile
//   3. hours        — venueOpenForWindow on the chosen day
//   4. closed       — business_status not in {CLOSED_PERMANENTLY,
//                     CLOSED_TEMPORARILY} (defensive — most active rows
//                     are operational, but the column can drift)
//   5. budget       — BUDGET_TIER_MAP membership, EXACT (no widening)
//   6. neighborhood — strict union membership on the chosen group slugs
//
// Returns { ok: true, venues } when every stage produced a non-empty
// pool, or { ok: false, zeroingStage } naming the FIRST stage that
// zeroed the pool. Routes turn the zeroingStage into a structured
// ComposeFailure (src/lib/itinerary/compose-failure.ts).

import type { Venue, QuestionnaireAnswers, DrinksPref } from "@/types";
import { BUDGET_TIER_MAP } from "@/config/budgets";
import { ALCOHOL_VIBE_TAGS } from "@/config/vibes";
import {
  venueOpenForWindow,
  dateToDayColumn,
  type DayColumn,
  type TimeWindow,
} from "@/lib/itinerary/time-blocks";

export type ZeroingStage =
  | "exclusions"
  | "hours"
  | "neighborhood"
  | "budget"
  | "proximity"
  // Added after the 2026-06-11 adversarial review (3 of 3 reviewers
  // flagged it): drinks=no zeroing was being reported as
  // "neighborhood," misdirecting users with an alcohol-skewed pool to
  // try a different area instead of relaxing their drinks preference.
  | "drinks"
  // Restored 2026-06-11 (post-launch-question correction): the
  // deleted-then-restored end-time fit constraint. End time is a user
  // input — a projected itinerary whose `startTime + sum(durations) +
  // sum(walks)` exceeds the user's window is an honest "doesn't fit"
  // failure, not a silent overshoot. Composer pre-filters Main and
  // stop-1 candidates by projected timeline; swap-stop and add-stop
  // post-validate the patched itinerary. See ALGORITHM.md "End-time fit."
  | "fit"
  // Added 2026-06-12: NEVER returned by the server's pre-filter — it's
  // a CLIENT-only stage the catch paths in useSwapStop / handleAddStop
  // synthesize when an unexpected exception fires (network drop, JSON
  // parse failure, 500 response). Catch paths used to surface as
  // composeFailure("proximity") whose copy reads "Nothing nearby pairs
  // up" — telling users to widen their neighborhood when the server
  // crashed. The "system" copy uses neutral framing instead. Distinct
  // from the analytics *_failed/*_errored convention: this is purely
  // about user-facing copy registry semantics.
  | "system";

export type PreFilterResult =
  | { ok: true; venues: Venue[] }
  | { ok: false; zeroingStage: ZeroingStage };

/** Subset of QuestionnaireAnswers the pre-filter actually reads.
 * Anything not listed here is irrelevant to gating the pool and stays a
 * scoring/composition concern. */
export interface PreFilterInputs {
  budget: QuestionnaireAnswers["budget"];
  day: string;
  startTime: string;
  endTime: string;
  neighborhoods: readonly string[];
}

export interface PreFilterArgs {
  venues: Venue[];
  inputs: PreFilterInputs;
  /** Set of venue ids the client asked us to skip. Construction varies
   * per endpoint: /api/generate uses excludeVenueIds from the request
   * body only; /api/swap-stop adds every current stop + plan_b on top;
   * /api/add-stop uses only current stops + plan_b. All three converge
   * here as a single Set. */
  exclude: ReadonlySet<string>;
  /** Authed user's drinks preference. null when no profile signal. */
  drinks: DrinksPref | string | null;
}

/** Build a PreFilterArgs from the canonical inputs every endpoint
 * carries. Extracted so the three route handlers can't drift on field
 * shape — adding a new pre-filter input requires editing this single
 * builder and propagating to all three callers via the type system. */
export function buildPreFilterArgs(opts: {
  venues: Venue[];
  inputs: PreFilterInputs;
  exclude: ReadonlySet<string>;
  drinks: DrinksPref | string | null;
}): PreFilterArgs {
  return {
    venues: opts.venues,
    inputs: {
      budget: opts.inputs.budget,
      day: opts.inputs.day,
      startTime: opts.inputs.startTime,
      endTime: opts.inputs.endTime,
      neighborhoods: opts.inputs.neighborhoods,
    },
    exclude: opts.exclude,
    drinks: opts.drinks,
  };
}

/** Window object the time-blocks helper expects. The inputs we receive
 * already carry startTime+endTime; this keeps the call site terse. */
function windowOf(inputs: PreFilterInputs): TimeWindow {
  return { startTime: inputs.startTime, endTime: inputs.endTime };
}

export function applyPreFilters(args: PreFilterArgs): PreFilterResult {
  const { venues, inputs, exclude, drinks } = args;

  // 1. Exclusions — STRICT. The recently-rejected list reflects the
  // user's explicit "not this one" signal; we never re-rehabilitate an
  // old reject just because the pool is thin.
  let pool = exclude.size > 0
    ? venues.filter((v) => !exclude.has(v.id))
    : venues;
  if (pool.length === 0) return { ok: false, zeroingStage: "exclusions" };

  // 2. Drinks=no — profile-driven cull. Not user-input in the
  // questionnaire sense, but a stable preference the user set in
  // onboarding. Same shape across all three endpoints. The "drinks"
  // ZeroingStage was added 2026-06-11 (post-adversarial-review) so
  // an alcohol-skewed pool that the cull empties points the user at
  // their drinks pref, not at their neighborhood.
  if (drinks === "no") {
    pool = pool.filter(
      (v) => !v.vibe_tags.some((t) => ALCOHOL_VIBE_TAGS.has(t)),
    );
    if (pool.length === 0) return { ok: false, zeroingStage: "drinks" };
  }

  // 3. Hours — strict time-window overlap on the chosen day. Per-day
  // blocks override global time_blocks via the hybrid rule inside
  // venueOpenForWindow.
  const dayColumn: DayColumn = dateToDayColumn(inputs.day);
  pool = pool.filter((v) => venueOpenForWindow(v, dayColumn, windowOf(inputs)));
  if (pool.length === 0) return { ok: false, zeroingStage: "hours" };

  // 4. Closed status — defensive. composer_venues_v2.active=true rows
  // are nominally open, but business_status can flip independently when
  // the Google Places enrichment runs. A user-actionable failure isn't
  // really a closed-business issue — bundle into hours.
  pool = pool.filter(
    (v) =>
      v.business_status !== "CLOSED_PERMANENTLY" &&
      v.business_status !== "CLOSED_TEMPORARILY",
  );
  if (pool.length === 0) return { ok: false, zeroingStage: "hours" };

  // 5. Budget — STRICT tier-set membership. NO upward widening. Casual
  // means tier 1, period; nice_out means tier 1 or 2; splurge means
  // tier 2 or 3. The 06-10 audit identified the silent casual upsell
  // here; this stack is the fix.
  const allowedTiers = BUDGET_TIER_MAP[inputs.budget] ?? [1, 2, 3, 4];
  const tierSet = new Set<number>(allowedTiers);
  pool = pool.filter((v) => tierSet.has(v.price_tier ?? 2));
  if (pool.length === 0) return { ok: false, zeroingStage: "budget" };

  // 6. Neighborhood — STRICT union membership. The questionnaire pools
  // venues across selected groups (per CompositionShell's
  // expandNeighborhoodGroup flatmap); only venues whose slug is in that
  // union qualify. The previous regime relaxed this inside scoring.ts
  // when proximity-restricted candidates ran out for stop 1 — geography
  // is hard now, every stop, every endpoint.
  if (inputs.neighborhoods.length > 0) {
    const nset = new Set<string>(inputs.neighborhoods);
    pool = pool.filter((v) => nset.has(v.neighborhood));
    if (pool.length === 0) return { ok: false, zeroingStage: "neighborhood" };
  }

  return { ok: true, venues: pool };
}
