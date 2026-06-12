// Tunable constants for the surprise-me ("Lucky") compose entry. Lucky
// re-uses /api/generate unchanged — only the inputs are random — so
// these constants govern the UX, not the algorithm.

export const LUCKY = {
  /** Hard cap on rerolls. Initial roll + (this - 1) silent rerolls on
   *  422. After the cap, the overlay exits into the failure block. Each
   *  attempt is a full /api/generate cycle (Gemini + Mapbox spend) so
   *  the cap deliberately stays small. */
  maxAttempts: 3,
  /** Minimum wall-clock the overlay stays visible before resolving.
   *  Without this floor, fast responses (sub-300ms) would flash and
   *  feel like nothing happened — the dice barely register. 1.5s
   *  reads as a roll. */
  minOverlayMs: 1500,
  /** Debounce between consecutive lucky taps. Each attempt is real
   *  spend; we don't want a double-tap or rage-roll to multiply cost. */
  debounceMs: 2000,
  /** Same-day cutoff buffer. The earliest eligible start_time pill
   *  must be >= now + this many minutes; smaller and start_time
   *  collides with the user actually getting somewhere, larger and the
   *  button disables too early in the evening. */
  cutoffBufferMin: 30,
} as const;
