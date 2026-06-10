-- Add a `walks` JSONB column to composer_saved_itineraries so the full
-- WalkSegment[] (including Phase 10 route_geometry) survives the save
-- round-trip. Without this, the home page hero card's static map can
-- only render pin overlays — the per-segment GeoJSON LineStrings cached
-- in composer_walking_routes never reach the saved-itinerary render
-- path, and rebuildWalks() reconstitutes straight-line stubs that lose
-- the street-following geometry.
--
-- Naming note: the existing `walking JSONB` column holds the
-- WalkingMeta totals object (longest_walk_min, total_walk_min,
-- any_over_cap, cap_min). The new `walks JSONB` column holds the
-- per-segment WalkSegment[]. Both names plausibly mean the same thing
-- to a reader; resist a future "consolidate the two" instinct — they
-- carry different shapes and `walking` is load-bearing on the saved
-- page's walking-meta UI.
--
-- Nullable on purpose. Pre-2026-06-10 saved rows have no walks data,
-- and the read path (src/lib/itinerary/saved-hydration.ts) falls back
-- to rebuildWalks(stops) when this column is null. New saves write
-- the WalkSegment[] directly. No backfill — the legacy fallback keeps
-- old rows rendering as before (pins-only static map), and a future
-- one-shot backfill can be added if the founders decide to retroact
-- route geometries onto historical rows.

BEGIN;

ALTER TABLE composer_saved_itineraries
  ADD COLUMN IF NOT EXISTS walks JSONB;

COMMENT ON COLUMN composer_saved_itineraries.walks IS
  'WalkSegment[] for the itinerary (Phase 10). Each entry carries from/to/distance_km/walk_minutes plus the GeoJSON LineString route_geometry from composer_walking_routes when available. NULL for pre-2026-06-10 rows — code falls back to rebuildWalks(stops) which produces straight-line stubs.';

-- Disambiguate the existing `walking` column (WalkingMeta totals) from
-- the new `walks` column (WalkSegment[]). One-letter difference, both
-- JSONB, easy to confuse from psql or admin scripts.
COMMENT ON COLUMN composer_saved_itineraries.walking IS
  'WalkingMeta totals: longest_walk_min, total_walk_min, any_over_cap, cap_min. NOT the per-segment array — see `walks` column for that.';

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════════════
-- WARNING: this rollback DESTROYS persisted route_geometry data. Safe
-- only inside the same deploy window before any saves have run. After
-- launch, prefer a forward-fix migration; rolling back here means every
-- post-2026-06-10 saved itinerary loses its real walking routes and
-- silently falls back to straight-line stubs at render time (which the
-- legacy fallback code path masks — there's no error to alert on).
-- BEGIN;
-- ALTER TABLE composer_saved_itineraries DROP COLUMN IF EXISTS walks;
-- COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
-- VERIFICATION
-- ═══════════════════════════════════════════════════════════════════════
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'composer_saved_itineraries' AND column_name = 'walks';
