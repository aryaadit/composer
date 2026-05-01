// Shared types for the venue import module (src/lib/venues/*).

/**
 * Cell value as it appears in a transformed venue record. Matches the
 * Postgres column type for the corresponding v2 schema column. Arrays are
 * always non-null `string[]`. Scalars are nullable when the schema allows it
 * or when the sheet supplies an empty cell.
 */
export type VenueCellValue =
  | string
  | number
  | boolean
  | null
  | string[];

/**
 * One transformed sheet row, ready for upsert. Keys are v2 column names.
 * Only includes writable columns (PROTECTED columns like image_keys never
 * appear here).
 */
export type VenueRecord = Record<string, VenueCellValue>;

/**
 * Reason a sheet row failed validation and was excluded from the import.
 * Used in dry-run output and (Phase 4) the audit log.
 */
export interface SkippedRow {
  /** 1-based row number in the sheet (matches what the curator sees). */
  row: number;
  venue_id?: string;
  name?: string;
  reason: string;
}

/**
 * Single field-level change inside a modified venue.
 *
 * For arrays: `added` and `removed` list element-level deltas.
 * For scalars: `before` and `after` carry the raw values.
 */
export interface FieldChange {
  field: string;
  before: VenueCellValue;
  after: VenueCellValue;
  added?: string[];
  removed?: string[];
}

export interface ModifiedVenue {
  venue_id: string;
  name: string;
  changedFields: FieldChange[];
}

/**
 * One DB row that's currently active but missing from the sheet. The
 * apply path soft-deletes these by setting `active = false`. We carry
 * `name` so dry-run output is human-readable without re-querying.
 */
export interface DeactivatedVenue {
  venue_id: string;
  name: string;
}

/**
 * Output of computeDiff(). The shape is deliberately wide so dry-run
 * output, JSON export, and the apply path can all read from the same
 * structure.
 */
export interface ImportDiff {
  add: VenueRecord[];
  modify: ModifiedVenue[];
  /**
   * Active DB rows whose venue_id is not in the sheet. Apply will set
   * `active = false` (soft delete). Already-inactive rows are excluded.
   */
  deactivate: DeactivatedVenue[];
  unchanged: number;
  skipped: SkippedRow[];
}

/**
 * Identity of the sheet being imported. Surfaced at the top of every
 * dry-run as the operator's confirmation that they're pointing at the
 * right sheet (Layer 1 safety).
 *
 * `modifiedTime` and `modifiedBy` come from the Drive API; both are
 * optional because the Drive API may not be enabled on the service
 * account's project.
 */
export interface SheetMetadata {
  spreadsheetId: string;
  title: string;
  modifiedTime?: string;
  modifiedBy?: string;
  rowCount: number;
  /** First 5 distinct neighborhoods, alphabetized. Smell test for the diff. */
  sampleNeighborhoods: string[];
}

/**
 * One sanity assertion outcome. `detail` is shown to the operator
 * regardless of pass/fail so they can read the actual measurement.
 *
 * Severity:
 *   - `block` — failure prevents apply (override only with --skip-assertions)
 *   - `warn`  — failure is printed but apply proceeds
 */
export interface AssertionResult {
  name: string;
  passed: boolean;
  detail: string;
  severity: "block" | "warn";
}

/**
 * Aggregate output of `runAssertions()`. `blocked` is true if any
 * `block`-severity assertion failed.
 */
export interface AssertionReport {
  results: AssertionResult[];
  blocked: boolean;
}

/**
 * Counts returned by `composer_apply_venue_import` plus the orchestrator's
 * wall-clock timing.
 *
 * `total` is the upsert payload size = inserted + updated. `deactivated`
 * is reported separately because deactivation runs as a distinct UPDATE
 * inside the same transaction.
 */
export interface ApplyResult {
  inserted: number;
  updated: number;
  deactivated: number;
  total: number;
  durationMs: number;
}
