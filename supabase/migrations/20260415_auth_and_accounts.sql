-- Introduces the account + persistence layer. Before this migration,
-- Composer was anonymous: user prefs and saved itineraries lived in
-- localStorage. This migration replaces that with Supabase Auth (magic
-- link) plus two server-owned tables protected by RLS.
--
-- Two tables:
--   1. composer_users                — profile (1:1 with auth.users)
--   2. composer_saved_itineraries    — saved plans (N:1 user)
--
-- Both inherit their row-level filter from `auth.uid()`. The anon key
-- (which the client uses) can only read/write the authenticated user's
-- own rows.
--
-- Safe to re-run. Tables use IF NOT EXISTS. Policies are dropped before
-- recreation because Postgres has no CREATE POLICY IF NOT EXISTS.

BEGIN;

-- ─── 1. Profile table ──────────────────────────────────────────────────
-- 1:1 with auth.users. The FK + CASCADE means deleting the auth user
-- (via Supabase Auth) cleans up the profile automatically. `id` is the
-- auth.users.id, so the profile is addressed by the same uuid the
-- session carries — no lookup gymnastics in the app.
CREATE TABLE IF NOT EXISTS composer_users (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  context         TEXT,
  drinks          TEXT,
  dietary         TEXT[] NOT NULL DEFAULT '{}',
  favorite_hoods  TEXT[] NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 2. Saved itineraries ──────────────────────────────────────────────
-- Structured columns capture the questionnaire inputs + human-readable
-- header so the home screen's saved-plans list can render without
-- unpacking the full `stops` jsonb. The `stops`, `walking`, and
-- `weather` columns hold the full itinerary payload so it can be
-- rehydrated exactly as generated.
CREATE TABLE IF NOT EXISTS composer_saved_itineraries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES composer_users(id) ON DELETE CASCADE,
  title           TEXT,
  subtitle        TEXT,
  occasion        TEXT,
  neighborhoods   TEXT[],
  budget          TEXT,
  vibe            TEXT,
  day             TEXT,
  stops           JSONB NOT NULL DEFAULT '[]',
  walking         JSONB,
  weather         JSONB,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 3. RLS ────────────────────────────────────────────────────────────
-- RLS is the only thing stopping the anon key from reading every row in
-- these tables. Enabling it with no policies = nobody can read anything.
-- Enabling it with the policies below = each user sees their own rows.
ALTER TABLE composer_users              ENABLE ROW LEVEL SECURITY;
ALTER TABLE composer_saved_itineraries  ENABLE ROW LEVEL SECURITY;

-- Profile policies
DROP POLICY IF EXISTS "Users can read own profile"    ON composer_users;
DROP POLICY IF EXISTS "Users can insert own profile"  ON composer_users;
DROP POLICY IF EXISTS "Users can update own profile"  ON composer_users;

CREATE POLICY "Users can read own profile"
  ON composer_users FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON composer_users FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON composer_users FOR UPDATE
  USING (auth.uid() = id);

-- Saved itinerary policies
DROP POLICY IF EXISTS "Users can read own itineraries"    ON composer_saved_itineraries;
DROP POLICY IF EXISTS "Users can insert own itineraries"  ON composer_saved_itineraries;
DROP POLICY IF EXISTS "Users can delete own itineraries"  ON composer_saved_itineraries;

CREATE POLICY "Users can read own itineraries"
  ON composer_saved_itineraries FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own itineraries"
  ON composer_saved_itineraries FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own itineraries"
  ON composer_saved_itineraries FOR DELETE
  USING (auth.uid() = user_id);

-- ─── 4. Helpful indexes ────────────────────────────────────────────────
-- Home screen lists a user's plans newest-first. This index makes that
-- query O(log n) per user.
CREATE INDEX IF NOT EXISTS composer_saved_itineraries_user_created_idx
  ON composer_saved_itineraries (user_id, created_at DESC);

COMMIT;

-- ─── Verification queries ──────────────────────────────────────────────
-- SELECT tablename, rowsecurity FROM pg_tables
-- WHERE schemaname = 'public' AND tablename LIKE 'composer_%';
--
-- SELECT policyname, cmd, qual FROM pg_policies
-- WHERE schemaname = 'public' AND tablename IN
--   ('composer_users', 'composer_saved_itineraries');

-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK — uncomment only if the migration needs to be undone.
-- Note: rolling this back destroys all saved itineraries and profiles.
-- ═══════════════════════════════════════════════════════════════════════
-- BEGIN;
-- DROP TABLE IF EXISTS composer_saved_itineraries;
-- DROP TABLE IF EXISTS composer_users;
-- COMMIT;
