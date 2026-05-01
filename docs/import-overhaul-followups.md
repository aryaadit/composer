# Import Overhaul Followups

Tracking work that emerged during the Phase 1–4 venue import overhaul.
Items here are NOT blockers for completing the overhaul — they're cleanup
that should land before, during, or shortly after Phase 5 (cutover).

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

## 2. Phase 5: cutover

When the data layer is stable (post-Phase 4):

- Replace `src/app/api/admin/sync-venues/route.ts` contents with a thin
  wrapper around `runApply()` from the new module
- Pass real `triggered_by` (user UUID) and `trigger_source` (`'route:admin-button'`
  or similar) into the audit recording
- Rewire `AdminSection.tsx` and `VenueLookup.tsx` to the new response shape
- Delete `scripts/import_venues_v2.py` and `scripts/import_venues.py`
- Delete `src/lib/google-sheets.ts`
- Grep for stragglers referencing the deleted files

Verification: admin button works end-to-end, single-venue resync works,
audit table records route-triggered runs with correct user_id.

## 3. Refresh source-sheet-ID comments in generated configs

`src/config/generated/*.ts` files have header comments referencing the
old (decommissioned) sheet ID `139gp-...`. The data is current; only the
comment is stale. Fix by running `npm run generate-configs` once.

## 4. Audit table cleanup policy (eventually)

The `composer_import_runs` table will grow unbounded. At current import
cadence (occasional, operator-driven) this is fine for years. If cadence
increases or runs become noisy, add a retention policy (e.g., delete
success rows older than 1 year, keep failures forever). Not urgent.
