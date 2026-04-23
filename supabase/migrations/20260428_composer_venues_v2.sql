-- composer_venues_v2 — new venue table matching Reid's updated 1,458-venue sheet.
-- Parallel to composer_venues (v1) during transition. Task D switches the app over.

CREATE TABLE IF NOT EXISTS composer_venues_v2 (
  -- DB-generated identity
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Core identity (sheet columns A–E)
  venue_id               TEXT NOT NULL UNIQUE,
  name                   TEXT NOT NULL,
  neighborhood           TEXT NOT NULL,
  category               TEXT,
  price_tier             INTEGER CHECK (price_tier BETWEEN 1 AND 4),

  -- Matching & scoring (sheet columns F–P)
  vibe_tags              TEXT[] NOT NULL DEFAULT '{}',
  occasion_tags          TEXT[] NOT NULL DEFAULT '{}',
  stop_roles             TEXT[] NOT NULL DEFAULT '{}',
  time_blocks            TEXT[] NOT NULL DEFAULT '{}',
  mon_blocks             TEXT[] NOT NULL DEFAULT '{}',
  tue_blocks             TEXT[] NOT NULL DEFAULT '{}',
  wed_blocks             TEXT[] NOT NULL DEFAULT '{}',
  thu_blocks             TEXT[] NOT NULL DEFAULT '{}',
  fri_blocks             TEXT[] NOT NULL DEFAULT '{}',
  sat_blocks             TEXT[] NOT NULL DEFAULT '{}',
  sun_blocks             TEXT[] NOT NULL DEFAULT '{}',

  -- Logistics (sheet columns Q–V)
  duration_hours         NUMERIC,
  outdoor_seating        TEXT CHECK (outdoor_seating IN ('yes', 'no', 'unknown')) DEFAULT 'unknown',
  reservation_difficulty INTEGER,
  reservation_lead_days  INTEGER,
  reservation_url        TEXT,
  maps_url               TEXT,

  -- Curation (sheet columns W–AA)
  curation_note          TEXT,
  awards                 TEXT,
  quality_score          INTEGER DEFAULT 7,
  curation_boost         INTEGER DEFAULT 0,
  curated_by             TEXT,

  -- Geo (sheet columns AB–AD)
  address                TEXT,
  latitude               DOUBLE PRECISION,
  longitude              DOUBLE PRECISION,

  -- Status (sheet columns AE–AJ)
  active                 BOOLEAN NOT NULL DEFAULT TRUE,
  notes                  TEXT,
  verified               BOOLEAN,
  hours                  TEXT,
  last_verified          DATE,
  last_updated           TIMESTAMPTZ,

  -- Metadata / attributes (sheet columns AK–AP)
  happy_hour             TEXT,
  dog_friendly           BOOLEAN,
  kid_friendly           BOOLEAN,
  wheelchair_accessible  BOOLEAN,
  signature_order        TEXT,
  google_place_id        TEXT,

  -- Corner source (sheet columns AQ–AU)
  corner_id              TEXT,
  corner_photo_url       TEXT,
  guide_count            INTEGER,
  source_guides          TEXT[] NOT NULL DEFAULT '{}',
  all_neighborhoods      TEXT[] NOT NULL DEFAULT '{}',

  -- Google Places (sheet columns AV–BA)
  google_rating          NUMERIC,
  google_review_count    INTEGER,
  google_types           TEXT[] NOT NULL DEFAULT '{}',
  google_phone           TEXT,
  enriched               BOOLEAN DEFAULT FALSE,
  business_status        TEXT,

  -- Reservation data (sheet columns BB–BD)
  reservation_platform   TEXT,
  resy_venue_id          INTEGER,
  resy_slug              TEXT,

  -- Supabase metadata
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  updated_at             TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_v2_active ON composer_venues_v2(active) WHERE active = TRUE;
CREATE INDEX IF NOT EXISTS idx_v2_neighborhood ON composer_venues_v2(neighborhood);
CREATE INDEX IF NOT EXISTS idx_v2_venue_id ON composer_venues_v2(venue_id);
CREATE INDEX IF NOT EXISTS idx_v2_reservation_platform ON composer_venues_v2(reservation_platform)
  WHERE reservation_platform IS NOT NULL;

-- GIN indexes on array columns for tag filtering
CREATE INDEX IF NOT EXISTS idx_v2_vibe_tags ON composer_venues_v2 USING GIN (vibe_tags);
CREATE INDEX IF NOT EXISTS idx_v2_time_blocks ON composer_venues_v2 USING GIN (time_blocks);
CREATE INDEX IF NOT EXISTS idx_v2_stop_roles ON composer_venues_v2 USING GIN (stop_roles);

-- Auto-update updated_at on row change
CREATE OR REPLACE FUNCTION composer_venues_v2_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER composer_venues_v2_updated_at
  BEFORE UPDATE ON composer_venues_v2
  FOR EACH ROW EXECUTE FUNCTION composer_venues_v2_touch_updated_at();

-- RLS: readable by authenticated users, writes restricted to service role
ALTER TABLE composer_venues_v2 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read venues v2"
  ON composer_venues_v2 FOR SELECT
  TO authenticated
  USING (true);
