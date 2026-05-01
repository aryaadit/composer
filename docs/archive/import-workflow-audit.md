# Venue Import Workflow Audit

**Date:** 2026-05-01
**Scope:** Core import (sheet → `composer_venues_v2`). Excludes enrichment (Resy scrape, photo backfill, price-tier backfill).

## Summary

- **Two parallel implementations of the same import logic exist**: the Python CLI (`scripts/import_venues_v2.py`) generates SQL for psql; the API route (`src/app/api/admin/sync-venues/route.ts`) reimplements it from scratch using `supabase-js` upserts. They have already drifted (different column ranges, different default values, different skip rules).
- **No file/script handles deletes.** Both upsert; venues removed from the sheet stay active in the DB. Today's London-restaurant cleanup required a manual `TRUNCATE`.
- **`image_keys` is preserved by construction**, not by safety net — it's simply absent from `ALL_COLUMNS` in the importer. Any future column expansion that includes it would silently destroy photos on every import.
- **Sheet ID is hardcoded in 3 places** (Python script, TS route, env var), and the route validates `process.env.GOOGLE_SHEET_ID` against its own hardcoded `EXPECTED_SHEET_ID` — they can disagree silently. Local `.env.local`, Vercel env, and the constants must all be edited together for any sheet swap.
- **Auth is admin-gated for the route** (`is_admin` check on `composer_users`). The CLI has no auth gating beyond service-account secrets — anyone with `.env.local` can import.
- **No transaction boundaries.** The CLI emits one big `INSERT ... ON CONFLICT` (atomic if applied via psql); the route batches in chunks of 100 with no transaction wrapper, so a mid-batch failure leaves a partial state.
- **No audit trail.** Neither implementation records when an import ran, what changed, or who triggered it. The CSV snapshot from today's wipe is the only persisted artifact.

## Inventory

| File | Purpose | Invocation | Reads | Writes | Auth |
|---|---|---|---|---|---|
| `scripts/import_venues_v2.py` | Generate UPSERT SQL from sheet | CLI (`python3 …`) | Sheet `1EdJqv…` `NYC Venues!A2:CD` | Stdout or `--out FILE` (then manual psql) | `GOOGLE_SHEETS_CLIENT_EMAIL`+`GOOGLE_SHEETS_PRIVATE_KEY` env, fallback to `docs/palate-composer-67baf1d883e3.json` |
| `scripts/snapshot_image_keys.py` | One-time pre-wipe safety net | CLI manual | `composer_venues_v2.{google_place_id, image_keys}` | `docs/debug/image_keys_snapshot_<ts>.csv` | `SUPABASE_SERVICE_ROLE_KEY` env |
| `scripts/restore_image_keys.py` | One-time post-import recovery | CLI manual (passes CSV path) | CSV snapshot | `composer_venues_v2.image_keys` UPDATE WHERE `google_place_id` matches | `SUPABASE_SERVICE_ROLE_KEY` env |
| `scripts/generate-configs.py` | Regenerate `src/config/generated/*.ts` from sheet's Master Reference + venue counts | CLI (`npm run generate-configs`) | Sheet `Master Reference!A:K`, plus `composer_venues_v2.neighborhood` count | 6 TS files in `src/config/generated/` | Sheets env vars + Supabase service role for venue counts |
| `src/app/api/admin/sync-venues/route.ts` | Admin UI sync (full or single-venue) | `POST /api/admin/sync-venues` from `AdminSection` button or `VenueLookup` row | Sheet via `src/lib/google-sheets.ts` (`A2:BD2` headers, `A3:BD` data) | `composer_venues_v2` upsert via service-role client, batches of 100 | `is_admin = true` on `composer_users` (cookie session) + `GOOGLE_SHEET_ID === EXPECTED_SHEET_ID` |
| `src/lib/google-sheets.ts` | Sheets API wrapper used only by the route | called by route | `process.env.GOOGLE_SHEET_ID` sheet, `NYC Venues` tab | (read-only) | Sheets env vars; falls back to JSON key file |
| `src/app/profile/_components/AdminSection.tsx` | Admin UI button for full sync | rendered when `useAuth().isAdmin === true` | (calls API) | (calls API) | UI auth via `useAuth` + API enforces `is_admin` |
| `src/app/profile/_components/VenueLookup.tsx` | Admin UI single-venue resync from search results | rendered in admin section | (calls API) | (calls API) | same |
| `package.json` script `generate-configs` | npm-level alias for `python3 scripts/generate-configs.py` | `npm run generate-configs` | (delegates) | (delegates) | (delegates) |
| `scripts/import_venues.py` | **DEPRECATED v1** — reads xlsx, writes to `composer_venues` (not v2). Not part of current workflow. | Manual | `docs/composer_venue_sheet_curated.xlsx` | stdout SQL | none |

**No cron, no webhook, no scheduled job exists.** The only triggers are: developer running the CLI, or admin clicking the button in the profile page.

## `import_venues_v2.py` — current behavior

### 1. Pre-flight checks (`main`, lines 338-359)

- `argparse` for `--dry-run` and `--out` flags
- Loads `.env.local` lines into `os.environ` (only sets vars not already in env)
- **Compares `os.environ['GOOGLE_SHEET_ID']` against hardcoded `EXPECTED_SHEET_ID` (line 354)** — if both are present and differ, exits 1. If `GOOGLE_SHEET_ID` is unset entirely, the check passes silently (potential foot-gun if the env var disappears from `.env.local`).
- **Does NOT verify DB connectivity** — script never connects to the DB. It only emits SQL.
- **Does NOT verify sheet credentials before reading** — if creds are missing, fails inside `read_sheet()` with a generic error.

### 2. Read pattern (`read_sheet`, lines 34-83)

- Sheet ID **hardcoded at line 45** as `1EdJqvFKaGAAo5oKMXBXeXfZdzfdT9IsmLiQYA9whXVg` (NOT read from env). The env var is only used for the safety check above.
- Tab: `NYC Venues`
- Headers: `A2:CD2` (row 2)
- Data: `A3:CD` (row 3 onward)
- `CD` = column 82 (Python script reads up to col 82; route reads up to col 56 — see divergence below)
- Headers are lower-cased + trimmed before use as dict keys.

### 3. Transform (`transform_row`, lines 174-229)

- Skips rows missing `venue_id` or `name` (returns None)
- Skips rows where `active` is not exactly "yes" or "no" (lower-cased) — line 187. **This means a row with `active=True`, `active=1`, or empty active is skipped entirely.**
- `neighborhood` defaults to `"unknown"` if empty (line 192) — this is risky; `"unknown"` would never match any user-selected neighborhood and the venue effectively becomes unselectable.
- Type coercion via `parse_bool / parse_int / parse_float / parse_array / parse_date / clean_str` helpers (lines 90-144)
- `parse_date` handles ISO dates and Excel serial numbers
- `parse_array` defensively splits on both `,` and `|`
- Boolean parsing accepts `yes/true/y/1` or `no/false/n/0`; everything else → None

### 4. Operation (`generate_sql`, lines 305-331)

- **UPSERT** via `INSERT INTO composer_venues_v2 (...) VALUES (...) ON CONFLICT (venue_id) DO UPDATE SET ...`
- Conflict key: `venue_id` (must be the unique constraint on the table)
- All columns in `ALL_COLUMNS` (line 261-277) are written
- `RESY_COALESCE_COLUMNS = {reservation_platform, resy_venue_id, resy_slug}` (line 280) use `COALESCE(EXCLUDED.x, composer_venues_v2.x)` so an empty sheet value doesn't wipe a previously-scraped Resy ID. **Only those three columns get this treatment.** All other columns including `price_tier` will be overwritten with NULL if the sheet is empty for them.

### 5. Coverage — columns NOT written

`ALL_COLUMNS` (lines 261-277) lists 56 columns. Compared against the v2 schema, **`image_keys` is the only DB column NOT in the importer's write list**. By design — preserves photos across upserts. No other DB columns are excluded.

The `id` (UUID primary key), `created_at`, and `updated_at` are also implicit DB-managed columns not in the sheet.

### 6. Deletion handling

**None.** Rows in DB whose `venue_id` is not in the sheet are NOT touched. They persist with their existing `active` value. To "delete" a venue you must either:
- Set `active=no` in the sheet for that row, OR
- Run a manual `DELETE FROM composer_venues_v2 WHERE venue_id = '…'`, OR
- Wipe the table (today's pattern)

This is the source of the London-restaurants problem flagged in `docs/new-sheet-audit.md`.

### 7. Failure modes

- **Mid-import failure:** the entire SQL is one statement (single `INSERT ... ON CONFLICT`). When applied via psql, it's atomic — either all 1314 rows commit or none do. So mid-batch partial state is impossible IF the SQL was written to a file and applied with psql in a single transaction. (The route, by contrast, batches and is NOT atomic — see Section 3.)
- **Malformed sheet row:** row is silently skipped, listed in `skipped` array, printed to stdout. First 20 reported.
- **Missing lat/lng:** row IS imported, added to `warnings` array. Itinerary generation will likely break for these.
- **Sheet auth failure:** crash with a generic error from googleapiclient.

### 8. Logging

- Stdout only (no log file)
- Reports: header count, data row count, total rows, active/import count, skipped count, Resy-data count, warning count
- Lists first 20 skipped rows + first 20 warnings
- No timestamps, no record of what changed, no record of which rows were INSERTs vs UPDATEs

### 9. Rollback

- If applied via psql in a single statement, atomic — either fully commits or fully rolls back on error.
- If applied via the dashboard SQL editor, depends on the editor's transaction handling — typically also atomic per query.
- **No "undo this import" capability.** Once committed, you'd need to re-import an older sheet snapshot.

### 10. Idempotency

- Yes — running the script twice with the same sheet produces the same DB state. UPSERT guarantees this for unchanged rows. Side note: `updated_at` (if managed by a DB trigger) would still bump on the no-op UPDATE.

## `/api/admin/sync-venues` route — current behavior

### Auth (`requireAdmin`, lines 16-31)

- Reads session via `getServerSupabase().auth.getUser()`
- Returns 401 if no user
- Queries `composer_users.is_admin` for the user; returns 403 if false
- Returns `true` on success

### Sheet ID validation (lines 176-186)

- Hardcoded `EXPECTED_SHEET_ID = "1EdJqv…"` at line 170
- If `process.env.GOOGLE_SHEET_ID !== EXPECTED_SHEET_ID`, returns 500 with diagnostic
- **Note:** this checks env vs hardcoded, not env vs script. The Python script and the TS route each have their own `EXPECTED_SHEET_ID`. They could disagree without anyone noticing until one of them fires.

### Two modes (line 189-278)

**Single-venue sync** (`body.venue_id` present): finds the matching row by venue_id index, transforms, upserts one row.

**Full sync** (no body or empty body): reads all rows, transforms via `rowToVenue`, batches in chunks of 100, upserts each batch.

### Read pattern via `src/lib/google-sheets.ts`

- `getSheetHeaders()` — `NYC Venues!A2:BD2` (col 56)
- `getSheetData()` — `NYC Venues!A3:BD` (col 56)
- **Divergence from CLI**: CLI reads to `CD` (col 82), route reads to `BD` (col 56). New sheet has 56 actual columns + 16 trailing empty cols, so today they're equivalent. **If a 57th column ever gets added, the route silently truncates while the CLI picks it up.**

### Transform (`rowToVenue`, lines 70-164)

- Maps row array to a venue object via the column index map (built dynamically from headers — robust to column reorders)
- **Required fields are different from the CLI:**
  - Both require `venue_id` and `name`
  - **Route additionally requires `latitude` AND `longitude`** (lines 83-85). Missing → row is silently dropped.
  - **CLI imports rows missing lat/lng** but adds a warning.
- **`active` defaults are different:**
  - **Route: `parseBool(get("active") ?? undefined) ?? true`** (line 129) — empty/unparseable → `true`
  - **CLI: returns None and SKIPS the row** if active is unparseable (line 187)
- **`quality_score` and `curation_boost` defaults are different:**
  - **Route: `parseNum(...) ?? 7` for quality_score, `?? 0` for curation_boost** (lines 119-120)
  - **CLI: parses as int with no default** — would be NULL in DB
- **Currated_by lowercased in route** (line 121); **CLI just trims** (no case change)

### Operation

- Service-role Supabase client via `getServiceSupabase()` (bypasses RLS)
- `.upsert(venue, { onConflict: "venue_id" })` for single
- `.upsert(batch, { onConflict: "venue_id" })` per batch of 100
- **Per-batch error returns the partial `synced` count and stops.** Earlier batches have already committed. **No rollback.** This is the most important divergence from the CLI atomic SQL.

### Coverage

Same column set as CLI minus `id` / `created_at` / `updated_at`. Includes everything in the v2 schema except `image_keys`. (The `image_keys` column is simply absent from the `rowToVenue` return — survives upserts.)

### Failure modes

- **No-headers / missing required cols** → returns 400
- **Sheet read crash** → caught, returns 500 "Sync failed"
- **Single venue not found** → 404
- **Batch upsert error mid-import** → returns 500 with partial `synced` count; **DB is left in mixed-state with first N batches committed, remaining not**

### Logging

- `console.error` on auth failure, batch errors, and unexpected crashes
- No success log (the response itself is the only success signal)
- No record of what was added/updated

### UI

- `src/app/profile/_components/AdminSection.tsx` has a button that POSTs `{}` (full sync). Shows status: idle / syncing / done / error.
- `src/app/profile/_components/VenueLookup.tsx` per-row "sync" button POSTs `{ venue_id: "..." }` for single-venue resync.

### Feature parity vs CLI

Diverges. Notable differences:

| Aspect | CLI | Route |
|---|---|---|
| Sheet column range | `A:CD` (82 cols) | `A:BD` (56 cols) |
| Empty `active` flag | Skips row | Defaults to `true` |
| Missing lat/lng | Imports + warns | Skips row |
| `quality_score` empty | NULL | Defaults to 7 |
| `curation_boost` empty | NULL | Defaults to 0 |
| `curated_by` casing | preserved | lower-cased |
| Resy fields when sheet empty | `COALESCE` (preserves DB value) | overwrites with NULL |
| Atomicity | Single statement (atomic via psql) | Batched, NOT atomic |
| Output | SQL file for manual apply | Direct DB write |

The Resy-COALESCE divergence is particularly interesting — the route would clobber Resy IDs on every full sync, the CLI preserves them.

## `generate-configs.py` — current behavior

### Output files

Six TS files in `src/config/generated/`:
- `vibes.ts` — `VIBE_VENUE_TAGS`, `VIBE_DISPLAY_LABELS`, `SCORED_VIBE_TAGS`, `CROSS_CUTTING_VIBE_TAGS`
- `neighborhoods.ts` — `NEIGHBORHOOD_GROUPS` (with venueCount baked in), `ALL_NEIGHBORHOODS`
- `stop-roles.ts` — `ROLE_EXPANSION`, `ALL_STOP_ROLES`
- `budgets.ts` — `BUDGET_TIERS`
- `occasions.ts` — `OCCASIONS`
- `categories.ts` — `CATEGORIES`

### Inputs

- Google Sheet `Master Reference` tab columns A–K (one column per taxonomy)
- Supabase `composer_venues_v2.neighborhood` (counts per slug, baked into the `venueCount` field on each `NEIGHBORHOOD_GROUPS` entry)
- Hardcoded constants in the script for: `NEIGHBORHOOD_GROUPS` definition (group → slugs mapping), `VIBE_SCORING_MATRIX`, `BUDGET_TIERS`, `STOP_ROLE_EXPANSION`

### When to run

- After **taxonomy changes in the sheet** (new vibe tag, new category, new occasion). The bedrock data the questionnaire uses comes from these files.
- After **venue add/remove** that materially shifts neighborhood venue counts (the picker hides groups < 50 venues — if a group's count crosses that threshold, regenerating updates the picker).
- **Independent of the venue import.** Today's wipe-and-replace did NOT regenerate configs because the Master Reference tab was identical between the old and new sheets.

### Idempotent

Yes — running twice produces the same files (with a fresh timestamp in the auto-generated header).

### Quirks

- It pages through Supabase for venue counts (1000-row default) — see `fetch_venue_counts_by_neighborhood` (script lines ~85-105). Correct, but not noted in any docstring.
- If Supabase env vars are missing or supabase-py isn't installed, the script logs a warning and proceeds with empty counts — every group gets `venueCount: 0`, which would hide every group from the picker. Soft fail with downstream consequences.

## Today's wipe-and-replace flow (reference)

What was actually run on 2026-05-01 to swap from the old sheet to the new one:

1. **Snapshot image_keys** — `python3 scripts/snapshot_image_keys.py` → produced `docs/debug/image_keys_snapshot_20260501_055902.csv` with 1,451 rows
2. **Update SHEET_ID in 5 places (manual sed)**:
   - `.env.local` line 12 (`GOOGLE_SHEET_ID=…`)
   - `scripts/import_venues_v2.py` lines 5, 45, 354
   - `scripts/generate-configs.py` line ~33
   - `scripts/scrape_resy_v2.py` line ~30
   - `src/app/api/admin/sync-venues/route.ts` line 170
3. **TRUNCATE composer_venues_v2** — manual `pg` connection, raw SQL
4. **Run importer + apply SQL** — `python3 scripts/import_venues_v2.py --out /tmp/import_v2.sql`, then `pg.query(sql)` — produced 1,314 rows in the DB
5. **Restore image_keys** — `python3 scripts/restore_image_keys.py docs/debug/image_keys_snapshot_20260501_055902.csv` → 1,327 updated, 124 not-found (venues that were removed in the new sheet)

Of these, **only Step 4 is part of the standard `import_venues_v2.py` workflow**. Steps 1, 3, and 5 were one-time scaffolding for the sheet swap. Step 2 is a coordination tax that fires every time the sheet ID changes.

The sequence revealed gaps: (a) the importer doesn't preserve image_keys via a snapshot natively, (b) the importer doesn't deactivate orphans, (c) sheet ID lives in too many places, (d) `--execute` flag was dead code (now removed), (e) Vercel env vars need separate update + redeploy.

## Failure mode catalog

| Scenario | Current behavior | Safe? | Notes |
|---|---|---|---|
| Sheet has 0 rows (empty export) | CLI: prints "No venues to import" and exits without producing SQL. Route: returns 400 "No valid venues found in sheet". | Yes | Both no-op cleanly. |
| Sheet adds new column | CLI reads `A:CD` (col 82) — picks up new col only if it has a `transform_row` mapping; otherwise data is read but ignored. Route reads `A:BD` (col 56) — silently drops cols 57+. | Mixed | If new column should be imported, both implementations need code update (map header → DB column). Route silently misses cols >56 even with code update. |
| Sheet adds new vibe tag value not in Master Reference | Imported as-is — both paths just write the array. No validation against Master Reference. Itinerary scoring would treat unknown tags as zero-overlap. | Mostly | Won't crash. Tag is silently ignored by scorer. Master Reference validation isn't part of import. |
| DB has rows sheet doesn't | Both: untouched. Stays `active=true` forever. | **NO** | Source of the London-restaurants bug. Today's manual TRUNCATE was the only fix. |
| Network failure mid-import | CLI: emits SQL to file regardless; psql apply is atomic. Route: returns partial `synced` count, leaving DB in mixed state. | CLI yes / Route NO | Route is the more dangerous path here. |
| `google_place_id` duplicates between rows | No constraint enforced. Both rows would be inserted (different `venue_id`). `image_keys` snapshot/restore would assign the same keys to both. | Sort of | Importer doesn't catch this. Visible side effects only at photo restore time. |
| Sheet column header changes name | CLI: row dict misses the renamed key — produces NULL for that field. Same for route. | No | Silent. Best-case the column becomes empty; worst-case a required field (lat/lng) drops, route silently skips that venue. No "schema validation" step. |
| Importer crashes after 500 of 1300 rows | CLI: doesn't crash mid-import — it generates SQL upfront, doesn't talk to DB. Route: 500 → returns partial `synced=500`, no rollback. Next 800 not committed; first 500 already are. | CLI yes / Route NO | The route's lack of transaction is the critical gap. |
| Reid runs import twice in a row | Both: idempotent — second run is a no-op (UPSERT with same values). | Yes | Safe. |
| Sheet ID is wrong (e.g., points at SF data) | CLI: rejects if `GOOGLE_SHEET_ID` env var doesn't match the hardcoded `EXPECTED_SHEET_ID`. **But if env var is unset, it proceeds and reads whatever the hardcoded ID points at.** Route: same check, also rejects on mismatch. **Both rely on the developer keeping the hardcoded ID and env in sync.** | Partially | Catches mismatch between env and code, doesn't catch a stale code constant alone. |

## Gaps for future workflow

Ordered by impact:

1. **Two divergent implementations of the same logic.** The Python CLI and the TS route do the same thing differently — different defaults, different column ranges, different atomicity, different value handling. Picking one as canonical and routing the other through it (or just deleting one) would eliminate a class of "which one did I run" confusion.

2. **No deletion / deactivation handling.** Venues removed from the sheet stay active in the DB indefinitely. London-restaurants was discovered by audit, not by the system. A "diff: in DB but not in sheet" check belongs in the import flow.

3. **Route batches without a transaction.** A network blip or row-level error mid-import leaves the DB in mixed state. The CLI's "one big atomic SQL" approach is safer; the route should match it (or use Postgres transactions explicitly).

4. **`image_keys` preservation is a structural assumption, not a guarantee.** It's safe today only because the column is omitted from `ALL_COLUMNS`. If anyone ever adds it (because it sounds like it should be in the import) without realizing, every import would nuke photos. A test or assertion would prevent this.

5. **Sheet ID lives in 5+ places.** Every sheet swap requires coordinated edits across `.env.local`, Vercel env, and 3 source files. Should live in one place (env var, validated by code that fails fast if missing).

6. **No diff preview.** Before applying an import, the operator can't see "this run will change 50 rows, add 2, delete 0" — the CLI just generates SQL with no semantic summary; the route just applies. A dry-run that reports "5 rows will newly become inactive, 12 rows have material field changes" would catch surprises.

7. **No verification step post-import.** Today's verification was ad-hoc: count rows, check for London addresses. A scripted verification (row count matches sheet, no unexpected duplicates, expected enrichment fields like `image_keys` still populated) would be repeatable.

8. **No audit trail.** No log of when an import ran, who triggered it, what changed. The CSV snapshot from today is the only record.

9. **Generate-configs is decoupled from imports.** Sometimes you need both (taxonomy + venues changed); sometimes only one. No script currently sequences "if Master Reference changed, regenerate; if Venues tab changed, import; otherwise skip." Operator has to remember.

10. **CLI emits SQL but doesn't apply it.** Three steps every time: generate, save to file, apply via psql. A `--apply` flag with safety prompts would compress this to one command.

11. **Default values differ between paths.** CLI returns NULL for empty `quality_score`; route returns 7. CLI requires explicit `active=yes/no`; route defaults to `true`. These behaviors should be specified once and reused.

12. **`neighborhood` defaults to `"unknown"` when empty in the CLI** (line 192). This is an effectively-unselectable venue. Should fail loud, not silently insert with a pseudo-slug.

13. **`generate-configs.py` soft-fails on missing Supabase creds** — every neighborhood group ends up with `venueCount: 0`, which hides every group from the picker. Should fail loud rather than silently degrade.

## Open design questions

1. **Should the canonical importer be the Python CLI, the TS route, or a new shared module?** Today's parallel implementations guarantee drift. Options: (a) deprecate the route and have the admin button shell out to the CLI via a server action; (b) deprecate the CLI and have the route be the source of truth; (c) extract a shared TS module both consume.

2. **Should the importer deactivate rows missing from the sheet, or just flag them?** Auto-deactivation is destructive but matches the implicit contract (sheet = source of truth). Flagging requires the operator to act. Auto with a confirmation step is a middle ground.

3. **Should `image_keys` be moved into the sheet, or kept as a DB-only column with formal preservation?** Right now it's preserved by accident (omission from `ALL_COLUMNS`). Either path makes that intent explicit.

4. **Should the sheet ID be the only configurable knob, with everything else hardcoded?** Or should sheet name, header row, data start row, etc. all be configurable too?

5. **Should the route batch-upsert wrap in a transaction (`supabase.rpc`-style)?** Or should the route emit SQL and have a separate apply step like the CLI?

6. **Should imports require a snapshot first (always, not just for wipes)?** Cheap insurance against a bad import. Restore-from-snapshot would be a real undo path.

7. **Should the admin button on the profile page even exist, given the divergence risk?** Or should imports always go through the CLI for traceability?

8. **Should a successful import bump a `last_imported_at` timestamp somewhere?** No record of "when did production data last refresh" exists today.

9. **Should `generate-configs` be folded into the import flow** when the Master Reference tab changes, so the two never go out of sync?

10. **Where should sheet ID live?** Env var only, code constant only, or both with a validation step? Today both exist and can disagree silently.
