-- Phase 10: Cache real Mapbox Directions API walking routes per venue
-- pair. The cache is permanent — walking routes between fixed points
-- don't change. If a venue's lat/lng ever moves, manually delete the
-- affected rows (rare enough that no automatic invalidation logic is
-- worth carrying).
--
-- Keyed by (origin_venue_id, destination_venue_id) — directional. Most
-- NYC walking routes are A↔B symmetric, but one-way pedestrian paths
-- (Central Park drives at certain hours, the High Line, certain
-- pedestrian-only streets) can differ. Caching both directions
-- separately preserves correctness without extra lookup math at the
-- call site.

BEGIN;

CREATE TABLE IF NOT EXISTS composer_walking_routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  origin_venue_id UUID NOT NULL REFERENCES composer_venues_v2(id) ON DELETE CASCADE,
  destination_venue_id UUID NOT NULL REFERENCES composer_venues_v2(id) ON DELETE CASCADE,
  -- Coordinate fingerprint. Geometry is a function of (origin, dest)
  -- coords, and venue coords get corrected during data cleanup
  -- (Google Places backfill, manual fixes). On lookup, if the stored
  -- coords no longer match the current venue coords (after rounding
  -- to 6 decimal places ≈ 11cm), the helper treats it as a miss,
  -- refetches from Mapbox, and upserts over the stale row. Without
  -- this we'd silently serve a geometry computed against the old
  -- coordinates forever. NUMERIC(9, 6) covers ±999.999999, with
  -- plenty of headroom for the ±90 / ±180 lat/lng ranges.
  origin_lat NUMERIC(9, 6) NOT NULL,
  origin_lng NUMERIC(9, 6) NOT NULL,
  dest_lat NUMERIC(9, 6) NOT NULL,
  dest_lng NUMERIC(9, 6) NOT NULL,
  route_geometry JSONB NOT NULL,
  walk_minutes INTEGER NOT NULL,
  walk_distance_meters INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (origin_venue_id, destination_venue_id)
);

-- The UNIQUE constraint already creates an index — the named lookup
-- index would be a duplicate. Skipping the redundant CREATE INDEX from
-- the spec; the UNIQUE-backing index covers the same access pattern.

COMMENT ON TABLE composer_walking_routes IS
  'Cached Mapbox Directions API responses for venue-pair walking routes. Cache is permanent — walking routes between fixed points do not change. If a venue moves, manually delete affected rows.';

COMMENT ON COLUMN composer_walking_routes.route_geometry IS
  'GeoJSON LineString from Mapbox Directions API (geometries=geojson). Consumed directly by Mapbox GL JS, and re-encoded to Google polyline for Mapbox Static API path overlays.';

COMMENT ON COLUMN composer_walking_routes.walk_minutes IS
  'Mapbox Directions duration / 60, rounded. Authoritative — replaces the straight-line walkTimeMinutes() estimate from src/lib/geo.ts wherever a row exists for the pair.';

COMMENT ON COLUMN composer_walking_routes.walk_distance_meters IS
  'Mapbox Directions distance in meters. Authoritative — replaces the straight-line walkDistanceKm() estimate (km, not meters; note the unit difference for downstream consumers).';

-- Server-only cache table. No policies on purpose — the only intended
-- caller is the service-role client in src/lib/walking-routes.ts,
-- which bypasses RLS. With RLS enabled and no policies, anon + the
-- cookie-based server client both see this table as empty (and any
-- write attempt errors), which is the defense-in-depth we want.
ALTER TABLE composer_walking_routes ENABLE ROW LEVEL SECURITY;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK (preserves Phase 10 dependencies — only drops the cache table)
-- ═══════════════════════════════════════════════════════════════════════
-- BEGIN;
-- DROP TABLE IF EXISTS composer_walking_routes;
-- COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
-- VERIFICATION
-- ═══════════════════════════════════════════════════════════════════════
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'composer_walking_routes'
-- ORDER BY ordinal_position;
--
-- SELECT
--   conname AS constraint_name,
--   pg_get_constraintdef(oid) AS definition
-- FROM pg_constraint
-- WHERE conrelid = 'composer_walking_routes'::regclass;
