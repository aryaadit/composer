# Import Overhaul Followups

Tracking work that emerged during the Phase 1–5 venue import overhaul.
The overhaul itself is complete as of 2026-05-01; the only meaningful
remaining item is migration tracking repair (#1), which is a chronic
infra issue that wants its own session.

## 1. Migration tracking repair

**Problem.** The repo has duplicate-version migration filenames (two
`20260414_*`, three `20260428_*`) and `supabase_migrations.schema_migrations`
has a single-column primary key on `version`. Result: `supabase db push` is
permanently blocked. Phases 2, 3, and 4 each applied their migration via
direct psql against the pooler URL with a manual `INSERT INTO schema_migrations`
to record the version.

**Why it matters.** Every future migration requires the same workaround.
That's the kind of thing that fails at 11pm when you've forgotten the dance.
The current system also can't tell you cleanly which migrations have been
applied versus pending.

**Resolution sketch.** Rename the duplicate-version files to unique
versions. Coordinate a `supabase migration repair` so the renamed entries
don't re-run their SQL (the underlying objects are already in production).
Verify `supabase db push` works on a no-op migration before declaring done.

## 2. Phase 5: cutover (✅ complete)

Landed 2026-05-01. New admin route shipped in Phase 5a; legacy code
deleted in Phase 5b.

- Admin route at `src/app/api/admin/sync-venues/route.ts` is now a thin
  wrapper around `runApply()` / `runApplySingleVenue()` from `src/lib/venues/`
- Admin UI walks operator through preview → apply with sanity assertions,
  diff samples, deactivation counts, and threshold guards
- Audit table `composer_import_runs` records every apply attempt with
  `triggered_by` set to the user's UUID for route-driven runs and `'cli'`
  for CLI runs
- Deleted: `scripts/import_venues_v2.py`, `scripts/import_venues.py`,
  `src/lib/google-sheets.ts`
- All `EXPECTED_SHEET_ID` constants removed; sheet identity is validated
  by the operator via the preview panel

## 3. Refresh source-sheet-ID comments in generated configs (✅ complete)

Refreshed during Phase 5b. `src/config/generated/*.ts` header comments
now reference the current sheet ID. The regeneration also picked up
real venue-count drift in the `NEIGHBORHOOD_GROUPS.venueCount` fields
(the previous snapshot was taken against the pre-swap sheet and was
slightly stale) — the new counts reflect actual current DB state.

## 4. Audit table cleanup policy (eventually)

The `composer_import_runs` table will grow unbounded. At current import
cadence (occasional, operator-driven) this is fine for years. If cadence
increases or runs become noisy, add a retention policy (e.g., delete
success rows older than 1 year, keep failures forever). Not urgent.
