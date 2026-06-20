# Venue columns removal audit — 2026-06-18

## Scope

For each of these 28 candidate-for-removal column names, locate every reference across `src/`, `scripts/`, `supabase/`, `src/config/`, and `tests/`, and classify each as one of:

- **(a) INVENTORY** — `src/lib/venues/columns.ts` (ALL_V2_COLUMNS + metadata sets) or a Supabase schema migration (treated as inventory-class, definitional)
- **(b) TYPE** — `src/types/index.ts` (Venue interface)
- **(c) TEST** — anything under `tests/` (stubs / fixtures, not load-bearing usage)
- **(d) WRITER** — `placesToRow`, the add-venue route, or a scraper that only writes the column
- **(e) CONSUMER** — anything that READS the value for logic or display

Columns:

```
verified, reservation_lead_days, last_updated, curated_by, notes,
corner_id, corner_photo_url, guide_count, source_guides, all_neighborhoods,
content_tier, original_neighborhood, split_hours,
open_mon, open_tue, open_wed, open_thu, open_fri, open_sat, open_sun,
close_mon, close_tue, close_wed, close_thu, close_fri, close_sat, close_sun
```

## Method

```
rg -n '\b(<col1>|<col2>|...)\b' src/ scripts/ supabase/ tests/
```

Word boundaries (`\b`) keep `verified` from picking up `last_verified` (since `_` is a word character, there's no `\b` between `_` and `v`). `src/config/` had zero hits.

Three classes of grep hits were filtered out as false positives or unrelated columns:

- **English-word matches** (not the column): `scripts/refresh_google_places_data.py:67`, `src/lib/auth.ts:37`, `src/lib/venues/places-to-row.ts:257` ("operator never **verified**"); `src/lib/claude.ts:121` ("DB curation **notes**"); `src/lib/venues/sheet-write.ts:567` ("operator **notes**").
- **Different `notes` column** in the reservation-staging table (`composer_venue_imports`-style) — interface `ScrapeResult.notes` in the scrapers, plus the staging-tab CSV column: `scripts/scrape-reservation-urls-pass1.ts:93,130,145,159,174,189,200,277,294,317,377`, `scripts/scrape-reservation-urls-pass2.ts:93,111,113-117,173,183,194,217,229`, `scripts/resolve_missing_place_ids.py:106-117`, `scripts/export-staging-review.ts:49,79`, `supabase/migrations/20260425_reservation_staging.sql:15`.
- **Pre-`places-to-row` schema mentions of `last_verified`**, not `last_updated`: `supabase/migrations/20260413_venue_import_prep.sql:9`, `supabase/migrations/20260430000001_venue_data_import.sql:13`.

## Per-column references

### `verified`

- (a) `src/lib/venues/columns.ts:59` (ALL_V2_COLUMNS), `:180` (BOOL_COLUMNS); `supabase/migrations/20260428_composer_venues_v2.sql:51` (schema)
- (b) `src/types/index.ts:192`
- (c) `tests/unit/scoring.test.ts:42`, `bar-eligibility.test.ts:62`, `pre-filter.test.ts:54`, `fit-gate.test.ts:63`, `composer.test.ts:45`

### `reservation_lead_days`

- (a) `src/lib/venues/columns.ts:40`, `:190` (INT_COLUMNS); `supabase/migrations/20260428_composer_venues_v2.sql:32`
- (b) `src/types/index.ts:173`
- (c) `tests/unit/scoring.test.ts:29`, `bar-eligibility.test.ts:49`, `pre-filter.test.ts:41`, `fit-gate.test.ts:50`, `composer.test.ts:32`

### `last_updated`

- (a) `src/lib/venues/columns.ts:62`, `:207` (DATE_COLUMNS), `:244` (PG_TYPE_OVERRIDES); `supabase/migrations/20260428_composer_venues_v2.sql:54`
- (b) `src/types/index.ts:195`
- (c) `tests/unit/scoring.test.ts:45`, `bar-eligibility.test.ts:65`, `pre-filter.test.ts:57`, `fit-gate.test.ts:66`, `saved-hydration.test.ts:34`, `composer.test.ts:48`
- (d) `scripts/sheets-venue-audit.js:38` (column position 26 = AA), `:622` (`sheet.getRange(r, COL.last_updated + 1).setValue(today)`)
- **(e)** `src/lib/venues/diff.ts:37` — `const TIMESTAMP_AS_DATE_COLUMNS: ReadonlySet<string> = new Set(["last_updated"])`, used at `:135` (`isDate = DATE_COLUMNS.has(col) || TIMESTAMP_AS_DATE_COLUMNS.has(col)`) to drive the date-normalize branch in `compareScalar`. Header comment at `:34`.

### `curated_by`

- (a) `src/lib/venues/columns.ts:49`; `supabase/migrations/20260413_venue_import_prep.sql:55` (ADD), `:124` (DROP comment), `20260419_venue_schema_v2.sql:64`, `20260428_composer_venues_v2.sql:41`, `20260430000001_venue_data_import.sql:13` (column list), `:1022` (`EXCLUDED.curated_by`)
- (b) `src/types/index.ts:182`
- (c) `tests/unit/scoring.test.ts:36`, `bar-eligibility.test.ts:56`, `pre-filter.test.ts:48`, `fit-gate.test.ts:57`, `composer.test.ts:39`, `stop-eyebrow.test.ts:33`, `saved-hydration.test.ts:27`, `availability-honest-copy.test.ts:57`
- (d) `src/lib/venues/places-to-row.ts:412` (`fields["curated_by"] = "adit"`); `src/lib/venues/transform.ts:245` (write side `record.curated_by = ...`); doc comments at `sheet-write.ts:83,576`, `transform.ts:19,242`, `places-to-row.ts:327`, `scripts/generate-configs.py:431`
- **(e)** `src/lib/venues/transform.ts:244` — `const curatedRaw = cleanStr(get("curated_by"))` reads the sheet column for the lowercase-normalize logic at `:245`. This is an **explicit per-column override**, not the generic `SHEET_OWNED_COLUMNS` loop above it — removing the column from inventory would NOT auto-drop this hand-rolled normalize step.

### `notes`

- (a) `src/lib/venues/columns.ts:58`; `supabase/migrations/20260428_composer_venues_v2.sql:50`, `20260419_venue_schema_v2.sql:19` (header comment listing "happy_hour, notes, maps_url"), `:74` (schema)
- (b) `src/types/index.ts:191`
- (c) `tests/unit/scoring.test.ts:41`, `bar-eligibility.test.ts:61`, `pre-filter.test.ts:53`, `fit-gate.test.ts:62`, `composer.test.ts:44`, `saved-hydration.test.ts:31`
- (d) `src/app/api/admin/add-venue/route.ts:479` (`row["notes"] = ""`)

### `corner_id`

- (a) `src/lib/venues/columns.ts:73`; `supabase/migrations/20260428_composer_venues_v2.sql:65`
- (b) `src/types/index.ts:206`
- (c) `tests/unit/scoring.test.ts:52`, `bar-eligibility.test.ts:72`, `pre-filter.test.ts:64`, `fit-gate.test.ts:73`, `composer.test.ts:55`, `saved-hydration.test.ts:49`

### `corner_photo_url`

- (a) `src/lib/venues/columns.ts:74`; `supabase/migrations/20260428_composer_venues_v2.sql:66`
- (b) `src/types/index.ts:207`
- (c) `tests/unit/scoring.test.ts:53`, `bar-eligibility.test.ts:73`, `pre-filter.test.ts:65`, `fit-gate.test.ts:74`, `composer.test.ts:56`, `saved-hydration.test.ts:50`

### `guide_count`

- (a) `src/lib/venues/columns.ts:75`, `:193` (INT_COLUMNS); `supabase/migrations/20260428_composer_venues_v2.sql:67`
- (b) `src/types/index.ts:208`
- (c) `tests/unit/scoring.test.ts:54`, `bar-eligibility.test.ts:74`, `pre-filter.test.ts:66`, `fit-gate.test.ts:75`, `composer.test.ts:57`, `saved-hydration.test.ts:51`

### `source_guides`

- (a) `src/lib/venues/columns.ts:76`, `:174` (ARRAY_COLUMNS); `supabase/migrations/20260428_composer_venues_v2.sql:68`
- (b) `src/types/index.ts:209`
- (c) `tests/unit/scoring.test.ts:55`, `bar-eligibility.test.ts:75`, `pre-filter.test.ts:67`, `fit-gate.test.ts:76`, `composer.test.ts:58`, `saved-hydration.test.ts:52`

### `all_neighborhoods`

- (a) `src/lib/venues/columns.ts:77`, `:175` (ARRAY_COLUMNS); `supabase/migrations/20260428_composer_venues_v2.sql:69`
- (b) `src/types/index.ts:210`
- (c) `tests/unit/scoring.test.ts:56`, `bar-eligibility.test.ts:76`, `pre-filter.test.ts:68`, `fit-gate.test.ts:77`, `composer.test.ts:59`, `saved-hydration.test.ts:53`

(Note: uppercase `ALL_NEIGHBORHOODS` in `src/config/generated/neighborhoods.ts` is the taxonomy list — different symbol, not a reference to this column.)

### `content_tier`

- (d) `src/lib/venues/places-to-row.ts:413` (`fields["content_tier"] = "1"`); doc at `:327`
- (c) `tests/unit/add-venue-mapping.test.ts:327`
- Not in ALL_V2_COLUMNS, Venue interface, or any migration. Sheet-only column the importer ignores.

### `original_neighborhood`

- (d) `src/app/api/admin/add-venue/route.ts:478` (`row["original_neighborhood"] = row["neighborhood"] ?? ""`)
- Not in ALL_V2_COLUMNS, Venue interface, or any migration. Sheet-only column the importer ignores.

### `split_hours`

- (d) `src/lib/venues/places-to-row.ts:409` (`fields["split_hours"] = hasSplitDay(schedule) ? "yes" : "no"`); doc at `:270`
- (c) `tests/unit/add-venue-mapping.test.ts:323`, `:341`, `:354`
- **(e)** `src/app/profile/_components/AddVenuePanel.tsx:164` — listed in `FACT_FIELDS`, rendered by `FieldGroup` as `row["split_hours"]` in the add-venue preview UI.
- Not in ALL_V2_COLUMNS, Venue interface, or any migration.

### `open_mon`, `open_tue`, `open_wed`, `open_thu`, `open_fri`, `open_sat`, `open_sun`

### `close_mon`, `close_tue`, `close_wed`, `close_thu`, `close_fri`, `close_sat`, `close_sun`

- (d) Templated writes only, at `src/lib/venues/places-to-row.ts:284`, `:285`, `:289`, `:290` — `numericHoursColumns` emits `result[\`open_${day}\`]` / `result[\`close_${day}\`]` per day. The literal column names `open_mon` etc. never appear in source.
- Not in ALL_V2_COLUMNS, Venue interface, any migration, or any test.

## Summary

### CLEAN — safe to cut (only `a`/`b`/`c`/`d` references)

- `verified`
- `reservation_lead_days`
- `notes`
- `corner_id`
- `corner_photo_url`
- `guide_count`
- `source_guides`
- `all_neighborhoods`
- `content_tier`
- `original_neighborhood`
- `open_mon`, `open_tue`, `open_wed`, `open_thu`, `open_fri`, `open_sat`, `open_sun`
- `close_mon`, `close_tue`, `close_wed`, `close_thu`, `close_fri`, `close_sat`, `close_sun`

24 of 28 columns clean.

### BLOCKED — has at least one CONSUMER

- **`last_updated`** — `src/lib/venues/diff.ts:37`. `TIMESTAMP_AS_DATE_COLUMNS` set entry drives `compareScalar`'s date-normalize branch at `:135`. Behavior is degrade-safe (the Set entry would become dead) but the explicit reference would need to be edited out along with the comment at `:34-36`.
- **`curated_by`** — `src/lib/venues/transform.ts:244`. Hand-rolled per-column read + lowercase normalize at `:244-245`, NOT covered by the generic `SHEET_OWNED_COLUMNS` loop above it. Removal requires deleting these two lines AND the `curated_by` field on `VenueRecord` (otherwise the assignment type-errors).
- **`split_hours`** — `src/app/profile/_components/AddVenuePanel.tsx:164`. Entry in `FACT_FIELDS` renders the column in the add-venue preview UI. If the writer at `places-to-row.ts:409` is cut, drop the panel entry too or the preview shows a permanent "—" for the field.
