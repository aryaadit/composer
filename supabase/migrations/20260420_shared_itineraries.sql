-- Shared itineraries — public-readable snapshots of a generated plan.
-- Created when a user clicks "Share" in the ActionBar. Anyone with the
-- link can view the plan; no auth required.
--
-- No RLS needed: the table uses a public SELECT policy so unauthenticated
-- visitors can view shared plans. INSERT is restricted to authenticated
-- users (the sharer must be signed in).

BEGIN;

CREATE TABLE IF NOT EXISTS composer_shared_itineraries (
  id TEXT PRIMARY KEY DEFAULT substr(gen_random_uuid()::text, 1, 8),
  itinerary JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE composer_shared_itineraries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read shared plans"
  ON composer_shared_itineraries FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can create shared plans"
  ON composer_shared_itineraries FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

COMMIT;
