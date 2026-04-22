-- Add reservation platform columns for availability integration.
-- resy_venue_id + resy_slug are Resy-specific; other platforms will
-- get their own ID columns as we integrate them.

ALTER TABLE composer_venues
ADD COLUMN IF NOT EXISTS reservation_platform TEXT
  CHECK (reservation_platform IN ('resy','opentable','tock','sevenrooms','none'))
  DEFAULT 'none',
ADD COLUMN IF NOT EXISTS resy_venue_id INTEGER,
ADD COLUMN IF NOT EXISTS resy_slug TEXT;
