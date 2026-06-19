# NYC Venues column-letter audit — 2026-06-19

## Scope

After a column reorder of the `NYC Venues` tab in the venue spreadsheet, find every hardcoded reference to specific columns BY LETTER (`!BB`, `!AP3:AP`, letter-keyed maps, etc.) that the reorder may have invalidated.

For each hit, classify:

- **SAFE** — reads the full width (`A2:CD2` headers + `A3:CD` data), then maps columns by header name (`headers.indexOf(...)` in TS, `{h: i for i, h in enumerate(headers)}` in Python). Reorder-proof.
- **BROKEN** — reads or writes specific column LETTERS. The letters no longer point at the intended headers after the reorder.

For each BROKEN hit, note whether it has a header-vs-letter guard that halts on mismatch, or writes blind.

## Method

Combined greps across `src/`, `scripts/`, `supabase/`, `tests/`:

```
rg -n '"NYC Venues!'                 # explicit range literals
rg -n 'WRITE_WHITELIST|write_whitelist'
rg -n '\bCOL\.[a-z_]+|^const COL = '  # letter-keyed dicts
rg -n '\bcol_to_idx|"[A-Z]{1,2}":\s*"[a-z_]+"'  # letter helpers + maps
rg -n 'VENUE_SHEET_HEADER_RANGE|VENUE_SHEET_DATA_RANGE|A2:CD2|A3:CD'  # full-width
```

Three scripts touch the sheet by letter. Two app modules read full-width then header-map. No code in `src/`, `supabase/`, or `tests/` writes by letter.

---

## SAFE — full-width read + header-name lookup

These read `A2:CD2` (headers) plus `A3:CD` (data), then index by header name. Reorder-proof.

- **`src/lib/venues/sheet.ts:26-27, 68-90`** — `readSheetRows()` reads `${VENUE_SHEET_TAB}!${VENUE_SHEET_HEADER_RANGE}` (= `NYC Venues!A2:CD2`) + `${VENUE_SHEET_TAB}!${VENUE_SHEET_DATA_RANGE}` (= `NYC Venues!A3:CD`), normalizes headers to lowercase, and returns them alongside the rows for downstream header-keyed access. The range constants live in `src/lib/venues/config.ts:40,43`.
- **`src/lib/venues/sheet-write.ts:140-156`** (`readCanonicalHeaders`), **`:319-330`** (`readNycVenuesPlaceIdMap` — `headers.indexOf("google_place_id" / "venue_id" / "name")`), **`:480-498`** (`readNycVenuesVenueIds` — `headers.indexOf("venue_id")`) — every read uses the same full-width range constants then `headers.indexOf(...)` for the per-column lookup.
- **`scripts/scrape_resy_v2.py:93, 98`** — full-width reads of `NYC Venues!A2:CD2` + `NYC Venues!A3:CD`. Followed at `:206` by `col_idx = {h: i for i, h in enumerate(headers)}`, then `col_idx["name"]`, `col_idx["latitude"]`, etc. — all reads in this script are SAFE.
- **`scripts/refresh_google_places_data.py:187`** — `verify_column_whitelist` reads `NYC Venues!A2:CD2` for the guard check (see BROKEN section for what it covers).

---

## BROKEN — hardcoded column letters that no longer point at the intended headers

### `scripts/refresh_google_places_data.py` — PARTIAL guard

Has `verify_column_whitelist()` at `:180-198` that halts with `SystemExit(2)` on mismatch — but it ONLY checks the WRITE side.

- **`:68-77`** — `WRITE_WHITELIST: dict[str, str]` mapping 8 letters → expected header names:
  ```
  "AP": "google_place_id",
  "AI": "last_verified",
  "AV": "google_rating",
  "AW": "google_review_count",
  "AX": "google_types",
  "AY": "google_phone",
  "AZ": "enriched",
  "BA": "business_status",
  ```
  **Guarded:** `verify_column_whitelist` halts before any write fires if any of these letters' actual row-2 header doesn't match the expected name.
- **`:129-133`** — `write_cell(col, row, value)` builds `f"NYC Venues!{col}{row}"`; refuses any `col` not in `WRITE_WHITELIST`. **Guarded** (per above).
- **`:80-82`** — three READ-only letter constants:
  ```
  READ_VENUE_ID_COL = "A"      # venue_id
  READ_NAME_COL = "B"           # name (display only — never written)
  READ_ACTIVE_COL = "AE"        # active (filter; never written)
  ```
  **NOT guarded.** `verify_column_whitelist` iterates `WRITE_WHITELIST.items()` only; the `READ_*` letters are never checked against row-2 headers. Used at `:210-211` (`cols = [READ_VENUE_ID_COL, READ_NAME_COL, READ_ACTIVE_COL] + list(WRITE_WHITELIST.keys())`), then read via `f"NYC Venues!{c}3:{c}"` ranges at `:213`, then indexed at `:237-239` as `venue_id` / `name` / `active`. If the reorder moved any of these three columns, this script silently reads the wrong columns and proceeds.

### `scripts/scrape_resy_v2.py` — BLIND write (writes-only; reads are SAFE)

Reads are SAFE (header-mapped via `col_idx`, see SAFE section). The WRITE path is BROKEN:

- **`:391-396`** — `f"NYC Venues!BB{sheet_row}:BD{sheet_row}"` writes 3 cells per matched row in order: `["resy", str(resy_id), resy_slug]`. The pre-existing `platform_i`, `resy_id_i`, `resy_slug_i` indices computed at `:212-214` from the header-mapped `col_idx` are deliberately NOT used. The inline comment at `:391-393` names the decision:
  > These are at column indices platform_i, resy_id_i, resy_slug_i / But simpler: just use the known column letters BB, BC, BD

  **No guard.** No header-vs-letter check anywhere. If BB/BC/BD no longer hold `reservation_platform`/`resy_venue_id`/`resy_slug`, this writes those values into whatever columns now occupy BB/BC/BD.

### `scripts/sheets-venue-audit.js` — FULLY BLIND

No header verification anywhere in the file — the COL dict is the entire column-position contract.

- **`:23-46`** — `const COL = {...}` with 21 hardcoded 0-based indices (`venue_id: 0`, ..., `last_updated: 26`, ..., `google_place_id: 32`) plus side-comments (`// A`, `// B`, ..., `// AG`):
  ```js
  const COL = {
    venue_id:      0,   // A
    name:          1,   // B
    neighborhood:  2,   // C
    category:      3,   // D
    price_tier:    4,   // E
    outdoor_seating: 9, // J
    maps_url:     12,   // M
    curation_note: 13,  // N
    address:      18,   // S
    latitude:     19,   // T
    longitude:    20,   // U
    active:       21,   // V
    hours:        24,   // Y
    last_verified: 25,  // Z
    last_updated: 26,   // AA
    dog_friendly: 28,   // AC
    kid_friendly: 29,   // AD
    wheelchair:   30,   // AE
    google_place_id: 32, // AG
  };
  ```
- **17 READS via `row[COL.<name>]`** at **`:342-358`** — `venue_id`, `name`, `neighborhood`, `category`, `price_tier`, `outdoor_seating`, `maps_url`, `curation_note`, `address`, `latitude`, `longitude`, `active`, `hours`, `dog_friendly`, `kid_friendly`, `wheelchair`, `google_place_id`. **No guard.**
- **17 WRITES via `sheet.getRange(r, COL.<name> + 1).setValue(...)`** at **`:535-622`** — `name`, `neighborhood`, `category`, `price_tier`, `address`, `latitude`, `longitude`, `hours`, `maps_url`, `outdoor_seating`, `dog_friendly`, `kid_friendly`, `wheelchair`, `curation_note`, `active`, `last_verified` (`:621`), `last_updated` (`:622`). **No guard.**

If the reorder shifted any of these 21 columns, this script reads the wrong cells AND writes Places-API output into the wrong cells, with no warning.

---

## Summary table

| File | Reads | Writes | Guard |
|---|---|---|---|
| `src/lib/venues/sheet.ts` | SAFE | none | n/a |
| `src/lib/venues/sheet-write.ts` | SAFE | (only writes to the review tab, not NYC Venues by letter) | n/a |
| `scripts/scrape_resy_v2.py` | SAFE | **BROKEN** (BB:BD blind) | none — inline comment chose letters over the indexed lookup it had |
| `scripts/refresh_google_places_data.py` | **BROKEN** for `A`/`B`/`AE` (READ_*), SAFE for the full-width verify range | **BROKEN if letters changed** — but `verify_column_whitelist` halts before writing | partial (writes guarded; READ_* unguarded) |
| `scripts/sheets-venue-audit.js` | **BROKEN** (17 reads via COL) | **BROKEN** (17 writes via COL) | none |
