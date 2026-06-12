-- Lucky-itinerary persistence fix. The `inputs.mode` field on the
-- ItineraryResponse threads the entry mode ("questionnaire" / "lucky"
-- / "daily") through the analytics + render pipelines. The render
-- pipeline gates the inverted-crown visual treatment on
-- `inputs.mode === "lucky"` via `isLuckyItinerary()`.
--
-- The bug: composer_saved_itineraries stores the itinerary's inputs as
-- a set of TYPED COLUMNS (occasion / neighborhoods / budget / vibe /
-- day / start_time / time_block), NOT as a JSONB blob. There was no
-- `mode` column, so save.ts silently dropped `inputs.mode` on every
-- INSERT and saved-hydration.ts had no field to read on hydration.
-- Every reopened lucky saved itinerary lost its lucky theming.
--
-- (composer_shared_itineraries is not affected — it stores the full
-- ItineraryResponse as JSONB, so mode round-trips losslessly there.)
--
-- Nullable: legacy rows (every save prior to this migration) stay
-- NULL. The hydrator treats NULL as `undefined` on the inputs object,
-- which `isLuckyItinerary()` correctly resolves to false — legacy
-- saves render as standard, which is the honest behavior (we cannot
-- retroactively know which legacy saves were originally lucky).
-- New saves write the entry mode going forward.
--
-- Safe to re-run.

BEGIN;

ALTER TABLE composer_saved_itineraries ADD COLUMN IF NOT EXISTS mode TEXT;

COMMENT ON COLUMN composer_saved_itineraries.mode IS
  'Entry mode: "questionnaire" | "lucky" | "daily". Nullable for legacy rows that predate this migration; the hydrator maps NULL to undefined and isLuckyItinerary() treats undefined as not-lucky. New saves always populated.';

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════════════
-- BEGIN;
-- ALTER TABLE composer_saved_itineraries DROP COLUMN IF EXISTS mode;
-- COMMIT;
