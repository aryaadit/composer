-- Phase 1 fidelity fix. The questionnaire's time-block picker was
-- replaced by a five-value start-time pill (17:00 / 18:00 / 19:00 /
-- 20:00 / 21:00), but composer_saved_itineraries only had `time_block`
-- to store anything time-related, which the save path was hardcoding
-- to "evening". Result: a user who picked 21:00 reopened their plan
-- as 19:00. This migration adds the persistence slot that was missing.
--
-- Nullable: legacy rows (pre-this-migration) stay NULL and rely on the
-- existing `startTimeFromLegacyBlock(time_block)` mapping at hydrate time.
-- New rows always populate it.
--
-- time_block remains NOT NULL for now — code still writes "evening" to
-- it to satisfy the constraint. A future migration (not in this PR)
-- can drop NOT NULL and eventually drop the column once nothing reads
-- it.
--
-- Safe to re-run.

BEGIN;

ALTER TABLE composer_saved_itineraries  ADD COLUMN IF NOT EXISTS start_time TEXT;
ALTER TABLE composer_shared_itineraries ADD COLUMN IF NOT EXISTS start_time TEXT;

COMMENT ON COLUMN composer_saved_itineraries.start_time IS
  'User-chosen start time (e.g. "17:00"). Nullable for legacy rows that predate the column. New rows always populated.';
COMMENT ON COLUMN composer_shared_itineraries.start_time IS
  'User-chosen start time (e.g. "17:00"). Nullable for legacy rows that predate the column. New rows always populated.';

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════════════
-- BEGIN;
-- ALTER TABLE composer_saved_itineraries  DROP COLUMN IF EXISTS start_time;
-- ALTER TABLE composer_shared_itineraries DROP COLUMN IF EXISTS start_time;
-- COMMIT;
