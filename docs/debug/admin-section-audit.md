# Admin Section Audit

## Feature Status Table

| Feature | Route | UI Component | Sheet ID | DB Table | v1-only cols | Auth | Current behavior | Fix? |
|---------|-------|-------------|----------|----------|-------------|------|-----------------|------|
| Reset onboarding | `/admin/onboarding` | AdminSection link | N/A | N/A | None | ✅ | **Works** | No |
| Health check | `GET /api/health` | AdminSection button | N/A | `composer_venues_v2` | None | ❌ Public | **Works** | No |
| Sync all venues | `POST /api/admin/sync-venues` | AdminSection button | **OLD** (`14SGR...`) | `composer_venues_v2` | `cash_only` | ✅ | **Wrong data** — reads old 494-venue sheet, overwrites v2 | **YES** |
| Venue lookup | `GET /api/admin/venue` | VenueLookup search | N/A | `composer_venues_v2` | None | ✅ | **Works** | No |
| Per-venue sync | `POST /api/admin/sync-venues {venue_id}` | VenueLookup sync button | **OLD** (`14SGR...`) | `composer_venues_v2` | `cash_only` | ✅ | **Wrong data** — venue_ids won't match v2 | **YES** |
| Fetch place data | `POST /api/admin/fetch-place-data` | **No UI** (orphaned) | N/A | `composer_venues_v2` | `google_place_data`, `google_data_updated_at` | ✅ | **Broken** — columns don't exist on v2 | **YES** |
| Fetch venue photos | `POST /api/admin/fetch-venue-photos` | **No UI** (orphaned) | N/A | `composer_venues_v2` | `google_place_data`, `google_place_photos` | ✅ | **Broken** — columns don't exist on v2 | **YES** |

## Diagnosis per broken feature

### Sync venues (bulk + per-venue) — WRONG DATA

- `GOOGLE_SHEET_ID` in `.env.local` = `14SGRyQHLkB3sDWWiet60801azPnjsyvmO9A0vmyFLa0` (old 494-venue sheet)
- Needs to be: `139gp-s2sBbEZbi4-6mrsMlhKykpoGWvuQdboMaAt20o` (new 1,458-venue sheet)
- `google-sheets.ts` reads range `Venues!A3:AH` — new sheet tab is `NYC Venues` with more columns (A3:CD)
- Route writes `cash_only` which doesn't exist on v2
- Column mapping in `rowToVenue()` is wrong — new sheet has different column positions (time_blocks at I, per-day blocks at J-P, etc.)

**Fix needed:**
1. Update `GOOGLE_SHEET_ID` in `.env.local` to new sheet
2. Update `google-sheets.ts` ranges: `Venues!A3:AH` → `NYC Venues!A3:CD`, `Venues!A2:AH2` → `NYC Venues!A2:CD2`
3. Rewrite `rowToVenue()` in sync-venues route to match v2 schema (add time_blocks, per-day blocks, corner fields, google fields; remove cash_only)
4. Add array column parsing for new fields (time_blocks, mon_blocks, etc.)

### Fetch place data — BROKEN (orphaned)

- Writes to `google_place_data` JSONB column — doesn't exist on v2
- Writes to `google_data_updated_at` — doesn't exist on v2
- V2 has Google Places data in flat columns (`google_rating`, `google_phone`, etc.) populated by the import script

**Fix:** Delete this route. No longer needed — v2 data is populated via `scripts/import_venues_v2.py`.

### Fetch venue photos — BROKEN (orphaned)

- Reads `google_place_data` to extract photo references — column doesn't exist on v2
- Writes to `google_place_photos` — column doesn't exist on v2
- Storage paths use `{venue_id}/` format, but v2 photos use `{google_place_id}/` format
- `image_keys` column is the new photo storage mechanism

**Fix:** Delete this route. V2 photos are backfilled via `scripts/backfill_venue_photos_v2.py` and stored in `image_keys`.

## Additional findings

### Health check stale test data
- Uses `occasion: "first_date"` in scoring test input, but questionnaire now uses `"dating"` as the occasion value
- Should update to match current taxonomy

### VenueLookup missing v2 fields
- Displays `duration_hours` but not v2 fields (`time_blocks`, `google_rating`, `image_keys`, `resy_venue_id`)
- Not broken, just incomplete

### No code duplication
- Admin routes and `scripts/import_venues_v2.py` are different codepaths
- Admin reads old sheet via `google-sheets.ts`; import script reads new sheet directly via Google API
- After fix, both should point to the same sheet

## File inventory

| File | Lines | Purpose |
|------|-------|---------|
| `src/app/api/admin/sync-venues/route.ts` | 234 | Sync venues from Google Sheet to DB |
| `src/app/api/admin/venue/route.ts` | 55 | Search venues by name |
| `src/app/api/admin/fetch-place-data/route.ts` | 104 | Fetch Google Places details (orphaned) |
| `src/app/api/admin/fetch-venue-photos/route.ts` | 121 | Fetch venue photos (orphaned) |
| `src/app/api/health/route.ts` | 217 | Three-layer diagnostic check |
| `src/app/admin/onboarding/page.tsx` | 36 | Admin onboarding reset |
| `src/app/profile/_components/AdminSection.tsx` | 223 | Admin UI with buttons |
| `src/app/profile/_components/VenueLookup.tsx` | 187 | Venue search + per-venue sync |
| `src/lib/google-sheets.ts` | 77 | Google Sheets API client |

## Priority

1. **Critical:** Update sheet ID + sync route before anyone hits "Sync all venues" (would overwrite v2 with stale v1 data)
2. **Cleanup:** Delete orphaned fetch-place-data and fetch-venue-photos routes
3. **Nice-to-have:** Update health check occasion, add v2 fields to VenueLookup
