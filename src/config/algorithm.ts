/**
 * Single source of truth for itinerary generation tuning.
 *
 * Every knob, weight, threshold, and penalty that controls scoring or
 * composition lives here. Tweak values here to retune the algorithm —
 * don't sprinkle magic numbers across scoring.ts, composer.ts, etc.
 *
 * Categories:
 *   weights        — scoring component magnitudes (roughly sum to 100)
 *   penalties      — score deductions for diversity / repetition
 *   pools          — pool-size thresholds for widening / relaxation
 *   composition    — itinerary structure rules (durations, slack, walk estimates)
 *   distance       — walking distance limits (hard caps in km)
 *   jitter         — randomness magnitude
 *
 * NOTE: After changing values here, regenerate a few test itineraries
 * across diverse inputs to verify behavior. Some interactions are
 * non-obvious (e.g., raising vibe weight from 35→50 may starve the
 * neighborhood signal).
 */
export const ALGORITHM = {
  /** Scoring component weights. Should roughly sum to 100. */
  weights: {
    vibeMatch2Plus: 35,
    vibeMatch1: 25,
    vibeMatch0: 10,
    vibeMixItUpBaseline: 25,
    occasion: 15,
    budget: 15,
    neighborhood: 10,
    timeRelevance: 10,
    qualityNormalize: 10,
    curationMultiplier: 5,
  },

  /** Score deductions to encourage diversity. */
  penalties: {
    categoryDuplicate: 20,
  },

  /** Pool-size thresholds. */
  pools: {
    /** Below this, exclude-list is ignored to avoid empty itineraries. */
    minPoolSize: 4,
    /** Below this after budget hard filter, widen by one tier. */
    minBudgetWideningThreshold: 30,
  },

  /** Itinerary structure. */
  composition: {
    /** Average duration per role (minutes), used for stop-count planning. */
    roleDurationMin: {
      opener: 60,
      main: 120,
      closer: 60,
    } as Record<string, number>,
    /** Estimated walk time between adjacent stops (minutes). */
    avgWalkBetweenStopsMin: 10,
    /** Tolerance on template-fit check (minutes). */
    budgetSlackMin: 15,
    /** Don't start a new stop within this many minutes of endTime. */
    lastStartBufferMin: 30,
  },

  /** Walking distance constraints (km). */
  distance: {
    /** Max walk distance from anchor (normal weather), ~20 min. */
    maxWalkKmNormal: 1.5,
    /** Max walk distance from anchor (bad weather), ~5 min. */
    maxWalkKmBadWeather: 0.4,
    /** Soft cap for UX warning ("this plan has a long walk"), minutes. */
    walkSoftCapMin: 15,
    /** Soft cap in bad weather, minutes. */
    walkSoftCapMinBadWeather: 5,
  },

  /** Jitter magnitude for scoring randomness. */
  jitter: {
    /** Default jitter range: score += random(0, magnitude). */
    magnitude: 10,
  },
} as const;

export type Algorithm = typeof ALGORITHM;
