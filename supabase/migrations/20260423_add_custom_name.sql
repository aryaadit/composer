-- Optional user-defined name for saved itineraries.
-- When set, displayed instead of the auto-generated title.
ALTER TABLE composer_saved_itineraries
ADD COLUMN IF NOT EXISTS custom_name TEXT;
