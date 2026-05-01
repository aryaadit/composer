-- Verification artifact for migration tracking repair (followups item #1).
-- Confirms `supabase db push` works without manual workaround after the
-- 5 duplicate-version files were deduplicated.
--
-- Note on naming: the deduplicated files use 20260430* versions rather than
-- their original date prefixes because the Supabase CLI 2.75.0 has a
-- prefix-collision bug in `migration list` and `db push --dry-run` when
-- one version is a prefix of another. See docs/import-overhaul-followups.md
-- item #1 for full context.
--
-- This file's version is also non-default. `supabase migration new` would
-- have generated 20260501110953_…, which prefix-collides with the existing
-- 20260501 (Phase 2 venue import function) and triggers the same bug. Until
-- the Phase 2/3/4 8-digit rows (20260501, 20260502, 20260503) are themselves
-- migrated to longer versions, any new migration created on those exact
-- dates needs to be manually renamed. After 2026-05-04 the constraint
-- relaxes — auto-generated names won't collide.

SELECT 1 WHERE FALSE;
