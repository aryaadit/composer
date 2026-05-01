// Apply orchestrator for the venue importer (Phase 3).
//
// Builds the SQL fragments and JSON payload for composer_apply_venue_import,
// enforces both the total-changes and deactivation-only large-change
// guards, and short-circuits when the diff is empty across all buckets.
//
// All SQL fragments come from the typed constants in columns.ts; nothing
// from the sheet or user input is ever interpolated. See the security
// note in 20260502_composer_apply_venue_import_with_deactivation.sql.

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
 * Why a particular apply tripped the large-change guard. The CLI uses
 * `kind` to render a tailored message; programmatic callers can branch
 * on it for differentiated retry policies.
 */
export type LargeChangeReason =
  | { kind: "total"; count: number; threshold: number; dbActiveCount: number }
  | { kind: "deactivations"; count: number; threshold: number; dbActiveCount: number };

/**
 * Thrown when the diff exceeds either the total-changes ceiling or the
 * deactivations-only ceiling, and the caller did not pass
 * `confirmLargeChange: true`. Both reasons may appear; the CLI joins
 * them into a single message.
 */
export class LargeChangeError extends Error {
  constructor(public readonly reasons: LargeChangeReason[]) {
    super(LargeChangeError.formatMessage(reasons));
    this.name = "LargeChangeError";
  }

  static formatMessage(reasons: LargeChangeReason[]): string {
    if (reasons.length === 1) {
      const r = reasons[0];
      if (r.kind === "deactivations") {
        return `Deactivations exceed threshold: ${r.count} (max ${r.threshold} = max(${CHANGE_THRESHOLDS.maxDeactivationsAbsolute}, ${(CHANGE_THRESHOLDS.maxDeactivationsFraction * 100).toFixed(0)}% of ${r.dbActiveCount} active))`;
      }
      return `Total changes exceed threshold: ${r.count} (max ${r.threshold} = max(${CHANGE_THRESHOLDS.maxChangesAbsolute}, ${(CHANGE_THRESHOLDS.maxChangesFraction * 100).toFixed(0)}% of ${r.dbActiveCount} active))`;
    }
    const lines = ["Diff exceeds change thresholds:"];
    for (const r of reasons) {
      if (r.kind === "deactivations") {
        lines.push(
          `  - Deactivations: ${r.count} (max ${r.threshold} = ${(CHANGE_THRESHOLDS.maxDeactivationsFraction * 100).toFixed(0)}% of ${r.dbActiveCount} active)`
        );
      } else {
        lines.push(
          `  - Total changes: ${r.count} (max ${r.threshold} = ${(CHANGE_THRESHOLDS.maxChangesFraction * 100).toFixed(0)}% of ${r.dbActiveCount} active)`
        );
      }
    }
    return lines.join("\n");
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

/** Effective threshold for the total-changes guard (add+modify+deactivate). */
export function totalChangeThreshold(dbActiveCount: number): number {
  const fractional = Math.ceil(
    dbActiveCount * CHANGE_THRESHOLDS.maxChangesFraction
  );
  return Math.max(CHANGE_THRESHOLDS.maxChangesAbsolute, fractional);
}

/** Effective threshold for the deactivations-only guard. */
export function deactivationThreshold(dbActiveCount: number): number {
  const fractional = Math.ceil(
    dbActiveCount * CHANGE_THRESHOLDS.maxDeactivationsFraction
  );
  return Math.max(CHANGE_THRESHOLDS.maxDeactivationsAbsolute, fractional);
}

/**
 * Walk both threshold rules and return the reasons that tripped. Empty
 * array means everything fits under the ceilings.
 */
export function evaluateLargeChange(
  diff: ImportDiff,
  dbActiveCount: number
): LargeChangeReason[] {
  const totalCount = diff.add.length + diff.modify.length + diff.deactivate.length;
  const totalLimit = totalChangeThreshold(dbActiveCount);
  const deactCount = diff.deactivate.length;
  const deactLimit = deactivationThreshold(dbActiveCount);

  const reasons: LargeChangeReason[] = [];
  if (totalCount > totalLimit) {
    reasons.push({ kind: "total", count: totalCount, threshold: totalLimit, dbActiveCount });
  }
  if (deactCount > deactLimit) {
    reasons.push({ kind: "deactivations", count: deactCount, threshold: deactLimit, dbActiveCount });
  }
  return reasons;
}

/**
 * Apply the diff to composer_venues_v2 atomically via the Postgres
 * function. The caller is responsible for filtering `recordsToWrite`
 * down to add+modify rows — this function does not re-derive that from
 * `diff` because the diff carries field-level deltas, not full records.
 *
 * Deactivations are taken straight from `diff.deactivate` (just venue_ids,
 * no record content needed).
 *
 * @throws LargeChangeError when either threshold trips and
 *         `confirmLargeChange` is not set.
 */
export async function runApply(
  supabase: SupabaseClient,
  diff: ImportDiff,
  recordsToWrite: VenueRecord[],
  dbActiveCount: number,
  options: { confirmLargeChange?: boolean } = {}
): Promise<ApplyResult> {
  const totalChanges =
    diff.add.length + diff.modify.length + diff.deactivate.length;

  if (!options.confirmLargeChange) {
    const reasons = evaluateLargeChange(diff, dbActiveCount);
    if (reasons.length > 0) {
      throw new LargeChangeError(reasons);
    }
  }

  if (totalChanges === 0) {
    return { inserted: 0, updated: 0, deactivated: 0, total: 0, durationMs: 0 };
  }

  const deactivateIds = diff.deactivate.map((d) => d.venue_id);
  return executeApply(supabase, recordsToWrite, deactivateIds);
}

async function executeApply(
  supabase: SupabaseClient,
  recordsToWrite: VenueRecord[],
  deactivateIds: string[]
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
    p_deactivate_ids: deactivateIds,
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

  const result = data as {
    inserted?: number;
    updated?: number;
    deactivated?: number;
    total?: number;
  };
  return {
    inserted: result.inserted ?? 0,
    updated: result.updated ?? 0,
    deactivated: result.deactivated ?? 0,
    total: result.total ?? 0,
    durationMs,
  };
}
