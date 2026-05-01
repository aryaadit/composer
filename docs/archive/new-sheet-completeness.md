# New Sheet Completeness Audit

**Date:** 2026-05-01
**Sheet:** `1EdJqvFKaGAAo5oKMXBXeXfZdzfdT9IsmLiQYA9whXVg` / NYC Venues
**Total rows:** 1,314 (excluding header)

## Summary

- **56 sheet columns audited.** 11 are 100% populated, 14 fall below 50%.
- **`image_keys` does NOT exist in the sheet** (0%) but is 99.8% populated in DB. Wholesale wipe-and-replace would nuke all venue photos.
- **Only 122 venues (9.3%) have empty `stop_roles`** — these are completely unselectable for itinerary generation regardless of any other field.
- **`verified` is essentially dead** — 0.9% populated (12 of 1,314).
- **Editorial/curation fields are sparse** — `awards`, `signature_order`, `happy_hour` all under 8%. Most venues have no narrative flourish.

## Worst-populated fields

| # | Field | % | Why missing |
|---|---|---:|---|
| 1 | verified | 0.9% | Field appears unused. Only 12 venues touched it. Strong candidate for deletion. |
| 2 | happy_hour | 4.4% | Curator-added per venue. Only sparse coverage. |
| 3 | awards | 7.1% | Reserved for venues with Michelin / James Beard / Composer Favorite tags. Mostly empty. |
| 4 | signature_order | 7.9% | "What to order" hints. Curator-only. Only 104 venues. |
| 5 | dog_friendly | 17.7% | Boolean amenity. Curator-checked. Most venues uncategorized. |

## 100%-populated fields

The bedrock — every venue has these. Safe to use as join keys, filters, or mandatory display fields:

`venue_id`, `name`, `neighborhood`, `latitude`, `longitude`, `active`, `time_blocks`, `occasion_tags`, `reservation_url`, `curated_by`, `curation_boost`

## Critical gaps

**`stop_roles` empty for 122 venues (9.3%).** These pass every other filter but fail `venueMatchesRole()` for opener, main, AND closer. They occupy DB space without ever being chosen. Examples: `Planta Queen`, `Win Son Bakery`, `Clinton St. Baking Company`. Same gap exists in current sheet — not new.

No other field gap would meaningfully break itinerary generation. The Resy/reservation cluster (28-35%) is by design (only some venues use Resy). The narrative cluster (4-22%) just means no editorial flourish, not broken behavior. The categorization fields are >75% complete with sensible fallbacks.

## Field-by-field — grouped by purpose

### IDENTITY

| Column | % populated | Type | Notes |
|---|---:|---|---|
| venue_id | 100% | string | Primary key for upsert |
| name | 100% | string | |
| address | 99.8% | string | 2 missing: Maman (Nolita), Ovenly |
| google_place_id | 99.8% | place id | Same 2 missing — likely curator-added rows not Google-enriched yet |
| maps_url | 99.8% | url | Same 2 missing |
| latitude | 100% | number | |
| longitude | 100% | number | |

### CATEGORIZATION

| Column | % populated | Type | Notes |
|---|---:|---|---|
| neighborhood | 100% | string | |
| occasion_tags | 100% | array (csv) | |
| quality_score | 97.7% | number | 30 missing — handful of new entries not yet scored |
| category | 95.7% | string | 57 missing, mostly shopping/parks (Aquelarre Shop, Brooklyn Bridge) |
| stop_roles | 90.7% | array (csv) | **122 missing — these venues are unselectable** |
| vibe_tags | 88.2% | array (csv) | 155 missing — mostly cafés and bakeries |
| price_tier | 75.5% | number | 322 missing — algorithm treats as tier 2 via `?? 2` fallback |
| duration_hours | 35.5% | number | 848 missing — falls back to role average |

### TIME

| Column | % populated | Type | Notes |
|---|---:|---|---|
| time_blocks | 100% | array (csv) | Global fallback, always present |
| fri_blocks | 99.5% | array (csv) | |
| sat_blocks | 99.2% | array (csv) | |
| thu_blocks | 98.9% | array (csv) | |
| wed_blocks | 96.6% | array (csv) | |
| sun_blocks | 92.5% | array (csv) | |
| tue_blocks | 90.6% | array (csv) | |
| mon_blocks | 82.7% | array (csv) | Worst day — many venues closed Mondays |
| hours | 97.9% | string | Human-readable hours |

### RESERVATIONS

| Column | % populated | Type | Notes |
|---|---:|---|---|
| reservation_url | 100% | url | Note: many are Google Maps fallbacks, not real booking URLs |
| reservation_difficulty | 99.8% | number | 1-5 scale |
| reservation_platform | 35.3% | string | Only Resy-integrated venues |
| resy_slug | 32.6% | string | |
| reservation_lead_days | 31.0% | number | Sparse — only venues that need lead time |
| resy_venue_id | 28.1% | number | |

### OPERATIONAL

| Column | % populated | Type | Notes |
|---|---:|---|---|
| active | 100% | bool (yes/no) | |
| enriched | 99.8% | bool (yes/no) | Marker for Google Places enrichment |
| business_status | 99.7% | string | OPERATIONAL / CLOSED_PERMANENTLY / CLOSED_TEMPORARILY |
| hours | 97.9% | string | |
| last_updated | 77.8% | date | |
| last_verified | 76.0% | date | |
| verified | 0.9% | string | **Dead column** — only 12 venues |

### CURATION

| Column | % populated | Type | Notes |
|---|---:|---|---|
| curated_by | 100% | string | adit / reid / community |
| curation_boost | 100% | number | Default 0 |
| curation_note | 99.2% | string | Editorial blurb shown in venue detail |
| wheelchair_accessible | 73.1% | bool (yes/no) | |
| outdoor_seating | 40.1% | bool (yes/no) | Used in weather filter |
| notes | 35.5% | string | Internal-only, never shown |
| kid_friendly | 21.2% | bool (yes/no) | |
| dog_friendly | 17.7% | bool (yes/no) | |
| signature_order | 7.9% | string | "What to order" hints |
| awards | 7.1% | string | "Michelin", "James Beard", "Composer Favorite" |
| happy_hour | 4.4% | string | |
| all_neighborhoods | 44.7% | array (csv) | Multi-neighborhood venues; admin-only |

### QUALITY

| Column | % populated | Type | Notes |
|---|---:|---|---|
| google_rating | 99.6% | number | |
| google_review_count | 99.6% | number | |

### ENRICHMENT

| Column | % populated | Type | Notes |
|---|---:|---|---|
| google_types | 99.8% | array (csv) | Google's business type taxonomy — 100% in DB but unused at runtime |
| google_phone | 79.5% | string | Surfaced in venue modal |
| corner_id | 64.5% | number | Corner.inc source ID |
| corner_photo_url | 64.5% | url | Original photo (image_keys is the live photo path) |
| guide_count | 64.5% | number | How many Corner guides this venue appears in |
| source_guides | 64.5% | array (csv) | List of Corner guide names |
| **image_keys** | **— (not a sheet column)** | array | **DB-only, 99.8% populated. NOT in this sheet. See cross-check below.** |

## Sample missing-row examples (5 worst fields)

### 1. `verified` (0.9% — 1,302 missing)
- Examples: `Rubirosa`, `Chloe's`, `Bobo`
- Pattern: Effectively all venues. The 12 populated are an early experiment that never got generalized.

### 2. `happy_hour` (4.4% — 1,256 missing)
- Examples: `Rubirosa`, `Chloe's`, `Bobo`
- Pattern: Curator opt-in. No systematic data source.

### 3. `awards` (7.1% — 1,221 missing)
- Examples: `Rubirosa`, `Chloe's`, `Bobo`
- Pattern: Reserved for venues with formal accolades. Most NYC restaurants don't have them.

### 4. `signature_order` (7.9% — 1,210 missing)
- Examples: `Rubirosa`, `Chloe's`, `Bobo`
- Pattern: Manual curator entry. Used in venue detail modal + AI prompt.

### 5. `dog_friendly` (17.7% — 1,081 missing)
- Examples: `Rubirosa`, `Chloe's`, `Georgie's Cafe & Bar`
- Pattern: Boolean amenity flag. Most venues uncategorized — null treated as "unknown" not "no".

> All five worst fields share the same first three missing examples (`Rubirosa`, `Chloe's`, etc.) — these are early DB rows where the editorial fields haven't been backfilled. Not a quality issue with those venues; just that they were imported before the columns existed.

## Sheet vs DB delta — enrichment fields

DB sample: 1,000 of 1,452 active venues (Supabase default page limit). Percentages representative.

| Field | Sheet % | DB % | Delta | Risk if wiped |
|---|---:|---:|---:|---|
| **image_keys** | **0%** | **99.8%** | **−99.8%** | **CRITICAL — would lose all venue photos** |
| google_types | 99.8% | 99.8% | 0% | low |
| google_rating | 99.6% | 99.4% | +0.2% | low — sheet is fresher |
| google_review_count | 99.6% | 99.4% | +0.2% | low |
| google_phone | 79.5% | 79.9% | −0.4% | low — within sample noise |
| corner_id | 64.5% | 70.6% | −6.1% | low — admin-only field |
| resy_venue_id | 28.1% | 27.3% | +0.8% | none — sheet has slightly more |
| resy_slug | 32.6% | 27.3% | +5.3% | none — sheet has more |
| price_tier | 75.5% | 65.1% | +10.4% | low — sheet is more complete (the Apr 27 Google Places backfill is reflected) |
| duration_hours | 35.5% | 29.4% | +6.1% | none |
| signature_order | 7.9% | 5.9% | +2% | none |
| awards | 7.1% | 7.4% | −0.3% | none |
| happy_hour | 4.4% | 3.5% | +0.9% | none |

**Headline risk: `image_keys`.** It's not a sheet column at all. The importer (`import_venues_v2.py`) only writes columns that appear in `ALL_COLUMNS`. Since `image_keys` is absent, the importer wouldn't touch it on UPSERT — **it would stay populated**. Confirmed by reading `scripts/import_venues_v2.py`: the column list does not include `image_keys`, so it's preserved. No risk under standard upsert.

If, however, the cleanup plan involves a `TRUNCATE + INSERT` (wholesale wipe-and-replace) instead of upsert, `image_keys` WOULD be lost and would need to be re-run via `scripts/backfill_venue_photos_v2.py`.

## Decision Helper

**Wipe-and-replace feasibility (if importer were changed to TRUNCATE + INSERT):**

**Data preserved on wipe-and-replace** (>90% in sheet):
- All 11 100%-populated fields
- All 8 day-block fields (82-100%)
- `category` (95.7%), `quality_score` (97.7%), `stop_roles` (90.7%)
- `reservation_difficulty` (99.8%), `maps_url` (99.8%), `address` (99.8%), `google_place_id` (99.8%)
- `google_rating`/`google_review_count` (99.6%), `google_types` (99.8%)
- `enriched`, `business_status`, `hours`, `curation_note` (97-99%)

**Data potentially lost on wipe-and-replace** (<70% in sheet, lower than DB):
- `image_keys` — 0% sheet, 99.8% DB → **lose all photos** without a re-run of `backfill_venue_photos_v2.py`
- `corner_id` — 64.5% sheet, 70.6% DB → lose 6% of admin metadata
- `google_phone` — 79.5% sheet, 79.9% DB → roughly equivalent

**Critical to verify before wiping:**
- **`image_keys` is NOT in the sheet.** Even on wipe-and-replace, the importer would need to be modified to skip this column (which it already does — but worth confirming the migration plan). If anyone proposes a `TRUNCATE` approach, photos must be re-backfilled.
- **`reservation_url` at 100%** is suspicious — many of these are Google Maps fallback links rather than real reservation URLs. Worth spot-checking before relying on the value.
- **122 venues with empty `stop_roles`** would carry over from sheet to DB on import. They're already invisible to the algorithm; importing them again doesn't worsen anything but also doesn't fix.

**Net recommendation:** Stick with the existing UPSERT importer (`scripts/import_venues_v2.py`). It preserves `image_keys` automatically because the column isn't in `ALL_COLUMNS`. The 82 active misclassified venues (London restaurants tagged as NYC neighborhoods, flagged in `docs/new-sheet-audit.md`) need separate cleanup either way.
