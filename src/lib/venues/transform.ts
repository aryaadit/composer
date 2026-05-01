// Transform raw sheet rows into typed VenueRecord objects ready for upsert.
//
// All branching on column type goes through src/lib/venues/columns.ts —
// this module owns the cell-level coercion (string → bool/int/float/array/
// date) and the row-level validation rules.
//
// Resolved CLI/route divergences are documented inline at each decision
// point. The corresponding spec table:
//
//   ┌─────────────────────────┬──────────────────────────────────────────┐
//   │ field                   │ behavior                                 │
//   ├─────────────────────────┼──────────────────────────────────────────┤
//   │ venue_id / name empty   │ skip row                                 │
//   │ active empty/garbage    │ skip row (no silent default)             │
//   │ latitude / longitude    │ skip row if either missing               │
//   │ neighborhood empty      │ skip row (no "unknown" pseudo-slug)      │
//   │ quality_score empty     │ NULL                                     │
//   │ curation_boost empty    │ 0                                        │
//   │ curated_by              │ lowercase + trim                         │
//   │ COALESCE columns empty  │ omit from record (preserve DB value)     │
//   └─────────────────────────┴──────────────────────────────────────────┘

import {
  ARRAY_COLUMNS,
  BOOL_COLUMNS,
  COALESCE_COLUMNS,
  DATE_COLUMNS,
  FLOAT_COLUMNS,
  INT_COLUMNS,
  SHEET_OWNED_COLUMNS,
  columnKind,
} from "./columns";
import type { SkippedRow, VenueCellValue, VenueRecord } from "./types";

// ─── Cell-level parsers ────────────────────────────────────────────────

function cleanStr(s: string | undefined): string | null {
  if (!s) return null;
  const t = s.trim();
  return t.length === 0 ? null : t;
}

/**
 * Strict bool parser. Sheet values must be one of yes/no/true/false/y/n/1/0
 * (case-insensitive, trimmed). Anything else returns null. The `active`
 * column is the only place this matters for skip logic — silent defaults
 * were the source of the London-restaurants surprise (rows with empty
 * active got imported as active=true).
 */
function parseBool(s: string | undefined): boolean | null {
  if (s == null) return null;
  const v = s.trim().toLowerCase();
  if (v === "yes" || v === "true" || v === "y" || v === "1") return true;
  if (v === "no" || v === "false" || v === "n" || v === "0") return false;
  return null;
}

function parseInt(s: string | undefined): number | null {
  if (!s) return null;
  const n = Number.parseFloat(s);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

function parseFloat(s: string | undefined): number | null {
  if (!s) return null;
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function parseArray(s: string | undefined): string[] {
  if (!s) return [];
  // Defensive split on both `,` and `|` — the sheet has historically used both.
  return s
    .replace(/\|/g, ",")
    .split(",")
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
}

function parseDate(s: string | undefined): string | null {
  if (!s) return null;
  const trimmed = s.trim();
  // Already ISO YYYY-MM-DD?
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
  // Excel/Sheets serial date number.
  const serial = Number.parseFloat(trimmed);
  if (Number.isFinite(serial) && serial > 30000) {
    const d = new Date(Date.UTC(1899, 11, 30));
    d.setUTCDate(d.getUTCDate() + serial);
    return d.toISOString().slice(0, 10);
  }
  return null;
}

function coerceCell(col: string, raw: string | undefined): VenueCellValue {
  switch (columnKind(col)) {
    case "array":
      return parseArray(raw);
    case "bool":
      return parseBool(raw);
    case "int":
      return parseInt(raw);
    case "float":
      return parseFloat(raw);
    case "date":
      return parseDate(raw);
    case "string":
    default:
      return cleanStr(raw);
  }
}

// ─── Row-level transform ───────────────────────────────────────────────

export interface TransformResult {
  records: VenueRecord[];
  skipped: SkippedRow[];
}

/**
 * Build a map from canonical column name → row index using the (already
 * lowercased) header row. Unknown headers are silently kept in the map but
 * never read because the transform iterates ALL_WRITABLE_COLUMNS, not the
 * headers — defensive against curators adding new sheet columns.
 */
function buildColumnIndex(headers: string[]): Record<string, number> {
  const idx: Record<string, number> = {};
  headers.forEach((h, i) => {
    if (h && !(h in idx)) idx[h] = i;
  });
  return idx;
}

/**
 * Transform a sheet row into a VenueRecord. Returns either:
 *   - { ok: true, record } — passes all validation
 *   - { ok: false, skipped } — failed validation; reason in skipped
 */
function transformRow(
  rowIdx: number,
  row: string[],
  col: Record<string, number>
): { ok: true; record: VenueRecord } | { ok: false; skipped: SkippedRow } {
  // Sheet rows are 1-based and data starts at row 3 (row 1 = section
  // headers, row 2 = column headers).
  const sheetRow = rowIdx + 3;

  const get = (key: string): string | undefined => {
    const i = col[key];
    if (i == null) return undefined;
    return i < row.length ? row[i] : undefined;
  };

  const venue_id = cleanStr(get("venue_id"));
  const name = cleanStr(get("name"));

  if (!venue_id) {
    return {
      ok: false,
      skipped: { row: sheetRow, name: name ?? undefined, reason: "missing venue_id" },
    };
  }
  if (!name) {
    return {
      ok: false,
      skipped: { row: sheetRow, venue_id, reason: "missing name" },
    };
  }

  // Strict active check: empty or unparseable => skip. The CLI silently
  // skipped on "not yes"; the route silently defaulted to true. Both
  // were wrong. The sheet must say yes or no.
  const active = parseBool(get("active"));
  if (active === null) {
    return {
      ok: false,
      skipped: {
        row: sheetRow,
        venue_id,
        name,
        reason: `active is empty or unparseable (got: ${JSON.stringify(get("active") ?? "")})`,
      },
    };
  }

  // Required for the itinerary engine. A venue without coords cannot
  // be placed on the map or proximity-filtered.
  const lat = parseFloat(get("latitude"));
  const lng = parseFloat(get("longitude"));
  if (lat == null || lng == null) {
    return {
      ok: false,
      skipped: {
        row: sheetRow,
        venue_id,
        name,
        reason: "missing latitude or longitude",
      },
    };
  }

  // Neighborhood must be a real slug. The CLI substituted "unknown" for
  // empty values, which produced venues that no questionnaire neighborhood
  // selection could ever hit. Skip instead.
  const neighborhood = cleanStr(get("neighborhood"));
  if (!neighborhood) {
    return {
      ok: false,
      skipped: {
        row: sheetRow,
        venue_id,
        name,
        reason: "missing neighborhood",
      },
    };
  }

  const record: VenueRecord = {};

  // Iterate only SHEET_OWNED writable columns. PROTECTED columns (image_keys,
  // timestamps, id) are never written. COALESCE columns are handled below.
  for (const c of SHEET_OWNED_COLUMNS) {
    record[c] = coerceCell(c, get(c));
  }

  // Apply post-coercion overrides. We re-set fields that have non-default
  // semantics, in this fixed order so the SHEET_OWNED loop above doesn't
  // win.
  record.venue_id = venue_id;
  record.name = name;
  record.neighborhood = neighborhood;
  record.active = active;
  record.latitude = lat;
  record.longitude = lng;

  // curated_by is normalized so case differences in the sheet don't
  // produce false-positive diffs vs the lowercased DB value.
  const curatedRaw = cleanStr(get("curated_by"));
  record.curated_by = curatedRaw ? curatedRaw.toLowerCase() : null;

  // quality_score: empty => null. Defaults hide curation gaps. Apply the
  // override only when blank — explicit values from the sheet pass through
  // the SHEET_OWNED loop already.
  if (cleanStr(get("quality_score")) === null) {
    record.quality_score = null;
  }

  // curation_boost: empty => 0. Additive boost; 0 is the natural neutral.
  if (cleanStr(get("curation_boost")) === null) {
    record.curation_boost = 0;
  }

  // COALESCE columns: include in record only when sheet supplies a value.
  // An omitted key here signals to the apply path (Phase 2) that the DB
  // value should be preserved via SQL COALESCE.
  for (const c of COALESCE_COLUMNS) {
    const raw = get(c);
    const trimmed = raw?.trim() ?? "";
    if (trimmed.length === 0) continue;
    record[c] = coerceCell(c, raw);
  }

  return { ok: true, record };
}

export function transformRows(
  headers: string[],
  rows: string[][]
): TransformResult {
  if (!headers.includes("venue_id") || !headers.includes("name")) {
    throw new Error(
      `Sheet headers missing required columns. Need venue_id and name. Got: ${headers.join(", ")}`
    );
  }

  const col = buildColumnIndex(headers);
  const records: VenueRecord[] = [];
  const skipped: SkippedRow[] = [];

  rows.forEach((row, i) => {
    // Skip blank rows entirely — common at the bottom of the data range
    // when the sheet has trailing empty cells.
    if (row.every((c) => c == null || String(c).trim().length === 0)) {
      return;
    }
    const result = transformRow(i, row, col);
    if (result.ok) {
      records.push(result.record);
    } else {
      skipped.push(result.skipped);
    }
  });

  return { records, skipped };
}

// Re-export type metadata for callers that need to know the kind of a
// given column without reaching back into columns.ts. Diff.ts uses these.
export {
  ARRAY_COLUMNS,
  BOOL_COLUMNS,
  INT_COLUMNS,
  FLOAT_COLUMNS,
  DATE_COLUMNS,
  COALESCE_COLUMNS,
};
