-- Phase 1.5: Provisional venues via Google Places. Users can anchor
-- on a spot not in the catalog; it lands as a provisional row queued
-- for founder review.

BEGIN;

ALTER TABLE composer_venues_v2
  ADD COLUMN IF NOT EXISTS provenance text DEFAULT 'curated',
  ADD COLUMN IF NOT EXISTS pending_curation boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS inferred_vibe text,
  ADD COLUMN IF NOT EXISTS provisional_added_at timestamptz,
  ADD COLUMN IF NOT EXISTS provisional_added_by uuid REFERENCES composer_users(id);

CREATE INDEX IF NOT EXISTS composer_venues_provenance_idx
  ON composer_venues_v2 (provenance);

CREATE INDEX IF NOT EXISTS composer_venues_google_place_id_idx
  ON composer_venues_v2 (google_place_id)
  WHERE google_place_id IS NOT NULL;

-- Provisional rows visible only to the user who added them until
-- a founder promotes them. Curated rows remain readable by all
-- authenticated users as today.
-- NOTE: Apply this policy manually after reviewing existing RLS.

COMMIT;
