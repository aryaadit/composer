-- composer_daily_picks — per-user, per-day cache for Tonight's Pick.
--
-- A daily seeded itinerary is generated lazily on the first authed
-- home view of the day and cached here so subsequent views all render
-- from the same row. No batch jobs, no cron.
--
-- One row per (user_id, pick_date). status="ready" carries the rolled
-- inputs + generated itinerary; status="failed" tombstones a day where
-- the seeded retries exhausted on 422 so the next view doesn't re-run
-- the whole 3-attempt cycle.
--
-- RLS: deny-all from the anon key. Service-role (server-side writes via
-- the daily-pick route handler) bypasses RLS, mirroring how the
-- composer_analytics_events table is protected.
--
-- Safe to re-run. Tables use IF NOT EXISTS. Policies dropped before
-- recreation because Postgres has no CREATE POLICY IF NOT EXISTS.

BEGIN;

CREATE TABLE IF NOT EXISTS composer_daily_picks (
  user_id          UUID NOT NULL
                   REFERENCES composer_users(id) ON DELETE CASCADE,
  -- Local NYC calendar date. Date column avoids timezone confusion in
  -- the unique key; the server is the single owner of the "what date
  -- is it for this user" decision.
  pick_date        DATE NOT NULL,
  -- "ready" → inputs + itinerary are NOT NULL.
  -- "failed" → both NULL; the row exists purely to suppress retries.
  status           TEXT NOT NULL CHECK (status IN ('ready', 'failed')),
  inputs           JSONB,
  itinerary        JSONB,
  -- Drives the once-per-day client-side impression emit. Server flips
  -- this from NULL to NOW() on the first read; the response carries a
  -- was_first_view boolean so the client knows when to fire
  -- daily_pick_viewed without consulting localStorage (the CLAUDE.md
  -- rule forbids it for analytics dedup too).
  first_viewed_at  TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, pick_date),
  -- Belt-and-suspenders: ready rows MUST have both payloads.
  CONSTRAINT composer_daily_picks_ready_has_payload CHECK (
    (status = 'ready' AND inputs IS NOT NULL AND itinerary IS NOT NULL)
    OR (status = 'failed' AND inputs IS NULL AND itinerary IS NULL)
  )
);

-- pick_date is the heavy filter on every fetch; the PK covers
-- (user_id, pick_date) already, so the explicit index below is for
-- the rare admin lookup by date alone (e.g. checking yesterday's
-- failure rate). Cheap on a low-traffic table.
CREATE INDEX IF NOT EXISTS composer_daily_picks_pick_date_idx
  ON composer_daily_picks (pick_date);

-- ─── RLS: deny-all from the anon key ──────────────────────────────
-- The client never reads or writes this table directly. The
-- /api/daily-pick route uses the service-role client. Same posture as
-- composer_analytics_events.
ALTER TABLE composer_daily_picks ENABLE ROW LEVEL SECURITY;

-- Drop any pre-existing policies before recreating (idempotent).
DROP POLICY IF EXISTS composer_daily_picks_no_select ON composer_daily_picks;
DROP POLICY IF EXISTS composer_daily_picks_no_insert ON composer_daily_picks;
DROP POLICY IF EXISTS composer_daily_picks_no_update ON composer_daily_picks;
DROP POLICY IF EXISTS composer_daily_picks_no_delete ON composer_daily_picks;

-- Empty USING/WITH CHECK = deny-all. No anon-key access via any verb.
CREATE POLICY composer_daily_picks_no_select ON composer_daily_picks
  FOR SELECT USING (false);
CREATE POLICY composer_daily_picks_no_insert ON composer_daily_picks
  FOR INSERT WITH CHECK (false);
CREATE POLICY composer_daily_picks_no_update ON composer_daily_picks
  FOR UPDATE USING (false) WITH CHECK (false);
CREATE POLICY composer_daily_picks_no_delete ON composer_daily_picks
  FOR DELETE USING (false);

COMMIT;
