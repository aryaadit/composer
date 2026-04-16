-- Convert every stored neighborhood slug + group id from hyphenated to
-- snake_case so DB values match the new canonical taxonomy in
-- src/config/neighborhoods.ts. Touches four locations:
--
--   1. composer_venues.neighborhood            (text, ~300 rows)
--   2. composer_saved_itineraries.neighborhoods (text[], few rows)
--   3. composer_saved_itineraries.stops         (jsonb, nested
--      .venue.neighborhood and .plan_b.neighborhood per stop)
--   4. composer_users.favorite_hoods            (text[], stores
--      group ids — also hyphenated, also converted)
--
-- All replacements use REPLACE(s, '-', '_'). The slug taxonomy never
-- legitimately contains a hyphen that should stay (no "north-east-2"
-- type slugs), so a global swap is safe and idempotent — re-running
-- against already-converted data is a no-op.

BEGIN;

-- ─── 1. composer_venues.neighborhood ────────────────────────────────
UPDATE composer_venues
SET neighborhood = REPLACE(neighborhood, '-', '_')
WHERE neighborhood LIKE '%-%';

-- ─── 2. composer_saved_itineraries.neighborhoods (text[]) ───────────
UPDATE composer_saved_itineraries
SET neighborhoods = ARRAY(
  SELECT REPLACE(n, '-', '_')
  FROM unnest(neighborhoods) AS n
)
WHERE neighborhoods IS NOT NULL
  AND EXISTS (SELECT 1 FROM unnest(neighborhoods) AS n WHERE n LIKE '%-%');

-- ─── 3. composer_saved_itineraries.stops (jsonb) ────────────────────
-- Each stop has shape { role, venue: { ..., neighborhood }, plan_b:
-- { ..., neighborhood } | null, ... }. Walk every stop and rewrite
-- both venue.neighborhood and plan_b.neighborhood when present.
UPDATE composer_saved_itineraries
SET stops = (
  SELECT COALESCE(jsonb_agg(updated_stop), '[]'::jsonb)
  FROM (
    SELECT CASE
      -- stop has plan_b with a neighborhood: rewrite both
      WHEN stop ? 'venue'
       AND stop -> 'venue' ? 'neighborhood'
       AND stop ? 'plan_b'
       AND stop -> 'plan_b' IS NOT NULL
       AND jsonb_typeof(stop -> 'plan_b') = 'object'
       AND stop -> 'plan_b' ? 'neighborhood'
      THEN jsonb_set(
             jsonb_set(
               stop,
               '{venue,neighborhood}',
               to_jsonb(REPLACE(stop -> 'venue' ->> 'neighborhood', '-', '_'))
             ),
             '{plan_b,neighborhood}',
             to_jsonb(REPLACE(stop -> 'plan_b' ->> 'neighborhood', '-', '_'))
           )
      -- stop has only venue.neighborhood
      WHEN stop ? 'venue'
       AND stop -> 'venue' ? 'neighborhood'
      THEN jsonb_set(
             stop,
             '{venue,neighborhood}',
             to_jsonb(REPLACE(stop -> 'venue' ->> 'neighborhood', '-', '_'))
           )
      ELSE stop
    END AS updated_stop
    FROM jsonb_array_elements(stops) AS stop
  ) AS rewritten
)
WHERE stops IS NOT NULL
  AND jsonb_typeof(stops) = 'array'
  AND jsonb_array_length(stops) > 0
  AND stops::text LIKE '%-%';

-- ─── 4. composer_users.favorite_hoods (text[]) ──────────────────────
-- These are NEIGHBORHOOD_GROUPS ids, not storage slugs. Group ids also
-- migrated from hyphen to underscore (e.g. "soho-nolita-tribeca" →
-- "soho_nolita_tribeca", "midtown-hk" → "midtown_hk").
UPDATE composer_users
SET favorite_hoods = ARRAY(
  SELECT REPLACE(h, '-', '_')
  FROM unnest(favorite_hoods) AS h
)
WHERE favorite_hoods IS NOT NULL
  AND EXISTS (SELECT 1 FROM unnest(favorite_hoods) AS h WHERE h LIKE '%-%');

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
-- VERIFICATION (read-only, run after COMMIT to confirm)
-- ═══════════════════════════════════════════════════════════════════════
-- SELECT count(*) AS venues_with_hyphen FROM composer_venues
--   WHERE neighborhood LIKE '%-%';
-- SELECT count(*) AS saved_with_hyphen FROM composer_saved_itineraries
--   WHERE EXISTS (SELECT 1 FROM unnest(neighborhoods) n WHERE n LIKE '%-%');
-- SELECT count(*) AS stops_with_hyphen FROM composer_saved_itineraries
--   WHERE stops::text LIKE '%-%';
-- SELECT count(*) AS users_with_hyphen FROM composer_users
--   WHERE EXISTS (SELECT 1 FROM unnest(favorite_hoods) h WHERE h LIKE '%-%');
-- All four should return 0.

-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK — uncomment to undo the slug conversion. Note the rollback
-- is lossy if any post-migration code wrote a slug that legitimately
-- contained an underscore (it doesn't today, but the rollback would
-- collapse those too). Migration history is the safer rollback path.
-- ═══════════════════════════════════════════════════════════════════════
-- BEGIN;
-- UPDATE composer_venues SET neighborhood = REPLACE(neighborhood, '_', '-');
-- UPDATE composer_saved_itineraries
--   SET neighborhoods = ARRAY(SELECT REPLACE(n, '_', '-') FROM unnest(neighborhoods) n);
-- UPDATE composer_users
--   SET favorite_hoods = ARRAY(SELECT REPLACE(h, '_', '-') FROM unnest(favorite_hoods) h);
-- (jsonb stops rollback omitted — same walk in reverse)
-- COMMIT;
