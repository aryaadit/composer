// Semantic diff between transformed sheet records and current DB rows.
//
// Compares only ALL_WRITABLE_COLUMNS — PROTECTED columns (image_keys, id,
// created_at, updated_at) are never compared because the importer never
// writes them. For COALESCE columns, an empty sheet value matching a
// non-empty DB value is NOT a modification (apply preserves, doesn't
// overwrite).
//
// Values are normalized before comparison to absorb harmless representation
// differences:
//   - Arrays compared as sets (order-insensitive). The schema is TEXT[] and
//     order has never been a load-bearing signal anywhere in the app.
//   - Date / timestamp columns reduced to YYYY-MM-DD on both sides.
//   - null / undefined / "" treated as the same empty value.

import {
  ALL_WRITABLE_COLUMNS,
  ARRAY_COLUMNS,
  COALESCE_COLUMNS,
  DATE_COLUMNS,
  FLOAT_COLUMNS,
  columnKind,
} from "./columns";
import type {
  FieldChange,
  ImportDiff,
  ModifiedVenue,
  SkippedRow,
  VenueCellValue,
  VenueRecord,
} from "./types";

// last_updated is TIMESTAMPTZ in the schema but the importer (CLI today,
// this module tomorrow) only ever writes a date — so the DB value is
// always midnight UTC of that date. Treat it like a date for diff purposes.
const TIMESTAMP_AS_DATE_COLUMNS: ReadonlySet<string> = new Set(["last_updated"]);

function isEmpty(v: VenueCellValue | undefined): boolean {
  if (v == null) return true;
  if (Array.isArray(v) && v.length === 0) return true;
  if (typeof v === "string" && v.trim().length === 0) return true;
  return false;
}

function normalizeDate(v: VenueCellValue | undefined): string | null {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "string") {
    const trimmed = v.trim();
    if (trimmed.length === 0) return null;
    // Accept "2026-04-30", "2026-04-30T00:00:00+00:00", etc.
    const m = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
    // Last resort: parse as Date.
    const d = new Date(trimmed);
    return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : null;
  }
  if (typeof v === "number") {
    const d = new Date(v);
    return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : null;
  }
  return null;
}

function normalizeArray(v: VenueCellValue | undefined): string[] {
  if (v == null) return [];
  if (Array.isArray(v)) return v.map((x) => String(x));
  if (typeof v === "string") {
    if (v.trim().length === 0) return [];
    return v
      .replace(/\|/g, ",")
      .split(",")
      .map((x) => x.trim())
      .filter((x) => x.length > 0);
  }
  return [];
}

function normalizeNumber(v: VenueCellValue | undefined): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof v === "boolean") return v ? 1 : 0;
  return null;
}

function normalizeBool(v: VenueCellValue | undefined): boolean | null {
  if (v == null || v === "") return null;
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const t = v.trim().toLowerCase();
    if (t === "true" || t === "yes" || t === "y" || t === "1") return true;
    if (t === "false" || t === "no" || t === "n" || t === "0") return false;
    return null;
  }
  if (typeof v === "number") return v !== 0;
  return null;
}

function normalizeString(v: VenueCellValue | undefined): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length === 0 ? null : s;
}

interface ScalarCompare {
  equal: boolean;
  before: VenueCellValue;
  after: VenueCellValue;
}

interface ArrayCompare {
  equal: boolean;
  before: string[];
  after: string[];
  added: string[];
  removed: string[];
}

function compareScalars(
  col: string,
  dbVal: VenueCellValue | undefined,
  sheetVal: VenueCellValue | undefined
): ScalarCompare {
  // Both empty → no change. This catches null vs "" vs undefined collisions.
  if (isEmpty(dbVal) && isEmpty(sheetVal)) {
    return { equal: true, before: dbVal ?? null, after: sheetVal ?? null };
  }

  const kind = columnKind(col);
  const isDate = DATE_COLUMNS.has(col) || TIMESTAMP_AS_DATE_COLUMNS.has(col);

  if (isDate) {
    const a = normalizeDate(dbVal);
    const b = normalizeDate(sheetVal);
    return { equal: a === b, before: a, after: b };
  }
  if (kind === "bool") {
    const a = normalizeBool(dbVal);
    const b = normalizeBool(sheetVal);
    return { equal: a === b, before: a, after: b };
  }
  if (kind === "int" || kind === "float") {
    const a = normalizeNumber(dbVal);
    const b = normalizeNumber(sheetVal);
    if (a === null && b === null) return { equal: true, before: a, after: b };
    if (a === null || b === null) return { equal: false, before: a, after: b };
    if (FLOAT_COLUMNS.has(col)) {
      // 6 decimal places ≈ 11cm at the equator — well below curator precision.
      return { equal: Math.abs(a - b) < 1e-6, before: a, after: b };
    }
    return { equal: a === b, before: a, after: b };
  }
  // string
  const a = normalizeString(dbVal);
  const b = normalizeString(sheetVal);
  return { equal: a === b, before: a, after: b };
}

function compareArrays(
  dbVal: VenueCellValue | undefined,
  sheetVal: VenueCellValue | undefined
): ArrayCompare {
  const before = normalizeArray(dbVal);
  const after = normalizeArray(sheetVal);
  const beforeSet = new Set(before);
  const afterSet = new Set(after);
  const added = after.filter((x) => !beforeSet.has(x));
  const removed = before.filter((x) => !afterSet.has(x));
  return {
    equal: added.length === 0 && removed.length === 0,
    before,
    after,
    added,
    removed,
  };
}

function diffOneVenue(
  db: Record<string, VenueCellValue>,
  sheet: VenueRecord
): FieldChange[] {
  const changes: FieldChange[] = [];

  for (const col of ALL_WRITABLE_COLUMNS) {
    // COALESCE rule: if the sheet omitted the key (transform left it out
    // because the cell was empty) AND the DB has a value, the apply path
    // would preserve the DB value — so this is not a modification.
    if (COALESCE_COLUMNS.has(col) && !(col in sheet)) continue;

    const dbVal = db[col];
    const sheetVal = sheet[col];

    if (ARRAY_COLUMNS.has(col)) {
      const cmp = compareArrays(dbVal, sheetVal);
      if (!cmp.equal) {
        changes.push({
          field: col,
          before: cmp.before,
          after: cmp.after,
          added: cmp.added,
          removed: cmp.removed,
        });
      }
    } else {
      const cmp = compareScalars(col, dbVal, sheetVal);
      if (!cmp.equal) {
        changes.push({ field: col, before: cmp.before, after: cmp.after });
      }
    }
  }

  return changes;
}

/**
 * Compute the diff between transformed sheet records and current DB rows.
 *
 * Match key: `venue_id`. Phase 1 does NOT compute deactivation candidates
 * (rows in DB but missing from sheet) — that lives with the deactivation
 * logic in Phase 3.
 *
 * @param sheetRecords  Output of transformRows() — already-validated records.
 * @param dbVenues      Current DB rows (must include venue_id and any column
 *                      we might compare; the import.ts caller selects all
 *                      writable columns).
 * @param skipped       Validation failures from transformRows(), passed
 *                      through into the diff so the caller can surface them
 *                      together.
 */
export function computeDiff(
  sheetRecords: VenueRecord[],
  dbVenues: Record<string, VenueCellValue>[],
  skipped: SkippedRow[] = []
): ImportDiff {
  const dbByVenueId = new Map<string, Record<string, VenueCellValue>>();
  for (const v of dbVenues) {
    const vid = v.venue_id;
    if (typeof vid === "string" && vid.length > 0) {
      dbByVenueId.set(vid, v);
    }
  }

  const add: VenueRecord[] = [];
  const modify: ModifiedVenue[] = [];
  let unchanged = 0;

  for (const rec of sheetRecords) {
    const venue_id = rec.venue_id as string;
    const dbRow = dbByVenueId.get(venue_id);
    if (!dbRow) {
      add.push(rec);
      continue;
    }
    const changes = diffOneVenue(dbRow, rec);
    if (changes.length === 0) {
      unchanged++;
    } else {
      modify.push({
        venue_id,
        name: (rec.name as string) ?? (dbRow.name as string) ?? venue_id,
        changedFields: changes,
      });
    }
  }

  return { add, modify, unchanged, skipped };
}
