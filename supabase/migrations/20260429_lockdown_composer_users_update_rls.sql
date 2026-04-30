-- Lock down composer_users updates to service-role only.
--
-- Before this migration, authenticated users could UPDATE their own row
-- directly from the browser. This bypassed server-side validation for
-- name (profanity), context, dietary, and drinks values.
--
-- After this migration, the only path that succeeds for UPDATE is the
-- service-role client used by /api/profile (PATCH), which validates
-- payloads server-side via validateProfilePayload().
--
-- SELECT and INSERT policies are preserved:
--   - SELECT: header greeting + profile page read
--   - INSERT: onboarding via upsertProfile() in lib/auth.ts
--
-- If a future code path needs to update composer_users from the browser,
-- it must route through /api/profile (or get a new API route added).

DROP POLICY IF EXISTS "Users can update own profile" ON composer_users;
