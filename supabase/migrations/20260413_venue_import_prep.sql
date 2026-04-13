-- Prepare composer_venues for Reid's 496-venue import from the curated
-- spreadsheet (composer_venue_sheet_v1.1.xlsx).
--
-- Summary of changes:
--   1. Extend price_tier constraint from 1-3 → 1-4 (Reid has 41 tier-4 venues)
--   2. Loosen outdoor_seating to nullable (Reid uses {yes, no, unknown})
--   3. Loosen address to nullable (Reid's sheet has no dedicated column)
--   4. Add 13 new columns: category_group, duration_minutes, hours,
--      signature_order, curated_by, last_verified, reservation_difficulty,
--      cash_only, dog_friendly, kid_friendly, wheelchair_accessible,
--      raw_vibe_tags (Path-A preservation), raw_stop_role (Path-A preservation)
--   5. Add unique index on (LOWER(name), neighborhood) for idempotent upsert
--
-- Safe to re-run. All ADDs use IF NOT EXISTS. Constraint drop uses catalog
-- lookup so it works regardless of auto-generated name. Non-destructive —
-- existing rows are not modified.
--
-- Rollback script is at the bottom of this file (commented out). Uncomment
-- only if the migration needs to be undone.

BEGIN;

-- ─── 1. Extend price_tier constraint from 1-3 → 1-4 ─────────────────────
DO $$
DECLARE c TEXT;
BEGIN
  SELECT conname INTO c
  FROM pg_constraint
  WHERE conrelid = 'composer_venues'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%price_tier%';
  IF c IS NOT NULL THEN
    EXECUTE format('ALTER TABLE composer_venues DROP CONSTRAINT %I', c);
  END IF;
END $$;

ALTER TABLE composer_venues
  ADD CONSTRAINT composer_venues_price_tier_check
  CHECK (price_tier BETWEEN 1 AND 4);

-- ─── 2. Loosen NOT NULL where Reid's data doesn't always populate ───────
ALTER TABLE composer_venues ALTER COLUMN outdoor_seating DROP NOT NULL;
ALTER TABLE composer_venues ALTER COLUMN outdoor_seating DROP DEFAULT;
ALTER TABLE composer_venues ALTER COLUMN address         DROP NOT NULL;

-- ─── 3. Add 13 new nullable columns ─────────────────────────────────────
ALTER TABLE composer_venues
  -- Display / UX metadata
  ADD COLUMN IF NOT EXISTS category_group         TEXT,
  ADD COLUMN IF NOT EXISTS duration_minutes       INTEGER,
  ADD COLUMN IF NOT EXISTS hours                  TEXT,
  ADD COLUMN IF NOT EXISTS signature_order        TEXT,

  -- Curation provenance + freshness
  ADD COLUMN IF NOT EXISTS curated_by             TEXT,
  ADD COLUMN IF NOT EXISTS last_verified          DATE,

  -- Booking + logistics
  ADD COLUMN IF NOT EXISTS reservation_difficulty INTEGER
    CHECK (reservation_difficulty BETWEEN 1 AND 4),
  ADD COLUMN IF NOT EXISTS cash_only              BOOLEAN,

  -- Accessibility / preference filters (Phase 2-ready)
  ADD COLUMN IF NOT EXISTS dog_friendly           BOOLEAN,
  ADD COLUMN IF NOT EXISTS kid_friendly           BOOLEAN,
  ADD COLUMN IF NOT EXISTS wheelchair_accessible  TEXT,

  -- Path-A preservation: Reid's original rich values, untouched for
  -- future semantic matching / embeddings work.
  ADD COLUMN IF NOT EXISTS raw_vibe_tags          TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS raw_stop_role          TEXT;

-- ─── 4. Unique index for idempotent upsert on re-import ────────────────
CREATE UNIQUE INDEX IF NOT EXISTS composer_venues_name_hood_unique
  ON composer_venues (LOWER(name), neighborhood);

COMMIT;

-- ─── Verification queries (read-only) ──────────────────────────────────
-- Run after COMMIT to confirm the migration applied correctly.

-- Expected: 31 rows (18 original cols + 13 new). Check nullability:
--   outdoor_seating → is_nullable = YES
--   address         → is_nullable = YES
--   raw_vibe_tags   → column_default = '{}'::text[]
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'composer_venues'
ORDER BY ordinal_position;

-- Expected: 5 (the seed venues, untouched).
SELECT count(*) AS rows_after_migration FROM composer_venues;

-- Expected: composer_venues_price_tier_check with definition
--   CHECK ((price_tier >= 1 AND price_tier <= 4))
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'composer_venues'::regclass AND contype = 'c';

-- Expected: the new unique index appears alongside the PK.
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'composer_venues';

-- Expected: 5 rows. All new columns should read NULL.
SELECT name, neighborhood, price_tier, category_group, hours, signature_order,
       raw_vibe_tags, raw_stop_role
FROM composer_venues
ORDER BY name;

-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK — uncomment and run only if the migration needs to be undone.
-- ═══════════════════════════════════════════════════════════════════════
--
-- BEGIN;
--
-- DROP INDEX IF EXISTS composer_venues_name_hood_unique;
--
-- ALTER TABLE composer_venues
--   DROP COLUMN IF EXISTS category_group,
--   DROP COLUMN IF EXISTS duration_minutes,
--   DROP COLUMN IF EXISTS hours,
--   DROP COLUMN IF EXISTS signature_order,
--   DROP COLUMN IF EXISTS curated_by,
--   DROP COLUMN IF EXISTS last_verified,
--   DROP COLUMN IF EXISTS reservation_difficulty,
--   DROP COLUMN IF EXISTS cash_only,
--   DROP COLUMN IF EXISTS dog_friendly,
--   DROP COLUMN IF EXISTS kid_friendly,
--   DROP COLUMN IF EXISTS wheelchair_accessible,
--   DROP COLUMN IF EXISTS raw_vibe_tags,
--   DROP COLUMN IF EXISTS raw_stop_role;
--
-- -- Re-backfill the 5 seed addresses before re-adding NOT NULL on address
-- -- (they're still in place from the original seed; no data loss).
-- ALTER TABLE composer_venues ALTER COLUMN address SET NOT NULL;
-- ALTER TABLE composer_venues ALTER COLUMN outdoor_seating SET DEFAULT FALSE;
-- ALTER TABLE composer_venues ALTER COLUMN outdoor_seating SET NOT NULL;
--
-- ALTER TABLE composer_venues DROP CONSTRAINT composer_venues_price_tier_check;
-- ALTER TABLE composer_venues ADD CONSTRAINT composer_venues_price_tier_check
--   CHECK (price_tier BETWEEN 1 AND 3);
--
-- COMMIT;
