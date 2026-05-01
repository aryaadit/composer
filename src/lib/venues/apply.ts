// Apply orchestrator for the venue importer (Phase 2).
//
// Builds the SQL fragments and JSON payload for composer_apply_venue_import,
// enforces the large-change guard, and short-circuits on empty diffs.
//
// All SQL fragments come from the typed constants in columns.ts; nothing
// from the sheet or user input is ever interpolated. See the security
// note in 20260501_composer_apply_venue_import_function.sql.

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  ALL_WRITABLE_COLUMNS,
  COALESCE_COLUMNS,
  pgType,
} from "./columns";
import { CHANGE_THRESHOLDS } from "./config";
import type {
  ApplyResult,
  ImportDiff,
  VenueCellValue,
  VenueRecord,
} from "./types";

/**
 * Thrown when the diff exceeds the operator-confirmation threshold and the
 * caller did not pass `confirmLargeChange: true`. Carries enough context
 * for the CLI to print a useful message.
 */
export class LargeChangeError extends Error {
  constructor(
    public readonly totalChanges: number,
    public readonly threshold: number,
    public readonly dbActiveCount: number
  ) {
    super(
      `Diff exceeds threshold: ${totalChanges} changes (max ${threshold} = max(${CHANGE_THRESHOLDS.maxChangesAbsolute}, ${(CHANGE_THRESHOLDS.maxChangesFraction * 100).toFixed(0)}% of ${dbActiveCount} active))`
    );
    this.name = "LargeChangeError";
  }
}

interface SqlFragments {
  columns: string;
  selectList: string;
  recordsetTypedef: string;
  setClause: string;
}

/**
 * Build the four SQL fragments passed to composer_apply_venue_import.
 * Pure function over typed column constants — no row data involved, so
 * the result is identical for every apply (same schema → same fragments).
 */
function buildSqlFragments(): SqlFragments {
  const cols = Array.from(ALL_WRITABLE_COLUMNS);
  const columns = cols.join(", ");
  const selectList = cols.join(", ");
  const recordsetTypedef = cols.map((c) => `${c} ${pgType(c)}`).join(", ");
  // venue_id is the conflict key — never SET it on update.
  const setClause = cols
    .filter((c) => c !== "venue_id")
    .map((c) =>
      COALESCE_COLUMNS.has(c)
        ? `${c} = COALESCE(EXCLUDED.${c}, composer_venues_v2.${c})`
        : `${c} = EXCLUDED.${c}`
    )
    .join(", ");
  return { columns, selectList, recordsetTypedef, setClause };
}

/**
 * Convert a VenueRecord into the JSON shape that jsonb_to_recordset wants.
 * Drops PROTECTED columns by virtue of iterating ALL_WRITABLE_COLUMNS;
 * preserves COALESCE column omissions (so the function-level COALESCE can
 * fall through to the existing DB value).
 */
function recordToPayload(rec: VenueRecord): Record<string, VenueCellValue> {
  const out: Record<string, VenueCellValue> = {};
  for (const c of ALL_WRITABLE_COLUMNS) {
    if (COALESCE_COLUMNS.has(c) && !(c in rec)) continue;
    // Pass nulls through explicitly — JSON null becomes SQL NULL via
    // jsonb_to_recordset, which is the intended behavior for SHEET_OWNED
    // columns the operator left blank.
    out[c] = rec[c] ?? null;
  }
  return out;
}

/**
 * Compute the effective large-change threshold. Both bounds are checked;
 * the larger wins so a small DB doesn't get locked out of routine
 * multi-venue imports.
 */
export function largeChangeThreshold(dbActiveCount: number): number {
  const fractional = Math.ceil(
    dbActiveCount * CHANGE_THRESHOLDS.maxChangesFraction
  );
  return Math.max(CHANGE_THRESHOLDS.maxChangesAbsolute, fractional);
}

/**
 * Apply the diff to composer_venues_v2 atomically via the Postgres
 * function. The caller is responsible for filtering `recordsToWrite`
 * down to add+modify rows — this function does not re-derive that from
 * `diff` because the diff carries field-level deltas, not full records.
 *
 * The diff is still passed so the large-change guard can compare counts
 * against the configured threshold.
 *
 * @throws LargeChangeError when diff size exceeds threshold and
 *         `confirmLargeChange` is not set. The CLI catches this to print
 *         a structured message; programmatic callers can surface it
 *         however they want.
 */
export async function runApply(
  supabase: SupabaseClient,
  diff: ImportDiff,
  recordsToWrite: VenueRecord[],
  dbActiveCount: number,
  options: { confirmLargeChange?: boolean } = {}
): Promise<ApplyResult> {
  const totalChanges = diff.add.length + diff.modify.length;
  const threshold = largeChangeThreshold(dbActiveCount);

  if (totalChanges > threshold && !options.confirmLargeChange) {
    throw new LargeChangeError(totalChanges, threshold, dbActiveCount);
  }

  if (totalChanges === 0) {
    return { inserted: 0, updated: 0, total: 0, durationMs: 0 };
  }

  return executeApply(supabase, recordsToWrite);
}

async function executeApply(
  supabase: SupabaseClient,
  recordsToWrite: VenueRecord[]
): Promise<ApplyResult> {
  const fragments = buildSqlFragments();
  const payload = recordsToWrite.map(recordToPayload);

  const start = Date.now();
  const { data, error } = await supabase.rpc("composer_apply_venue_import", {
    p_columns: fragments.columns,
    p_set_clause: fragments.setClause,
    p_select_list: fragments.selectList,
    p_recordset_typedef: fragments.recordsetTypedef,
    p_rows: payload,
  });
  const durationMs = Date.now() - start;

  if (error) {
    throw new Error(`composer_apply_venue_import failed: ${error.message}`);
  }
  if (!data || typeof data !== "object") {
    throw new Error(
      `composer_apply_venue_import returned unexpected payload: ${JSON.stringify(data)}`
    );
  }

  const result = data as { inserted?: number; updated?: number; total?: number };
  return {
    inserted: result.inserted ?? 0,
    updated: result.updated ?? 0,
    total: result.total ?? 0,
    durationMs,
  };
}
