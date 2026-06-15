/**
 * Itinerary Generation Tuning
 * ============================
 *
 * Single source of truth for every knob, weight, threshold, and penalty
 * that controls how Composer picks and orders venues for an itinerary.
 *
 * To retune the algorithm, change values HERE. Do not sprinkle magic
 * numbers across scoring.ts, composer.ts, etc.
 *
 * Pipeline overview (see ALGORITHM.md for full architecture):
 *
 *   1. INPUT       — POST /api/generate parses request + user profile
 *   2. FILTER      — drops venues that fail hard requirements
 *                    (active, business_status, neighborhood, time block,
 *                    budget tier, drinks=no, recently-seen)
 *   3. SCORE       — ranks remaining candidates per-role using weights
 *                    below; jitter is seeded from request hash for
 *                    reproducibility
 *   4. COMPOSE     — picks N stops by walking through stop_roles in
 *                    order; applies category-diversity penalty as it
 *                    builds the itinerary
 *   5. ENRICH      — fetches Resy availability, weather, walks
 *
 * Total weight envelope: scoring components should roughly sum to 100
 * (currently ~105 at full match). The exact total doesn't matter —
 * relative magnitudes do. A 35-pt vibe weight versus 5-pt budget weight
 * means vibe shifts the ranking 7x more than budget at full magnitude.
 *
 * After changing values:
 *   1. Restart dev server (constants compile into bundle)
 *   2. Generate 3-5 itineraries across diverse inputs
 *   3. Check that picks "feel right" — taste test, not unit test
 *   4. Some interactions are non-obvious; e.g., raising vibe from 35→50
 *      may starve the neighborhood signal
 */
export const ALGORITHM = {
  weights: {
    /**
     * Full vibe match: venue has 2+ tags overlapping the user's vibe.
     *
     * Higher = vibe-matched venues dominate ranking more strongly.
     * Lower = other factors (quality, occasion) compete more evenly.
     *
     * Sane range: 25-45. The highest single scoring component by design —
     * vibe is the core user intent signal.
     */
    vibeMatch2Plus: 35,

    /**
     * Partial vibe match: venue has exactly 1 overlapping tag.
     *
     * Set between vibeMatch0 and vibeMatch2Plus. The gap between 1-tag
     * and 2-tag match determines how aggressively the algorithm prefers
     * strong matches over partial ones.
     */
    vibeMatch1: 25,

    /**
     * No vibe match: venue has zero overlapping tags.
     *
     * Non-zero so that venues can still appear if they score well on
     * other factors. Set to 0 to hard-exclude non-matching vibes.
     *
     * Sane range: 0-15.
     */
    vibeMatch0: 10,

    /**
     * Baseline score for the "mix it up" vibe (empty tag set).
     *
     * "Mix it up" has no tags to match, so every venue gets this flat
     * score. Set equal to vibeMatch1 so mixed-vibe itineraries score
     * comparably to intentional vibe picks.
     */
    vibeMixItUpBaseline: 25,

    /**
     * Bonus when venue's occasion_tags includes the user's occasion.
     *
     * Higher = occasion matters more (dating venues for dating nights).
     * Lower = occasion is decorative; vibe dominates.
     *
     * Sane range: 5-20.
     */
    occasion: 15,

    /**
     * Bonus when venue's price_tier matches the bucket's *primary* tier
     * (see BUDGET_PRIMARY_TIER in src/config/budgets.ts).
     *
     * BUDGET_TIER_MAP is downward-permissive — nice_out admits tier-1
     * venues too at the filter layer. This bonus is what makes a tier-2
     * venue still outrank a widened-in tier-1 venue: +15 vs 0 on this
     * signal alone is roughly half of a full vibe match.
     *
     * no_preference has no primary tier → no bonus awarded → signal
     * cancels for those users (which is what no_preference asks for).
     *
     * Sane range: 10-20. Lower than vibe (35) because budget is also
     * a hard filter upstream — this is the tiebreaker that keeps the
     * bucket's center-of-mass winning.
     *
     * Calibrated 2026-04-27. Semantics widened 2026-05-22 (filter
     * became downward-permissive; bonus narrowed to exact-primary-tier).
     */
    budget: 15,

    /**
     * Bonus when venue is in one of the user's selected neighborhoods.
     *
     * Higher = stronger geographic clustering within picked neighborhoods.
     * Lower = venues from nearby neighborhoods compete more easily after
     * neighborhood relaxation.
     *
     * Sane range: 5-15.
     */
    neighborhood: 10,

    /**
     * Time relevance: how well the venue's schedule fits the user's
     * chosen time block on the chosen day.
     *
     * Computed via blockCoverageFraction() in time-blocks.ts:
     *   1.0 = confirmed open (both global + per-day blocks match)
     *   0.5 = partial (one source matches)
     *   0.0 = no coverage data
     *
     * Higher = strongly prefer venues with confirmed block coverage.
     * Lower = treat all filtered-in venues roughly equally.
     *
     * Sane range: 5-15. Note: venues that don't pass the time block
     * filter are already excluded — this signal differentiates among
     * survivors.
     */
    timeRelevance: 10,

    /**
     * Quality score normalization factor.
     *
     * venue.quality_score is 0-10 (curator-assigned). This weight
     * controls how much that 0-10 range matters relative to other
     * components. Score = (quality_score / 10) * this weight.
     *
     * Sane range: 5-15.
     */
    qualityNormalize: 10,

    /**
     * Multiplier applied to venue.curation_boost.
     *
     * curation_boost is a per-venue integer (typically 0-3) set by
     * curators to promote specific picks. Score = boost * this weight.
     *
     * Sane range: 3-10. Above 10, a boost of 2 (+20pts) would
     * dominate vibe matching.
     *
     * Note: curation_boost is unbounded on the venue side. A venue
     * with boost=10 would get +50pts at this multiplier.
     */
    curationMultiplier: 5,

    /**
     * Score from Google Places rating, normalized so 3.5→0 and 5.0→max.
     *
     * Venues below 3.5 contribute 0 (not negative). Null ratings
     * contribute 0.
     *
     * Higher = Google popularity matters more in ranking.
     * Lower = curator judgment (quality_score) dominates over crowd.
     *
     * Sane range: 0-10. Keep low to avoid biasing toward tourist traps
     * over IYKYK spots.
     *
     * Added 2026-04-27.
     */
    googleRating: 5,
  },

  penalties: {
    /**
     * Score deduction when a candidate venue's category matches a
     * category already used in the itinerary.
     *
     * Higher = more diverse itineraries (less likely to pick 3 wine bars).
     * Lower = more "best venue" picks regardless of repetition.
     *
     * Sane range: 10-30. Above 30, diversity dominates and weak
     * alternatives win. Below 10, duplication often wins on raw score.
     *
     * Calibrated 2026-04-27 at 20 — produces good diversity in dense
     * neighborhoods (West Village evening), acceptable trade-offs in
     * thin pools (outer borough mornings).
     */
    categoryDuplicate: 20,
  },

  pools: {
    // Note: `minPoolSize` and `minBudgetWideningThreshold` were removed
    // 2026-06-11 with the strict-filters change. The exclude-list
    // graceful-trim that consumed minPoolSize and the budget upward
    // widening that consumed minBudgetWideningThreshold both violated
    // the "user inputs are inviolable" principle — exclusions and the
    // user's picked budget tier are now strict. See
    // docs/algorithm-relaxation-audit.md items 1 and 3.

    /**
     * Number of top-scored candidates to consider for weighted random
     * pick. Higher = more variety across regenerations. 1 = deterministic
     * top-1 (old behavior).
     *
     * Sane range: 3-7.
     */
    pickTopN: 5,

    /**
     * Rank-based weights for the weighted random sampler. Index 0 is
     * the highest-scored candidate. Weights are normalized internally;
     * only relative magnitudes matter.
     *
     * [5,4,3,2,1] means #1 is 5x more likely than #5.
     */
    pickWeights: [5, 4, 3, 2, 1] as readonly number[],

    // Note: `minGroupVenuesToRender` (raw venueCount gate, 2026-05-21
    // calibration of 25) was removed 2026-06-11 in favor of the native
    // composability gate in src/config/group-visibility.ts. The new
    // predicate reads itinerariesByTier baked into
    // src/config/generated/neighborhoods.ts and treats a group as
    // visible iff the median of its three per-tier itinerary counts
    // clears GROUP_VISIBILITY.bar.
  },

  composition: {
    /**
     * Default stop count for a fresh itinerary. Phase 2 collapsed the
     * variable-length vibe templates into a flat 2-stop default — stop 1
     * picked from STOP_1_POOL (opener or closer canonical) and stop 2
     * always Main. Tap "+ Add another stop" extends to 3 from STOP_1_POOL
     * excluding stop 1's venue. Used as `requested_stop_count` in the
     * itinerary_generated event (the matching fallback event was
     * removed 2026-06-11 with the single-stop degradation deletion).
     */
    stopDefaultCount: 2,

    /**
     * Default party size used by /api/generate and /api/swap-stop when
     * enriching Resy availability. The client doesn't collect party
     * size yet — when the questionnaire grows that step, the route
     * handlers should prefer the user's pick and only fall back to
     * this constant. Kept here so the literal doesn't get duplicated
     * across route handlers (the same value is also passed into
     * Resy's URL builders downstream).
     */
    defaultPartySize: 2,

    /**
     * Average duration per role (minutes), used by planStopMix() to
     * decide how many stops fit in the user's time window.
     *
     * These are planning estimates, not per-venue actuals. The API
     * route uses venue.duration_hours (when available) for the
     * end-time buffer check after composition.
     */
    roleDurationMin: {
      opener: 60,
      main: 120,
      closer: 60,
    } as Record<string, number>,

    /**
     * Estimated walk time between adjacent stops (minutes).
     *
     * Used by planStopMix() to budget time for walks. The actual walk
     * times are computed post-composition from venue coordinates.
     *
     * Sane range: 5-15.
     */
    avgWalkBetweenStopsMin: 10,

    /**
     * Tolerance on the "does this template fit the window" check.
     *
     * Without slack, a 4h04m window would reject a 3-stop plan that
     * budgets 4h05m, leaving dead time. Slack allows slightly over-budget
     * templates.
     *
     * Sane range: 10-20.
     */
    budgetSlackMin: 15,

    // Note: `lastStartBufferMin` was removed 2026-06-11. The buffer
    // truncation in /api/generate that consumed it was the other
    // silent shape-change path (trailing stop dropped when timeline
    // overflowed) — deleted alongside the single-stop fallback in
    // composer.ts. If a future timeline-fits-window check is
    // re-introduced, it should fail honestly via ComposeFailure, not
    // truncate the itinerary in place.
  },

  distance: {
    /**
     * Max walking distance from the Main anchor (km), normal weather.
     * Approximately 20 minutes at 4.8 km/h walking speed.
     *
     * All non-Main stops must be within this radius. Never relaxed.
     *
     * Sane range: 1.0-2.5.
     */
    maxWalkKmNormal: 1.5,

    /**
     * Max walking distance from the Main anchor (km), bad weather.
     * Approximately 5 minutes — keeps the user from getting drenched.
     *
     * Sane range: 0.2-0.8.
     */
    maxWalkKmBadWeather: 0.4,

    /**
     * Soft cap for the "this plan has a long walk" UX warning (minutes).
     * Does NOT affect venue selection — purely informational.
     */
    walkSoftCapMin: 15,

    /** Soft cap in bad weather (minutes). */
    walkSoftCapMinBadWeather: 5,
  },

  jitter: {
    /**
     * Random jitter range added to each venue's score.
     *
     * Jitter is seeded from a hash of the request inputs (see
     * src/lib/itinerary/seed.ts), so identical requests produce
     * identical jitter and identical results. Different excludeVenueIds
     * produce different seeds, enabling variety on "regenerate."
     *
     * Higher = more shuffling between closely-scored venues.
     * Lower = more deterministic (top-scorer always wins).
     *
     * Sane range: 5-20. At 10, two venues within 10pts of each other
     * can swap positions. Above 20, jitter begins to compete with
     * mid-weight scoring components.
     */
    magnitude: 10,
  },
} as const;

export type Algorithm = typeof ALGORITHM;
