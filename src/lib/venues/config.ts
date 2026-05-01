// Tunable knobs for the venue importer.
//
// All magic numbers and the sheet tab/range strings live here so the rest
// of the module reads from a single source of truth. Document each value
// with the rationale — a future operator changing a number should know
// what it costs them.

/**
 * The tab within the spreadsheet that holds venue rows. Renaming this tab
 * in the spreadsheet without updating this constant will break every read.
 *
 * Renaming the spreadsheet *file* is safe — the spreadsheet is identified
 * by ID via the `GOOGLE_SHEET_ID` env var, not by title.
 */
export const VENUE_SHEET_TAB = "NYC Venues";

/**
 * Header row range within VENUE_SHEET_TAB. Headers are read from row 2
 * (row 1 is section dividers in the curator's working layout).
 *
 * CD = column 82, a defensive buffer for future sheet columns. The
 * transform module ignores headers it doesn't recognize, so over-reading
 * is free; under-reading silently drops fields.
 */
export const VENUE_SHEET_HEADER_RANGE = "A2:CD2";

/** Data range within VENUE_SHEET_TAB. Row 3+ is venue data. */
export const VENUE_SHEET_DATA_RANGE = "A3:CD";

/**
 * Layer 2 sanity assertions — applied before any apply. Designed to catch
 * "wrong sheet pointed at" / "filtered view exported" / "stale archive
 * sheet" scenarios that look like a normal import at a glance.
 */
export const SANITY_THRESHOLDS = {
  /**
   * Sheet row count vs DB active row count must be within this band.
   * Catches "wrong sheet" (e.g., 50-row test sheet against 1300-row DB)
   * and "filtered view" (active filter accidentally applied in sheet).
   */
  rowCountDeltaPercent: 0.20,

  /**
   * Fraction of sheet rows that must have lat AND lng. Sheets without
   * coords are not venue sheets — every venue needs a map pin.
   */
  minLatLngCoverage: 0.90,

  /**
   * Fraction of sheet rows whose neighborhood is in the canonical set
   * (`ALL_NEIGHBORHOODS` from src/config/generated/neighborhoods.ts).
   * London-restaurants would have failed this check.
   */
  minCanonicalNeighborhoodCoverage: 0.95,

  /**
   * If Drive API returns modifiedTime, sheet must have been edited within
   * this window. A stale archive sheet is probably not the live sheet.
   * Skipped silently if Drive API unavailable.
   */
  maxStaleDays: 90,
} as const;

/**
 * Apply-time guardrails on diff size. If any threshold is exceeded the
 * apply requires `--confirm-large-change`. For each pair (absolute +
 * fraction-of-active) the larger bound wins so a small DB doesn't lock
 * out routine multi-venue imports.
 *
 * Two pairs:
 *   1. Total changes (add + modify + deactivate) — broad sanity ceiling.
 *   2. Deactivations alone — tighter, because mass deactivation is the
 *      most user-visible destructive outcome (venues vanish from
 *      itineraries). 25 deactivations in a 1300-venue DB is well under
 *      the total ceiling but should still pause for explicit confirmation.
 */
export const CHANGE_THRESHOLDS = {
  /** Hard cap on add+modify+deactivate count regardless of DB size. */
  maxChangesAbsolute: 100,
  /** Cap on add+modify+deactivate as a fraction of currently active rows. */
  maxChangesFraction: 0.10,

  /** Hard cap on deactivations alone, regardless of DB size. */
  maxDeactivationsAbsolute: 10,
  /** Cap on deactivations as a fraction of currently active rows. */
  maxDeactivationsFraction: 0.02,
} as const;
