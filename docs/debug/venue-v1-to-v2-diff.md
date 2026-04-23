# Venue V1 → V2 Diff Report

## Summary

| Metric | V1 | V2 |
|--------|----|----|
| Total rows | 495 | 1,458 |
| Active rows | ~491 | 1,454 |
| Inactive rows | ~4 | 4 |
| Resy venues | 33 | 33 |
| With time_blocks | N/A | 1,000 |
| Distinct neighborhoods | 68 | 50 |
| Venue ID format | `v001`..`v495` | `c0001`..`v0XXX` (mixed) |

## Venue ID mismatch

V1 and V2 use **different venue_id schemes**. The same venue may be `v001` in V1 and `v0663` in V2. Matching must be done by **name** (case-insensitive), not venue_id.

This is expected — Reid's merged sheet renumbered venues with `c0001`+ for Corner-sourced venues, while keeping `vXXXX` for Composer-originals.

## By-name comparison

| Category | Count |
|----------|-------|
| Shared (in both V1 and V2) | 318 |
| V1 only (dropped in V2) | 176 |
| V2 only (new in V2) | 682 |

**318 venues** are in both tables (by name match).
**176 V1 venues** were dropped — Reid may have deduplicated or removed them during the merge with Corner data.
**682 new venues** from Corner.inc were added.

## Resy data integrity

All 33 Resy venues from V1 are present in V2 with matching `resy_venue_id` values (verified by name match). **0 mismatches.**

## Sanity check results

| Query | Expected | Actual |
|-------|----------|--------|
| Total v2 rows | 1,458 | 1,458 ✅ |
| Active venues | ~1,454 | 1,454 ✅ |
| Resy venues | 33 | 33 ✅ |
| With time_blocks | ~1,454 | 1,000 ⚠️ |
| Resy integrity (by name) | 0 mismatches | 0 ✅ |

**Note:** Only 1,000/1,458 venues have non-empty `time_blocks`. The remaining 458 venues have empty arrays — these are likely venues where time block data hasn't been populated yet in the sheet.

## Neighborhood count difference

V1 had 68 distinct neighborhoods. V2 has 50. This is because V2 uses a different neighborhood taxonomy — Reid consolidated some neighborhoods during the merge. The Master Reference tab in the sheet shows the current valid values.
