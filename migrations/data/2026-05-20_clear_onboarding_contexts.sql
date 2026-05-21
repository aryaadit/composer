-- Clear deprecated onboarding contexts. Run via Supabase SQL editor.
-- Column stays in place; we stop reading/writing it as of 2026-05-20.
--
-- This is a DATA migration, not a schema migration. It is intentionally
-- placed under migrations/data/ rather than supabase/migrations/ so
-- `supabase db push` does NOT pick it up. Run it once by hand against
-- the production DB after the code change ships.
--
-- Column note: composer_users.context is text[] NOT NULL DEFAULT '{}'
-- (see supabase/migrations/20260430000002_context_array.sql). NULL is
-- not a legal value, so we clear to the empty array rather than NULL.
UPDATE composer_users
SET context = '{}'
WHERE context <> '{}';
