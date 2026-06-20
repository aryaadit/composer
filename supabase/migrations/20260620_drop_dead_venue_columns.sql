-- Record the drop of 8 dead columns from composer_venues_v2 as a migration.
--
-- These were removed from the live database during the 73->48 venue column
-- cleanup but the migration was never committed, so the ledger no longer
-- reproduces the live schema. This backfills that gap.
--
-- Idempotent: DROP COLUMN IF EXISTS is a no-op where the columns are already
-- gone (prod) and effective on any environment rebuilt from migrations.
-- Companion to code commit 2a0b4ce. No dependent indexes, views, or policies
-- existed on these columns (verified during the original live drop), so no
-- CASCADE is needed.

ALTER TABLE composer_venues_v2
  DROP COLUMN IF EXISTS reservation_lead_days,
  DROP COLUMN IF EXISTS verified,
  DROP COLUMN IF EXISTS last_updated,
  DROP COLUMN IF EXISTS corner_id,
  DROP COLUMN IF EXISTS corner_photo_url,
  DROP COLUMN IF EXISTS guide_count,
  DROP COLUMN IF EXISTS source_guides,
  DROP COLUMN IF EXISTS all_neighborhoods;
