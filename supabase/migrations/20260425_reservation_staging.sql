-- Staging table for reservation platform matching.
-- Pass 1 (website scrape) and Pass 2 (Resy search) write here.
-- Manual review + promote script moves approved rows to composer_venues.

CREATE TABLE IF NOT EXISTS venue_reservation_staging (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES composer_venues(id) ON DELETE CASCADE,
  venue_name TEXT NOT NULL,
  platform TEXT,
  resy_venue_id INTEGER,
  resy_slug TEXT,
  reservation_url TEXT,
  confidence TEXT NOT NULL,
  source TEXT NOT NULL,
  notes TEXT,
  reviewed BOOLEAN DEFAULT FALSE,
  approved BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (venue_id)
);

CREATE INDEX IF NOT EXISTS idx_staging_confidence
ON venue_reservation_staging(confidence, reviewed);
