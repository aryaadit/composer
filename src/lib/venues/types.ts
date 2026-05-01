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

// ─── Audit trail (Phase 4) ─────────────────────────────────────────────

export type ImportRunStatus = "success" | "failed" | "aborted";

/** Why an `aborted` run was aborted. NULL on `success` and `failed`. */
export type ImportRunAbortReason = "assertions" | "threshold";

/**
 * Compact shape of one entry in `diff_payload.modify`. `before` and
 * `after` carry only the changed fields, not the full row — enough to
 * power a future undo without bloating the audit table.
 */
export interface DiffPayloadModification {
  venue_id: string;
  before: Record<string, VenueCellValue>;
  after: Record<string, VenueCellValue>;
}

/**
 * Shape of `composer_import_runs.diff_payload`. Built by `audit.ts` from
 * an `ImportDiff` at the point the run is recorded.
 */
export interface DiffPayload {
  add: string[];
  modify: DiffPayloadModification[];
  deactivate: string[];
}

/**
 * One row of `composer_import_runs`, post-hydration. Returned by `getRun()`.
 */
export interface ImportRun {
  id: string;
  startedAt: Date;
  finishedAt: Date | null;
  durationMs: number | null;
  status: ImportRunStatus;
  abortReason: ImportRunAbortReason | null;
  errorMessage: string | null;
  sheetId: string;
  sheetTitle: string | null;
  sheetModifiedTime: Date | null;
  triggeredBy: string;
  triggerSource: string | null;
  addedCount: number;
  modifiedCount: number;
  deactivatedCount: number;
  unchangedCount: number;
  skippedCount: number;
  diffPayload: DiffPayload | null;
  assertions: AssertionResult[] | null;
}

/**
 * Compact shape used by the `history` CLI subcommand. Strips the heavy
 * `diff_payload` and `assertions` fields so listing 100 rows isn't a
 * megabyte of JSON.
 */
export interface ImportRunSummary {
  id: string;
  startedAt: Date;
  status: ImportRunStatus;
  abortReason: ImportRunAbortReason | null;
  errorMessage: string | null;
  added: number;
  modified: number;
  deactivated: number;
  durationMs: number | null;
  sheetTitle: string | null;
}
