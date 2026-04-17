-- Add venue_id column. Backfilled by the import script, then
-- constraints (NOT NULL + UNIQUE) are added in a follow-up after
-- the first successful import confirms all rows have values.

BEGIN;
ALTER TABLE composer_venues ADD COLUMN IF NOT EXISTS venue_id TEXT;
COMMIT;
