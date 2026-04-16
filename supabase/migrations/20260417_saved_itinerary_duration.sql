-- Add `duration` to composer_saved_itineraries so a saved row can be
-- fully rehydrated into a renderable ItineraryResponse — including the
-- startTime/endTime that downstream UI (e.g. TextMessageShare) reads
-- via `inputs.startTime`. Without this, saved plans default to a
-- placeholder window when re-opened.
--
-- Default '3.5h' matches DEFAULT_DURATION in src/config/durations.ts
-- and is a sane backfill for rows saved before this column existed
-- (legacy rows lose their original window — acceptable since the
-- difference only affects share-text time formatting, not the
-- itinerary content itself).
--
-- Safe to re-run.

BEGIN;

ALTER TABLE composer_saved_itineraries
  ADD COLUMN IF NOT EXISTS duration TEXT NOT NULL DEFAULT '3.5h';

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════════════
-- BEGIN;
-- ALTER TABLE composer_saved_itineraries DROP COLUMN IF EXISTS duration;
-- COMMIT;
