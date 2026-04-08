-- Replace Los Tacos No. 1 (wrong neighborhood) with Jack's Wife Freda

DELETE FROM composer_venues WHERE name = 'Los Tacos No. 1';

INSERT INTO composer_venues (name, category, neighborhood, address, latitude, longitude, stop_roles, price_tier, vibe_tags, occasion_tags, outdoor_seating, reservation_url, curation_note, quality_score, curation_boost, best_after)
VALUES (
  'Jack''s Wife Freda',
  'American',
  'soho-nolita',
  '345 Broadway, New York, NY 10013',
  40.7243, -74.0019,
  ARRAY['main'],
  2,
  ARRAY['food_forward', 'dinner', 'casual', 'conversation_friendly'],
  ARRAY['first-date', 'dating', 'friends'],
  TRUE,
  NULL,
  'Reliably great, unpretentious, good for conversation. The green shakshuka is the move.',
  8, 1, NULL
);
