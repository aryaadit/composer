-- Composer: Venue schema and seed data

CREATE TABLE IF NOT EXISTS venues (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  neighborhood TEXT NOT NULL,
  address TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  stop_roles TEXT[] NOT NULL DEFAULT '{}',
  price_tier INTEGER NOT NULL CHECK (price_tier BETWEEN 1 AND 3),
  vibe_tags TEXT[] NOT NULL DEFAULT '{}',
  occasion_tags TEXT[] NOT NULL DEFAULT '{}',
  outdoor_seating BOOLEAN NOT NULL DEFAULT FALSE,
  reservation_url TEXT,
  curation_note TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  quality_score INTEGER NOT NULL DEFAULT 7 CHECK (quality_score BETWEEN 1 AND 10),
  curation_boost INTEGER NOT NULL DEFAULT 0 CHECK (curation_boost BETWEEN 0 AND 2),
  best_before TEXT,
  best_after TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE venues ENABLE ROW LEVEL SECURITY;

-- Allow public read access
CREATE POLICY "Public read access" ON venues
  FOR SELECT USING (true);

-- Seed: 5 curated venues across different neighborhoods, roles, and tiers

INSERT INTO venues (name, category, neighborhood, address, latitude, longitude, stop_roles, price_tier, vibe_tags, occasion_tags, outdoor_seating, reservation_url, curation_note, quality_score, curation_boost, best_after) VALUES

('Via Carota', 'Italian Restaurant', 'west-village', '51 Grove St, New York, NY 10014', 40.7335, -74.0027,
 ARRAY['main'], 3,
 ARRAY['food_forward', 'dinner', 'romantic', 'conversation_friendly'],
 ARRAY['first-date', 'second-date', 'dating', 'established'],
 FALSE, 'https://www.viacarota.com',
 'The cacio e pepe is non-negotiable. Get there early — no reservations, but the wait is worth every minute.',
 10, 2, '17:00'),

('Attaboy', 'Cocktail Bar', 'east-village-les', '134 Eldridge St, New York, NY 10002', 40.7188, -73.9912,
 ARRAY['opener', 'closer'], 2,
 ARRAY['cocktail_forward', 'speakeasy', 'drinks', 'conversation_friendly', 'late_night'],
 ARRAY['first-date', 'second-date', 'dating', 'friends'],
 FALSE, NULL,
 'No menu — tell them what you''re in the mood for. They''ve never missed.',
 9, 1, '18:00'),

('Los Tacos No. 1', 'Taqueria', 'soho-nolita', '75 9th Ave, New York, NY 10011', 40.7425, -74.0049,
 ARRAY['opener'], 1,
 ARRAY['food_forward', 'casual'],
 ARRAY['friends', 'solo', 'dating'],
 FALSE, NULL,
 'The adobada taco is one of the best bites in the city for under $5. No frills, all flavor.',
 8, 0, NULL),

('Westlight', 'Rooftop Bar', 'williamsburg', '111 N 12th St, Brooklyn, NY 11249', 40.7224, -73.9573,
 ARRAY['opener', 'closer'], 2,
 ARRAY['cocktail_forward', 'drinks', 'outdoor', 'upscale'],
 ARRAY['first-date', 'established', 'friends'],
 TRUE, 'https://westlightnyc.com',
 'The Manhattan skyline from up here hits different. Grab the window seats before sunset.',
 9, 1, '16:00'),

('Don Angie', 'Italian Restaurant', 'west-village', '103 Greenwich Ave, New York, NY 10014', 40.7370, -73.9995,
 ARRAY['main'], 3,
 ARRAY['food_forward', 'dinner', 'romantic', 'upscale'],
 ARRAY['established', 'second-date', 'dating'],
 FALSE, 'https://www.donangie.com',
 'The chrysanthemum lasagna is iconic for a reason. This is a celebration dinner — dress up a little.',
 9, 2, '17:30');
