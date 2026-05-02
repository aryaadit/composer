-- Phase 1: Saved places. Users heart venues from itineraries; saved
-- venues get a gentle scoring boost (+5) on future generations.
-- Uses a uuid[] column on composer_users rather than a join table —
-- defer the join table until per-save metadata is needed in product.

BEGIN;

ALTER TABLE composer_users
  ADD COLUMN IF NOT EXISTS saved_venue_ids uuid[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS saved_venues_updated_at timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS composer_users_saved_venue_ids_idx
  ON composer_users USING gin (saved_venue_ids);

COMMIT;
