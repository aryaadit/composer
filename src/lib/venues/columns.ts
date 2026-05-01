// Canonical column inventory for composer_venues_v2.
//
// Every other module in src/lib/venues/* derives its column knowledge from
// here — there is no separate per-file column list. To add a column to the
// importer, add it to ALL_V2_COLUMNS and (if non-string) to the appropriate
// type set below.
//
// The full v2 schema lives in supabase/migrations/20260428_composer_venues_v2.sql
// (plus 20260428_venue_image_keys.sql for image_keys).

/** Every column on composer_venues_v2, in schema declaration order. */
export const ALL_V2_COLUMNS = [
  // DB-managed identity
  "id",

  // Core identity
  "venue_id",
  "name",
  "neighborhood",
  "category",
  "price_tier",

  // Matching & scoring
  "vibe_tags",
  "occasion_tags",
  "stop_roles",
  "time_blocks",
  "mon_blocks",
  "tue_blocks",
  "wed_blocks",
  "thu_blocks",
  "fri_blocks",
  "sat_blocks",
  "sun_blocks",

  // Logistics
  "duration_hours",
  "outdoor_seating",
  "reservation_difficulty",
  "reservation_lead_days",
  "reservation_url",
  "maps_url",

  // Curation
  "curation_note",
  "awards",
  "quality_score",
  "curation_boost",
  "curated_by",

  // Geo
  "address",
  "latitude",
  "longitude",

  // Status
  "active",
  "notes",
  "verified",
  "hours",
  "last_verified",
  "last_updated",

  // Attributes
  "happy_hour",
  "dog_friendly",
  "kid_friendly",
  "wheelchair_accessible",
  "signature_order",
  "google_place_id",

  // Corner source
  "corner_id",
  "corner_photo_url",
  "guide_count",
  "source_guides",
  "all_neighborhoods",

  // Google Places
  "google_rating",
  "google_review_count",
  "google_types",
  "google_phone",
  "enriched",
  "business_status",

  // Photos (enrichment-owned, never written by importer)
  "image_keys",

  // Reservation platform
  "reservation_platform",
  "resy_venue_id",
  "resy_slug",

  // DB-managed timestamps
  "created_at",
  "updated_at",
] as const;

export type V2Column = (typeof ALL_V2_COLUMNS)[number];

/**
 * Never written by the importer. Includes DB-managed identity/timestamps
 * and enrichment-owned columns. Even if the sheet adds a column with one
 * of these names, the importer will ignore it.
 *
 * `image_keys` is owned by the photo enrichment pipeline
 * (scripts/backfill_venue_photos_v2.py); previous importers preserved it
 * by accident (omission from a write list). Listing it explicitly here
 * makes the intent permanent.
 */
export const PROTECTED_COLUMNS: ReadonlySet<string> = new Set([
  "id",
  "created_at",
  "updated_at",
  "image_keys",
]);

/**
 * Written from sheet when non-empty; preserved when sheet value is empty.
 *
 * SQL form (Phase 2):
 *   SET col = COALESCE(EXCLUDED.col, composer_venues_v2.col)
 *
 * Rationale: these columns can be set manually in the sheet OR populated
 * by the Resy scraper (scripts/scrape_resy_v2.py). Either source is valid;
 * the importer must never destroy a value the scraper produced just
 * because the curator hasn't filled in the sheet column.
 */
export const COALESCE_COLUMNS: ReadonlySet<string> = new Set([
  "reservation_platform",
  "resy_venue_id",
  "resy_slug",
]);

/**
 * Sheet is the source of truth for these columns, including empty values
 * (an empty sheet cell overwrites a non-empty DB value). Derived from
 * ALL_V2_COLUMNS minus PROTECTED minus COALESCE.
 */
export const SHEET_OWNED_COLUMNS: ReadonlySet<string> = new Set(
  ALL_V2_COLUMNS.filter(
    (c) => !PROTECTED_COLUMNS.has(c) && !COALESCE_COLUMNS.has(c)
  )
);

/**
 * Every column the importer is allowed to write — SHEET_OWNED ∪ COALESCE.
 * Use this set everywhere a "what does the importer touch?" check is needed
 * (diff comparison, INSERT column list, etc.) instead of redefining.
 */
export const ALL_WRITABLE_COLUMNS: ReadonlySet<string> = new Set([
  ...SHEET_OWNED_COLUMNS,
  ...COALESCE_COLUMNS,
]);

// ─── Per-column type metadata ──────────────────────────────────────────
// Default = string. Membership in one of these sets controls how the
// transform module coerces the raw sheet cell.

export const ARRAY_COLUMNS: ReadonlySet<string> = new Set([
  "vibe_tags",
  "occasion_tags",
  "stop_roles",
  "time_blocks",
  "mon_blocks",
  "tue_blocks",
  "wed_blocks",
  "thu_blocks",
  "fri_blocks",
  "sat_blocks",
  "sun_blocks",
  "google_types",
  "source_guides",
  "all_neighborhoods",
]);

export const BOOL_COLUMNS: ReadonlySet<string> = new Set([
  "active",
  "verified",
  "dog_friendly",
  "kid_friendly",
  "wheelchair_accessible",
  "enriched",
]);

export const INT_COLUMNS: ReadonlySet<string> = new Set([
  "price_tier",
  "reservation_difficulty",
  "reservation_lead_days",
  "quality_score",
  "curation_boost",
  "guide_count",
  "google_review_count",
  "resy_venue_id",
]);

export const FLOAT_COLUMNS: ReadonlySet<string> = new Set([
  "duration_hours",
  "latitude",
  "longitude",
  "google_rating",
]);

export const DATE_COLUMNS: ReadonlySet<string> = new Set([
  "last_verified",
  "last_updated",
]);

/** Coarse type tag used by transform + diff for branching on a column. */
export type ColumnKind = "string" | "array" | "bool" | "int" | "float" | "date";

export function columnKind(col: string): ColumnKind {
  if (ARRAY_COLUMNS.has(col)) return "array";
  if (BOOL_COLUMNS.has(col)) return "bool";
  if (INT_COLUMNS.has(col)) return "int";
  if (FLOAT_COLUMNS.has(col)) return "float";
  if (DATE_COLUMNS.has(col)) return "date";
  return "string";
}

/**
 * Per-column Postgres type, used by apply.ts to build the
 * `jsonb_to_recordset(...) AS t(col TYPE, ...)` typedef. The names match
 * the v2 schema declarations exactly; mismatches will surface as plpgsql
 * cast errors at apply time, not silent corruption.
 *
 * Defaults:
 *   string  → text
 *   array   → text[]
 *   bool    → boolean
 *   float   → double precision
 *   int     → integer
 *   date    → date
 *
 * Per-column overrides where the schema disagrees with the default.
 */
const PG_TYPE_OVERRIDES: Record<string, string> = {
  // NUMERIC in the schema (not double precision).
  duration_hours: "numeric",
  google_rating: "numeric",
  // TIMESTAMPTZ in the schema (not date) — the importer only writes a
  // YYYY-MM-DD; Postgres parses that as midnight UTC.
  last_updated: "timestamptz",
};

export function pgType(col: string): string {
  if (col in PG_TYPE_OVERRIDES) return PG_TYPE_OVERRIDES[col];
  switch (columnKind(col)) {
    case "array":
      return "text[]";
    case "bool":
      return "boolean";
    case "int":
      return "integer";
    case "float":
      return "double precision";
    case "date":
      return "date";
    case "string":
    default:
      return "text";
  }
}
