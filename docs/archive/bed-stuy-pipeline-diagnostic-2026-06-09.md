# Bed-Stuy pipeline diagnostic — 2026-06-09

Read-only diagnostic. Spawned from the question: the Master sheet shows ~21 Bed-Stuy venues, but yesterday's coverage audit reported 1 active in `composer_venues_v2`. Where does the pipeline break?

**Answer: it doesn't.** The pipeline is intact. Yesterday's audit was wrong — my throwaway script silently truncated at 1000 rows under Supabase's default API limit. This doc captures the diagnostic that established that, plus the actual sheet-to-DB picture.

---

## Headline

Bed-Stuy has **21 active** rows in `composer_venues_v2`, exactly matching the sheet. Crown Heights has 10. The `bed_stuy_crown_heights` group rolls up to 31, matching the baked `venueCount: 31` in `src/config/generated/neighborhoods.ts`. Every other "DEAD" / "thin-role" Brooklyn flag in yesterday's audit is suspect for the same truncation reason.

---

## What `generate-configs.py` venueCount actually counts (spec sub-question)

[scripts/generate-configs.py](../../scripts/generate-configs.py):

- **Function**: `fetch_venue_counts_by_neighborhood(supabase)` at **line 120-143**.
- **Source**: Supabase query against `composer_venues_v2`. Not the sheet.
- **Filter**: `.eq("active", True)` at line 130. Inactive rows excluded.
- **Pagination**: `.range(offset, offset + page_size - 1)` loop, `page_size = 1000`, terminates on partial page (lines 127-136). Correctly handles >1000 rows.
- **Aggregation**: line 496 — `venue_count = sum(counts.get(s, 0) for s in g["slugs"])`. Sum across all slugs in the group.

So the picker's `venueCount` baked into `src/config/generated/neighborhoods.ts` = count of `composer_venues_v2` rows where `active = true` and `neighborhood ∈ group.slugs`. The canonical generator is correct.

---

## 1. Bed-Stuy / Crown / Stuy variants in DB

`select neighborhood, active, count(*) from composer_venues_v2 where neighborhood ilike '%bed%' or '%stuy%' or '%crown%' group by neighborhood, active`:

| neighborhood | active | inactive |
| --- | --- | --- |
| `bed_stuy` | 21 | 0 |
| `crown_heights` | 10 | 0 |

No spelling variants. No inactive rows. Both slugs are in group `bed_stuy_crown_heights`. The sheet column for Bed-Stuy rows reads `bed_stuy`; identical to the canonical group slug.

---

## 2. Orphan check

**No orphans.** Every distinct `neighborhood` value in `composer_venues_v2` (active and inactive) is a member of at least one group's `slugs` array in `src/config/generated/neighborhoods.ts`. No invisible venues at the slug-naming layer.

---

## 3. Import mechanism + audit trail

**Pipeline modules:**
- Sheet read: `readSheetRows()` in [src/lib/venues/sheet.ts](../../src/lib/venues/sheet.ts) — Google Sheets API, `NYC Venues` tab.
- Transform: `prepareVenues` in [src/lib/venues/transform.ts](../../src/lib/venues/transform.ts) — skips rows missing `active`, `neighborhood`, or lat/lng. Does NOT validate that `neighborhood` is in `ALL_NEIGHBORHOODS` (a useful future guard; not the issue here).
- Apply: Postgres RPC **`composer_apply_venue_import`** invoked from [src/lib/venues/apply.ts:215](../../src/lib/venues/apply.ts#L215). Migration `20260502_composer_apply_venue_import_with_deactivation.sql`.
- Audit: every run logged to **`composer_import_runs`** via `recordImportRun` in [src/lib/venues/audit.ts](../../src/lib/venues/audit.ts). CLI surfaces via `npm run import-venues -- history`.

### Last 10 runs

| started_at | status | abort_reason | added | mod | deact | ms | sheet_title |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-06-10 03:24 UTC | success | — | 0 | 1 | 1 | 2140 | 52126_composer_venue_sheet |
| 2026-05-22 18:19 | success | — | 0 | 1 | 0 | 2163 | 52126_composer_venue_sheet |
| 2026-05-22 01:07 | success | — | 0 | 1328 | 0 | 3813 | 52126_composer_venue_sheet |
| 2026-05-22 01:07 | **aborted** | threshold | 0 | 1328 | 0 | 1820 | 52126_composer_venue_sheet |
| 2026-05-21 23:06 | success | — | 0 | 439 | 0 | 3314 | 52126_composer_venue_sheet |
| 2026-05-21 23:04 | **aborted** | threshold | 0 | 439 | 0 | 2581 | 52126_composer_venue_sheet |
| 2026-05-21 16:49 | success | — | 0 | 2 | 0 | 2118 | 43026_composer_venue_sheet |
| 2026-05-20 23:04 | success | — | 0 | 17 | 2 | 2054 | 43026_composer_venue_sheet |
| 2026-05-11 01:59 | success | — | 0 | 1 | 0 | 2416 | 43026_composer_venue_sheet |
| 2026-05-11 01:37 | success | — | 22 | 17 | 0 | 3341 | 43026_composer_venue_sheet |

Two threshold-blocked runs on 2026-05-21 / 22, both later re-run with `--confirm-large-change` and applied successfully on the same day. Both look like bulk reformat operations on the sheet (1328 modifications, 0 add / 0 deact — every row touched), not data loss events. Most recent run is last night (2026-06-10 03:24 UTC); tiny — 1 modify + 1 deactivate. No blocked or truncated runs since 2026-05-22.

The `sheet_title` changed from `43026_composer_venue_sheet` → `52126_composer_venue_sheet` on 2026-05-21 23:06 — expected per the sheet-ID migration; both refer to the same canonical sheet.

---

## 4. Sheet vs DB per-slug diff

Every slug has **gap = 0** between sheet active count and DB active count. No drops. No drift. 1333 sheet rows read (0 with empty neighborhood). Examples from the 63-slug full list:

| slug | sheet active | sheet total | db active | db total | gap | in group? |
| --- | --- | --- | --- | --- | --- | --- |
| `bed_stuy` | 21 | 21 | 21 | 21 | 0 | yes |
| `crown_heights` | 10 | 10 | 10 | 10 | 0 | yes |
| `fort_greene` | 12 | 12 | 12 | 12 | 0 | yes |
| `clinton_hill` | 8 | 8 | 8 | 8 | 0 | yes |
| `bushwick` | 34 | 34 | 34 | 34 | 0 | yes |
| `east_williamsburg` | 42 | 43 | 42 | 43 | 0 | yes |
| `park_slope` | 18 | 18 | 18 | 18 | 0 | yes |
| `prospect_heights` | 9 | 9 | 9 | 9 | 0 | yes |
| `koreatown` | 39 | 41 | 39 | 43 | 0 | yes |

Notes:
- `koreatown` db_total (43) > sheet_total (41) — two extra inactive rows in DB. Likely venues deactivated, then removed from the sheet entirely. Active counts match on both sides; not a generation concern.
- `east_williamsburg`, `greenpoint`, `koreatown`, `nolita`, `red_hook`, `west_village`, `upper_west_side`, `carroll_gardens`, `lower_east_side`, `greenwich_village` all show 1-2 inactive rows in DB. Normal soft-delete residue.

---

## What this means for yesterday's audit

The DEAD / thin-role flags in [neighborhood-coverage-audit-2026-06-09.md](neighborhood-coverage-audit-2026-06-09.md) are wrong for the Brooklyn groups. They derive from a throwaway script that ran a single un-paginated `select` against `composer_venues_v2` and silently capped at Supabase's default 1000-row limit. Whichever 300+ venues got truncated were missing from the rollup. Bed-Stuy (21 active in DB) was reported as "1 active." Same for everything else in outer Brooklyn.

| group | flagged yesterday | live active rollup |
| --- | --- | --- |
| East Williamsburg / Bushwick | DEAD thin-role | 76 |
| Fort Greene / Clinton Hill | DEAD thin-role | 20 |
| Park Slope / Prospect | DEAD thin-role | 44 |
| Bed-Stuy / Crown Heights | DEAD thin-role | 31 |

The baked `venueCount` values in `src/config/generated/neighborhoods.ts` (which the picker actually reads) are correct — they match these live rollups. So the picker shows these groups normally. Yesterday's audit is the only artifact affected.

Recommendation (out of scope for this diagnostic; flagging for follow-up): re-run the coverage audit with `.range()` pagination before any decisions about a visibility filter.

---

## What's NOT in this report

- Recommendations on what to do next; spec was findings only.
- Per-group recompute of role eligibility / composable pairs / swap depth — needs a corrected audit, not just paginated counts.
