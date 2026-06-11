-- Rename analytics_events → composer_analytics_events to match the
-- composer_ prefix convention used by every other table in this
-- project (composer_venues_v2, composer_users, composer_saved_itineraries,
-- composer_walking_routes, composer_import_runs, composer_venue_image_keys,
-- composer_shared_itineraries).
--
-- The original creation migration (20260526_create_analytics_events.sql)
-- is preserved as-is per the "applied migrations are history" rule;
-- this migration is the forward delta.
--
-- Renames are atomic against catalog locks but instantaneous on disk —
-- no table rewrite, no per-row work. Application code is updated in the
-- same change (src/lib/analytics-server.ts and src/app/api/analytics/track/route.ts).
--
-- Postgres does NOT auto-rename pkey / fkey constraints or indexes
-- when a table is renamed — each must be explicitly renamed below so
-- the catalog stays consistent with the new table name.

BEGIN;

ALTER TABLE analytics_events RENAME TO composer_analytics_events;

ALTER TABLE composer_analytics_events
  RENAME CONSTRAINT analytics_events_pkey TO composer_analytics_events_pkey;
ALTER TABLE composer_analytics_events
  RENAME CONSTRAINT analytics_events_user_id_fkey TO composer_analytics_events_user_id_fkey;

ALTER INDEX analytics_events_user_idx RENAME TO composer_analytics_events_user_idx;
ALTER INDEX analytics_events_distinct_idx RENAME TO composer_analytics_events_distinct_idx;
ALTER INDEX analytics_events_event_idx RENAME TO composer_analytics_events_event_idx;
ALTER INDEX analytics_events_properties_idx RENAME TO composer_analytics_events_properties_idx;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK (renames are symmetric)
-- ═══════════════════════════════════════════════════════════════════════
-- BEGIN;
-- ALTER INDEX composer_analytics_events_properties_idx RENAME TO analytics_events_properties_idx;
-- ALTER INDEX composer_analytics_events_event_idx RENAME TO analytics_events_event_idx;
-- ALTER INDEX composer_analytics_events_distinct_idx RENAME TO analytics_events_distinct_idx;
-- ALTER INDEX composer_analytics_events_user_idx RENAME TO analytics_events_user_idx;
-- ALTER TABLE composer_analytics_events
--   RENAME CONSTRAINT composer_analytics_events_user_id_fkey TO analytics_events_user_id_fkey;
-- ALTER TABLE composer_analytics_events
--   RENAME CONSTRAINT composer_analytics_events_pkey TO analytics_events_pkey;
-- ALTER TABLE composer_analytics_events RENAME TO analytics_events;
-- COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
-- VERIFICATION
-- ═══════════════════════════════════════════════════════════════════════
-- SELECT relname FROM pg_class WHERE relname = 'composer_analytics_events';
-- SELECT conname FROM pg_constraint WHERE conrelid = 'composer_analytics_events'::regclass;
-- SELECT indexname FROM pg_indexes WHERE tablename = 'composer_analytics_events';
