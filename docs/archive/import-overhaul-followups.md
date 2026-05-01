# Import Overhaul Followups

Tracking work that emerged during the Phase 1–5 venue import overhaul.
All major items complete as of 2026-05-01. Item #5 (backfill empty
`statements` arrays) is optional cleanup; item #4 (audit retention
policy) is a future consideration.

## 1. Migration tracking repair (✅ complete)

Landed 2026-05-01. The duplicate-version filenames blocking `supabase
db push` were resolved.

- `20260414_venue_data_import.sql` → `20260430000001_venue_data_import.sql`
- `20260428_context_array.sql`     → `20260430000002_context_array.sql`
- `20260428_venue_image_keys.sql`  → `20260430000003_venue_image_keys.sql`

For each rename: `schema_migrations` row inserted via `supabase migration
repair --status applied <new_version>`. The repair populated `name` and
`statements` correctly (CLI parsed and stored the SQL — not the empty
arrays the Phase 2/3/4 manual psql workaround left behind).

The pre-existing `20260414` and `20260428` rows for `venue_card_enrichment`
and `composer_venues_v2` are unchanged. The orphan duplicates' DDL was
already in production — verified via column types, table existence, and
row counts before renaming. The repair is purely cosmetic from the
database's perspective; no SQL was applied or skipped.

`supabase db push` now works without manual psql workaround. Verified
end-to-end with a no-op test migration (`verify_migration_tracking_repair`,
left in the migrations directory as durable evidence).

### Note on rename versions and the prefix-collision bug

The first execution attempt used `20260414000001`, `20260428000001`,
`20260428000002` to preserve date-prefix continuity with the original
migrations. That broke. Supabase CLI 2.75.0 has a sort/comparison bug:
when one `schema_migrations` version is a prefix of another (e.g.,
`20260414` and `20260414000001`), `supabase migration list` and
`supabase db push --dry-run` produce false-positive errors and suggest
reverting the shorter version (which would be destructive — would
re-run the migration whose DDL is already in production).

The fix: rename to non-prefix-colliding versions. `20260430` was unused,
so all three orphans got `20260430000001`/`02`/`03` versions. The renames
don't reflect commit chronology — they're a tooling artifact, not a
semantic claim about when the migrations ran. Real chronology is in
`git log`.

### Constraint for future migrations

`supabase migration new` auto-generates a `YYYYMMDDHHMMSS` timestamp.
That format prefix-collides with the existing 8-digit Phase 2/3/4 rows
(`20260501`, `20260502`, `20260503`) — anything created via the CLI on
those exact dates triggers the same bug. Workaround: manually rename
the new file to a non-colliding version before pushing. After 2026-05-04
the constraint relaxes — auto-generated names won't collide with any
existing version.

A more permanent fix would be to also migrate the Phase 2/3/4 rows to
14-digit versions (see item #5). Not urgent — the date constraint is a
narrow window and well-documented now.

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

## 5. Backfill empty `statements` arrays in schema_migrations (optional)

Versions 20260501, 20260502, 20260503 (Phases 2/3/4 of the venue import
overhaul) have `statements = ARRAY[]::text[]` because they were applied
via direct psql, before the CLI workflow was unblocked. Functionally
fine — `supabase db push` accepts them. Only matters if `supabase db
reset` is ever needed (the prompt forbids it in normal operation), or
if you want a fully faithful migration history record.

The same fix would also unlock renaming those rows to 14-digit versions,
which would eliminate the auto-generated-migration date constraint
documented in item #1. Steps would be:

1. For each of `20260501`, `20260502`, `20260503`:
   - INSERT a new row with version `<date>120000` (or similar 14-digit form),
     `name` matching the file's suffix, and `statements` populated from the
     file contents
   - Rename the file on disk to match the new version
   - DELETE the old 8-digit row
2. Verify `supabase db push --dry-run` is clean

Low priority. Defer indefinitely unless a use case emerges.
