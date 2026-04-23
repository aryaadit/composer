# Venue Sheet Phase 1 Report

## Sheet access
- **Sheet ID:** `139gp-s2sBbEZbi4-6mrsMlhKykpoGWvuQdboMaAt20o`
- **Access:** OK (via service account env vars)
- **Tabs found:** NYC Venues, LA Venues, Removed Overlaps, Corner Guides, Guide Memberships

## NYC Venues tab
- **Rows:** 1,458
- **Columns:** 53 (A through BA)
- **Active rows:** 1,454
- **Section headers (row 1):** CORE IDENTITY | MATCHING & SCORING | LOGISTICS | CURATION | GEO | STATUS | INTERNAL | METADATA | CORNER SOURCE | GOOGLE PLACES

### Column list (row 2)

| Col | Name | Col | Name |
|-----|------|-----|------|
| A | venue_id | AB | address |
| B | name | AC | latitude |
| C | neighborhood | AD | longitude |
| D | category | AE | active |
| E | price_tier | AF | notes |
| F | vibe_tags | AG | Verified |
| G | occasion_tags | AH | hours |
| H | stop_roles | AI | last_verified |
| I | time_blocks | AJ | last_updated |
| J | mon_blocks | AK | happy_hour |
| K | tue_blocks | AL | dog_friendly |
| L | wed_blocks | AM | kid_friendly |
| M | thu_blocks | AN | wheelchair_accessible |
| N | fri_blocks | AO | signature_order |
| O | sat_blocks | AP | google_place_id |
| P | sun_blocks | AQ | corner_id |
| Q | duration_hours | AR | corner_photo_url |
| R | outdoor_seating | AS | guide_count |
| S | reservation_difficulty | AT | source_guides |
| T | reservation_lead_days | AU | all_neighborhoods |
| U | reservation_url | AV | google_rating |
| V | maps_url | AW | google_review_count |
| W | curation_note | AX | google_types |
| X | awards | AY | google_phone |
| Y | quality_score | AZ | enriched |
| Z | curation_boost | BA | business_status |
| AA | curated_by | | |

### Sample rows

| venue_id | name | neighborhood | category | price_tier |
|----------|------|-------------|----------|-----------|
| c0001 | Rubirosa | little_italy | italian | 2 |
| c0002 | chloe. | west_village | vegan | 2 |
| c0005 | Bobo | west_village | wine_bar | 2 |

## Delimiter audit

| Column | Comma | Pipe | Single | Empty |
|--------|-------|------|--------|-------|
| time_blocks | 925 | 403 | 130 | 0 |
| mon_blocks | 748 | 298 | 171 | 241 |
| tue_blocks | 794 | 324 | 203 | 137 |
| wed_blocks | 843 | 336 | 229 | 50 |
| thu_blocks | 870 | 348 | 223 | 17 |
| fri_blocks | 894 | 371 | 184 | 9 |
| sat_blocks | 899 | 387 | 151 | 21 |
| sun_blocks | 809 | 345 | 182 | 122 |

~27% of rows use pipe delimiter. Needs normalization to comma.

## DB Resy cross-reference
- **DB Resy venues:** 33
- **Matched in sheet:** 33
- **Unmatched:** 0

All 33 venues with Resy data in the DB have matching rows in the sheet. No data loss risk on migration.

## Next steps

1. Adit makes a backup copy of the sheet (File → Make a Copy)
2. Confirm backup exists
3. Phase 2 proceeds: normalize delimiters, add Resy columns, backfill, create Master Reference tab
