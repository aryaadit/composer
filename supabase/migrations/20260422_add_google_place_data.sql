-- Add columns for cached Google Places data.
-- google_place_id is synced from the venue sheet (column AG).
-- google_place_data stores a trimmed JSONB snapshot of the Places API response.
-- google_place_photos stores Supabase Storage paths for downloaded photos.

ALTER TABLE composer_venues
ADD COLUMN IF NOT EXISTS google_place_id TEXT,
ADD COLUMN IF NOT EXISTS google_place_data JSONB,
ADD COLUMN IF NOT EXISTS google_place_photos TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS google_data_updated_at TIMESTAMPTZ;

-- Index for querying venues that need data fetched
CREATE INDEX IF NOT EXISTS idx_composer_venues_missing_place_data
ON composer_venues (google_place_id)
WHERE google_place_id IS NOT NULL AND google_place_data IS NULL;
