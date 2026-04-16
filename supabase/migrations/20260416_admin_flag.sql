-- Add `is_admin` flag to composer_users for DB-driven admin gating.
-- Replaces the hardcoded ADMIN_EMAILS allow-list that lived in both
-- AdminSection.tsx and app/admin/onboarding/page.tsx.
--
-- Access is granted manually by flipping this column in the Supabase
-- SQL editor — never via the app. See CLAUDE.md for the one-liner
-- UPDATE template.
--
-- RLS is already correctly permissive: the existing "Users can read
-- own profile" policy lets a signed-in user read their own is_admin
-- value. Users can't read other users' profile rows, so admin status
-- isn't leaked. No policy changes needed.
--
-- Safe to re-run — `add column if not exists` is a no-op when the
-- column already exists.

BEGIN;

ALTER TABLE composer_users
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN composer_users.is_admin IS
  'DB-driven admin flag. Grant via: UPDATE composer_users SET is_admin = TRUE WHERE id = (SELECT id FROM auth.users WHERE email = ''…''); never set via the app.';

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK — uncomment only if the flag needs to be undone.
-- ═══════════════════════════════════════════════════════════════════════
-- BEGIN;
-- ALTER TABLE composer_users DROP COLUMN IF EXISTS is_admin;
-- COMMIT;
