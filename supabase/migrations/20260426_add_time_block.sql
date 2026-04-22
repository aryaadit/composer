-- Add time_block column to saved itineraries.
-- New saves store the time block slug; old rows keep duration only.
ALTER TABLE composer_saved_itineraries
ADD COLUMN IF NOT EXISTS time_block TEXT;
