-- Venue schema v2 — full overhaul to match the cleaned spreadsheet.
--
-- This migration:
--   1. Renames the existing table to composer_venues_backup (safety net)
--   2. Creates a new composer_venues table matching the sheet's 29 columns
--   3. Migrates occasion values in composer_saved_itineraries
--
-- The new table is EMPTY after this migration. Populate it by running
-- the updated import_venues.py against the cleaned Google Sheet.
--
-- Key changes from v1:
--   - duration_minutes → duration_hours (store 1/2/3 not 60/120/180)
--   - outdoor_seating: BOOLEAN → TEXT enum ('yes'/'no'/'unknown')
--   - occasion_tags values: snake_case (first_date, couple, not first-date, established)
--   - stop_roles: stores raw 6 values (opener/main/closer/drinks/activity/coffee)
--   - awards: TEXT[] → TEXT (single string, not array)
--   - wheelchair_accessible: TEXT → BOOLEAN
--   - quality_score + curation_boost: now imported from sheet (not admin-only)
--   - Added: happy_hour, notes, maps_url
--   - Removed: category_group, raw_stop_role, raw_vibe_tags, best_before,
--     best_after, photo_url, amex_dining, chase_sapphire, dress_code
--
-- DO NOT apply until your cleaned sheet is ready to import immediately
-- after. The app queries composer_venues — an empty table means
-- "No venues available" until the import runs.

BEGIN;

-- ─── 1. Safety backup ──────────────────────────────────────────────────
ALTER TABLE IF EXISTS composer_venues RENAME TO composer_venues_backup;

-- Drop the unique index on the old table (it references the old name).
DROP INDEX IF EXISTS composer_venues_name_hood_unique;

-- ─── 2. New table ──────────────────────────────────────────────────────
CREATE TABLE composer_venues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Core
  name TEXT NOT NULL,
  neighborhood TEXT NOT NULL,
  category TEXT NOT NULL,
  price_tier INTEGER NOT NULL CHECK (price_tier BETWEEN 1 AND 4),

  -- Tags (arrays)
  vibe_tags TEXT[] DEFAULT '{}',
  occasion_tags TEXT[] DEFAULT '{}',
  stop_roles TEXT[] DEFAULT '{}',

  -- Timing
  duration_hours INTEGER CHECK (duration_hours BETWEEN 1 AND 5),

  -- Attributes
  outdoor_seating TEXT CHECK (outdoor_seating IN ('yes', 'no', 'unknown')),
  reservation_difficulty INTEGER CHECK (reservation_difficulty BETWEEN 1 AND 4),

  -- URLs
  reservation_url TEXT,
  maps_url TEXT,

  -- Curation
  curation_note TEXT DEFAULT '',
  awards TEXT,
  curated_by TEXT,
  signature_order TEXT,

  -- Location
  address TEXT,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,

  -- Status
  active BOOLEAN DEFAULT true,
  notes TEXT,
  hours TEXT,
  last_verified DATE,

  -- Additional attributes
  happy_hour TEXT,
  dog_friendly BOOLEAN,
  kid_friendly BOOLEAN,
  wheelchair_accessible BOOLEAN,
  cash_only BOOLEAN,

  -- Scoring (now from sheet, not admin-only)
  quality_score INTEGER DEFAULT 7 CHECK (quality_score BETWEEN 1 AND 10),
  curation_boost INTEGER DEFAULT 0 CHECK (curation_boost BETWEEN 0 AND 2),

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Functional unique index for idempotent upsert on re-import.
-- (UNIQUE constraint doesn't support LOWER(); must be an index.)
CREATE UNIQUE INDEX composer_venues_name_hood_unique
  ON composer_venues (LOWER(name), neighborhood);

-- Common query indexes
CREATE INDEX idx_venues_neighborhood ON composer_venues (neighborhood);
CREATE INDEX idx_venues_active ON composer_venues (active);

-- ─── 3. Migrate occasion values in saved itineraries ────────────────
-- Saved rows carry the old occasion taxonomy. Convert in-place so the
-- saved detail page renders correctly after the app code switches to
-- the new slug values.
UPDATE composer_saved_itineraries
SET occasion = CASE occasion
  WHEN 'first-date'  THEN 'first_date'
  WHEN 'second-date' THEN 'first_date'
  WHEN 'established' THEN 'couple'
  ELSE REPLACE(occasion, '-', '_')
END
WHERE occasion IS NOT NULL AND occasion LIKE '%-%';

-- Migrate vibe + budget slugs from hyphenated to snake_case.
UPDATE composer_saved_itineraries
SET vibe = REPLACE(vibe, '-', '_')
WHERE vibe IS NOT NULL AND vibe LIKE '%-%';

UPDATE composer_saved_itineraries
SET budget = REPLACE(budget, '-', '_')
WHERE budget IS NOT NULL AND budget LIKE '%-%';

-- Also fix any occasion_tags stored inside the stops jsonb snapshots.
-- Each stop's venue has occasion_tags[]. Walk and rewrite.
UPDATE composer_saved_itineraries
SET stops = (
  SELECT COALESCE(jsonb_agg(
    CASE
      WHEN stop ? 'venue' AND stop -> 'venue' ? 'occasion_tags'
      THEN jsonb_set(
        stop,
        '{venue,occasion_tags}',
        (
          SELECT COALESCE(jsonb_agg(
            CASE tag
              WHEN 'first-date'  THEN '"first_date"'::jsonb
              WHEN 'second-date' THEN '"first_date"'::jsonb
              WHEN 'established' THEN '"couple"'::jsonb
              ELSE to_jsonb(REPLACE(tag::text, '-', '_'))
            END
          ), '[]'::jsonb)
          FROM jsonb_array_elements_text(stop -> 'venue' -> 'occasion_tags') AS tag
        )
      )
      ELSE stop
    END
  ), '[]'::jsonb)
  FROM jsonb_array_elements(stops) AS stop
)
WHERE stops IS NOT NULL
  AND jsonb_typeof(stops) = 'array'
  AND stops::text LIKE '%first-date%' OR stops::text LIKE '%second-date%' OR stops::text LIKE '%established%';

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK — uncomment to restore from backup. Data in the new table
-- would be lost; the backup table becomes the live table again.
-- ═══════════════════════════════════════════════════════════════════════
-- BEGIN;
-- DROP TABLE IF EXISTS composer_venues;
-- ALTER TABLE IF EXISTS composer_venues_backup RENAME TO composer_venues;
-- COMMIT;
