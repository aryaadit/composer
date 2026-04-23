-- Add image storage key array to composer_venues_v2.
-- Each entry is a Supabase Storage path like "{google_place_id}/0.jpg".
-- Keyed by google_place_id (not venue_id) so future ID migrations don't orphan images.

ALTER TABLE composer_venues_v2
  ADD COLUMN IF NOT EXISTS image_keys TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN composer_venues_v2.image_keys IS
  'Supabase Storage paths to venue photos, keyed by google_place_id. Empty if no photos fetched.';
