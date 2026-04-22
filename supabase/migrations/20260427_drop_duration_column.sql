-- Wipe existing itineraries (no production users yet)
TRUNCATE TABLE composer_saved_itineraries;
TRUNCATE TABLE composer_shared_itineraries;

-- Drop legacy duration columns
ALTER TABLE composer_saved_itineraries DROP COLUMN IF EXISTS duration;
ALTER TABLE composer_shared_itineraries DROP COLUMN IF EXISTS duration;

-- Add time_block to shared_itineraries if not already present
ALTER TABLE composer_shared_itineraries
  ADD COLUMN IF NOT EXISTS time_block TEXT;

-- Enforce non-null going forward
ALTER TABLE composer_saved_itineraries
  ALTER COLUMN time_block SET NOT NULL;
ALTER TABLE composer_shared_itineraries
  ALTER COLUMN time_block SET NOT NULL;
