# Venue columns post-cleanup audit — 2026-06-19

## Scope

After dropping 25 venue columns (NYC Venues sheet went from 73 to 48 columns; `composer_venues_v2` dropped 8 DB columns), verify nothing in the repo still references the cut columns or assumes the old column width/positions. Read-only audit.

## Cut tokens (exact, whole-word)

```
reservation_lead_days, verified, last_updated, corner_id, corner_photo_url,
guide_count, source_guides, all_neighborhoods, split_hours, content_tier,
original_neighborhood, open_mon, close_mon, open_tue, close_tue, open_wed,
close_wed, open_thu, close_thu, open_fri, close_fri, open_sat, close_sat,
open_sun, close_sun
```

Keepers (must NOT flag): `last_verified`, `duration_hours`, `curation_note`, `notes`.

## Method

```
rg -n -w '\b(reservation_lead_days|verified|last_updated|corner_id|corner_photo_url|guide_count|source_guides|all_neighborhoods|split_hours|content_tier|original_neighborhood|open_(mon|tue|wed|thu|fri|sat|sun)|close_(mon|tue|wed|thu|fri|sat|sun))\b' src/ tests/ scripts/ supabase/

rg -n 'A[0-9]*:(B[A-U]|C[A-Z]|D[A-Z])'
rg -n -i 'getRange|getLastColumn|:BU|:BT|\b73\b'
rg -n 'row\[[0-9]+\]|cols?\[[0-9]+\]|columns\[[0-9]+\]'
```

Plus read of `src/lib/venues/apply.ts`, `src/lib/venues/places-to-row.ts`, `src/app/api/admin/add-venue/route.ts`, `src/lib/venues/columns.ts`, and both `composer_apply_venue_import` migrations.

---

## Check 1 — cut-token grep (whole-word `\b...\b`)

| File:line | Token | Pass/Fail | Note |
|---|---|---|---|
| `src/lib/auth.ts:37` | `verified` | PASS | English word in JSDoc, not the column |
| `src/lib/venues/places-to-row.ts:257` | `verified` | PASS | English word in JSDoc, not the column |
| `tests/unit/bar-eligibility.test.ts:86` | `verified` | PASS | English word in test header comment, not the column |
| `supabase/migrations/20260428_composer_venues_v2.sql:32` | `reservation_lead_days` | HISTORICAL | DDL in the original create-table migration; not modified per the "do not touch SQL" guardrail. No runtime code reads it. |
| `supabase/migrations/20260428_composer_venues_v2.sql:51` | `verified` | HISTORICAL | same |
| `supabase/migrations/20260428_composer_venues_v2.sql:54` | `last_updated` | HISTORICAL | same |
| `supabase/migrations/20260428_composer_venues_v2.sql:65` | `corner_id` | HISTORICAL | same |
| `supabase/migrations/20260428_composer_venues_v2.sql:66` | `corner_photo_url` | HISTORICAL | same |
| `supabase/migrations/20260428_composer_venues_v2.sql:67` | `guide_count` | HISTORICAL | same |
| `supabase/migrations/20260428_composer_venues_v2.sql:68` | `source_guides` | HISTORICAL | same |
| `supabase/migrations/20260428_composer_venues_v2.sql:69` | `all_neighborhoods` | HISTORICAL | same |

Zero active-code references to any cut token in `src/`, `tests/`, or `scripts/`. No `split_hours`, `content_tier`, `original_neighborhood`, `open_*`, or `close_*` references anywhere. There is no DROP COLUMN migration committed; the DB drop happened out-of-band. The original create-table DDL is a historical artifact only.

## Check 2 — positional / fixed-width hunting

| File:line | Pattern | Pass/Fail | Note |
|---|---|---|---|
| `src/lib/venues/config.ts:40` | `"A2:CD2"` (`VENUE_SHEET_HEADER_RANGE`) | PASS | Wide buffer to col 82 (CD). After the cut the sheet is 48 wide; reading A:CD just returns shorter rows. Every consumer keys by header name from row 2, not by position. |
| `src/lib/venues/config.ts:43` | `"A3:CD"` (`VENUE_SHEET_DATA_RANGE`) | PASS | Same. Header-keyed downstream. |
| `src/lib/venues/sheet-write.ts:377` | `${ADD_VENUE_REVIEW_TAB}!A:CD` | PASS | Full-width read of review tab. `readReviewTabPlaceIdMap` keys by `headers.indexOf("google_place_id")` etc. — name-driven. |
| `src/lib/venues/sheet-write.ts:527` | `${ADD_VENUE_REVIEW_TAB}!A:CD` | PASS | Same shape in `readReviewTabVenueIds`. |
| `src/lib/venues/sheet-write.ts:210,278` | `"...!A47:CD47"` | PASS | JSDoc examples for `appendReviewTabRow` / `parseAppendedRowNumber`. Sheets API returns the same `CD` upper bound regardless of column width; doc is consistent. No runtime effect. |
| `scripts/refresh_google_places_data.py:192` | `"NYC Venues!A2:CD2"` | PASS | Header-row read in `build_col_for`; result is a name→letter map. Width-tolerant. |
| `scripts/scrape_resy_v2.py:105` | `"NYC Venues!A2:CD2"` | PASS | Header read; downstream `col_idx = {h: i for i, h in enumerate(headers)}` is name-keyed. |
| `scripts/scrape_resy_v2.py:110` | `"NYC Venues!A3:CD"` | PASS | Full-width data read; consumers index via `col_idx[name]`. |
| `scripts/refresh_google_places_data.py:244` | `row[0]` | PASS | Single-column subrange (range built from `col_for[name]`); `row[0]` is the only cell in each row. Header-driven indirection. |
| `scripts/generate-configs.py:195` | `row[0]` | PASS | Same pattern (`read_sheet_column(service, tab, col)` always returns single-column rows). |

`rg 'getRange'`, `rg 'getLastColumn'`, `rg ':BU'`, `rg ':BT'`, and `rg '\b73\b'` in source dirs returned no relevant hits (the `73` matches are inside `scripts/snapshots/*.csv` Google Places review-count and venue-id values, not code). No code assumes a 73-wide sheet.

## Check 3 — row-building logic in the four core files

| File | Maps by | Cut tokens present | Pass/Fail | Note |
|---|---|---|---|---|
| `src/lib/venues/columns.ts` | NAME | none | PASS | `ALL_V2_COLUMNS` is a name-typed tuple. `ALL_WRITABLE_COLUMNS = SHEET_OWNED ∪ COALESCE` derived from it. `ARRAY_COLUMNS`/`BOOL_COLUMNS`/`INT_COLUMNS`/`FLOAT_COLUMNS`/`DATE_COLUMNS` all name-keyed Sets. `PG_TYPE_OVERRIDES` name-keyed. None of the 25 cut tokens appear. |
| `src/lib/venues/apply.ts` | NAME | none | PASS | `buildSqlFragments` iterates `ALL_WRITABLE_COLUMNS` to produce `p_columns`, `p_set_clause`, `p_select_list`, `p_recordset_typedef` text strings. `recordToPayload` iterates `ALL_WRITABLE_COLUMNS` and reads `rec[c]` by name. No positional indices anywhere. |
| `src/lib/venues/places-to-row.ts` | NAME | none | PASS | `fields: Record<string, string>` keyed by lowercase header name. Writes `fields["name"]`, `fields["mon_blocks"]`, `fields["hours"]`, etc. No iteration by index, no fixed column positions. |
| `src/app/api/admin/add-venue/route.ts` | NAME | none | PASS | Apply path reads `canonicalHeaders` (= NYC Venues row 2), then `canonicalHeaders.map((h) => row[h.trim().toLowerCase()] ?? "")` projects the row map onto live column order. The row itself is `Record<string, string>` keyed by header name. No positional access. |

## Check 4 — composer_apply_venue_import

| File | Column list source | Static cut tokens | Pass/Fail | Note |
|---|---|---|---|---|
| `supabase/migrations/20260501_composer_apply_venue_import_function.sql` | Dynamic — four TEXT params | none | PASS | Function signature accepts `p_columns text, p_set_clause text, p_select_list text, p_recordset_typedef text, p_rows jsonb`. The function body does `format(...)` and `EXECUTE` on the strings. No column names enumerated in SQL. |
| `supabase/migrations/20260502_composer_apply_venue_import_with_deactivation.sql` | Dynamic — same four TEXT params + `p_deactivate_ids jsonb` | none | PASS | Same shape; adds the deactivation UPDATE that only references `active`, `venue_id`. No column enumeration. |

Caller `src/lib/venues/apply.ts::buildSqlFragments` builds those four strings from `ALL_WRITABLE_COLUMNS` (already pruned). No staging/temp table DDL exists for this function.

## Check 5 — scripts/sheets-venue-audit.js

| Aspect | Result | Pass/Fail | Note |
|---|---|---|---|
| File exists | NO (`ls` returns "No such file or directory") | PASS | Deleted in the prior cleanup. |
| References in code/config | NONE (excluding `docs/`) | PASS | `rg 'sheets-venue-audit\|sheets_venue_audit'` returns zero hits in `src/`, `scripts/`, `tests/`, `package.json`, `.github/`, configs. |
| Targeting a `Venues` tab | n/a | PASS | File gone. |
| Hardcoded key string | n/a | PASS | File gone (the previously-noted leaked legacy service_role key is no longer in the tree). |
| Docs references | `docs/venue-columns-removal-audit-2026-06-18.md`, `docs/nyc-venues-column-letter-audit-2026-06-19.md` — historical record only | acceptable | Both are audit history, not executable. |

---

## Verdict

All five checks PASS. Code-side cleanup is complete and consistent:

- Zero active-code references to any of the 25 cut tokens.
- Zero positional column access anywhere; every sheet read either targets a known header range (`A2:CD2` / `A:CD`) and indexes by header name, or reads a single-column subrange built from a name→letter map.
- All four row-building modules (`columns.ts`, `apply.ts`, `places-to-row.ts`, add-venue `route.ts`) map by header name, and none of the cut tokens appear in any column list, type set, or set-clause builder.
- `composer_apply_venue_import` is fully dynamic; its column list is built at call time from `ALL_WRITABLE_COLUMNS` which no longer contains any cut token.
- `scripts/sheets-venue-audit.js` is deleted with zero remaining references in executable code.

The only residual mentions of cut tokens are in the original `20260428_composer_venues_v2.sql` create-table DDL (intentional, no-touch-SQL guardrail) and in three JSDoc/comment uses of the English word "verified" (not the column).
