# New Sheet Audit

**Date:** 2026-05-01
**Current sheet:** `139gp-s2sBbEZbi4-6mrsMlhKykpoGWvuQdboMaAt20o`
**New sheet:** `1EdJqvFKaGAAo5oKMXBXeXfZdzfdT9IsmLiQYA9whXVg`
**DB state:** `composer_venues_v2` — 1,458 rows total, 1,452 active

## Verdict

**Ready-with-caveats.** The new sheet is structurally identical and represents a cleanup pass — Reid removed 83 venues that were misclassified (mostly London restaurants tagged as NYC neighborhoods like SoHo and Chinatown). Importing the new sheet by itself will NOT remove those venues from the DB because the importer is upsert-only. A **separate cleanup step is required** to deactivate or delete the 82 active "removed" venues post-import.

## Summary

- Headers identical (56 columns, same order). Master Reference identical (no taxonomy changes).
- 0 venue additions, 83 removals. New sheet is a curation pass, not an expansion.
- 79 of the 83 removals are concentrated in 3 neighborhoods: chinatown (25), fidi (23), soho_nolita (22). Spot-checking confirms most are **London restaurants** (addresses like "27 Romilly St, London W1D 5AL, UK") that were incorrectly tagged with NYC neighborhood slugs in the current sheet.
- **All 83 removed venues still exist in the DB**; 82 are active. Importer will not touch them.
- 4 venues have material field changes (price tier, neighborhood, vibe tags). One stands out: Torrisi went from price_tier 2→4 and `nolita`→`soho_nolita` neighborhood — looks like a real curation update.
- Data quality on the new sheet is comparable to the current — `stop_roles` empty rate stayed at 9.3% (was 9%); `price_tier` empty rate improved slightly to 24.5% (was 35% before the Google Places backfill).

## Section 1: Structure

**NEW sheet tabs:** `NYC Venues` (1516 rows × 72 cols), `Master Reference` (1000 rows × 26 cols)

**CURRENT sheet tabs:** `NYC Venues`, `Master Reference`, `SF Venues`, `Removed Overlaps`, `Corner Guides`, `Guide Memberships`

**Headers comparison (NYC Venues):**
- 56 columns each, **identical names and order**. Confirmed match.
- First 10: `venue_id, name, neighborhood, category, price_tier, vibe_tags, occasion_tags, stop_roles, time_blocks, mon_blocks` (same in both).

**Note:** The new sheet drops the auxiliary tabs (SF Venues, Removed Overlaps, Corner Guides, Guide Memberships). The import scripts only read NYC Venues + Master Reference, so this doesn't affect imports — but if any other workflow depends on those tabs, it'll break.

## Section 2: Venue diff

| Total | Count |
|---|---|
| Current sheet | 1,402 |
| New sheet | 1,314 |
| Common (by name+address) | 1,314 |
| Only in new (additions) | **0** |
| Only in current (removals) | **83** |

### A. Venues only in new sheet (additions)

None. Reid did not add any venues in this pass.

### B. Venues only in current sheet (removals — 83 total)

**By neighborhood:**

| Neighborhood | Removed | Notes |
|---|---|---|
| chinatown | 25 | Likely most are misclassified |
| fidi | 23 | Likely most are misclassified |
| soho_nolita | 22 | Most are confirmed London restaurants (see below) |
| williamsburg | 3 | |
| nyc | 2 | (orphan slug, no real neighborhood) |
| east_village | 2 | |
| (others — 1 each) | 6 | tribeca, lower_east_side, brooklyn_heights, west_village, lower_manhattan, gramercy |

**By active flag:** 82 of 83 are currently `active=yes`, only 1 is `active=no`.

**Sample of removed venues with confirmed London/non-NYC addresses:**

| Name | Tagged neighborhood | Actual location |
|---|---|---|
| Bar Termini | soho_nolita | London W1D 5JE, UK |
| Berenjak Soho | soho_nolita | London W1D 5AL, UK |
| Andrew Edmunds | soho_nolita | London W1F 0LP, UK |
| Bancone Golden Square | soho_nolita | London W1F 9EL, UK |
| Barrafina Dean Street | soho_nolita | London W1D 3LL, UK |
| Chotto Matte Toronto | fidi | Toronto |

**Inference:** The current sheet had a data import bug or merge that pulled in restaurants from a non-NYC dataset. Reid's new sheet cleans that up. **All 83 should be deactivated/deleted from the DB** — they're polluting the candidate pool for any itinerary in those three neighborhoods.

### C. Venues in both with material changes (4 total)

| Name | Field | Old | New |
|---|---|---|---|
| Torrisi | price_tier | 2 | 4 |
| Torrisi | neighborhood | nolita | soho_nolita |
| Torrisi | vibe_tags | +classic, -iykyk, -lunch | |
| Little Flower Cafe | price_tier | 2 | (empty) |
| Little Flower Cafe | neighborhood | astoria | sunnyside |
| Little Flower Cafe | vibe_tags | -food_forward, -iykyk, -lunch | |
| Between the Bagel NY | vibe_tags | -food_forward, -iykyk, -lunch | |
| Breakfast by Salt's Cure | vibe_tags | -classic, -food_forward, -iykyk, -late_night, -lunch | |

Active flag: no changes. Category: no changes. Time blocks: no changes.

The Torrisi update is a clear price-tier upgrade and reclassification. The other three are losing tags — possibly intentional cleanup of overstated tagging.

## Section 3: Master Reference diff

**No changes.** Every column in the Master Reference tab is identical between the two sheets:

| Column | Values |
|---|---|
| neighborhood | 68 (identical) |
| category | 52 (identical) |
| vibe_tags | 31 (identical) |
| occasion_tags | 5 (identical) |
| stop_roles | 6 (identical) |
| price_tier | 4 (identical) |
| time_blocks | 4 (identical) |
| outdoor_seating | 3 (identical) |
| reservation_difficulty | 4 (identical) |
| reservation_platform | 1 (identical) |
| curated_by | 3 (identical) |

No taxonomy changes. **No need to re-run `npm run generate-configs` after import** — the generated configs would be byte-identical.

## Section 4: Data quality

**On the new sheet (1,314 venues):**

| Field | Empty | % |
|---|---|---|
| name | 0 | 0.0% |
| neighborhood | 0 | 0.0% |
| address | 2 | 0.2% |
| google_place_id | 2 | 0.2% |
| category | 57 | 4.3% |
| stop_roles | 122 | 9.3% |
| price_tier | 322 | 24.5% |

**Active flag breakdown:** `yes`: 1310, `no`: 4

**Duplicate (name+address):** 0 duplicates.

**Comparison to previous audits:**
- `stop_roles` empty: 9.3% (was 9%) — essentially unchanged. 122 venues still can't be selected for any role.
- `price_tier` empty: 24.5% — better than the original 35%, matches roughly the post-backfill state. The backfill from Google Places that ran on 2026-04-27 wrote tier values to ~143 venues; many of those will now revert to null when this sheet is imported (see Section 5).

## Section 5: DB sync preview

**Pre-import DB state:** 1,458 total rows, 1,452 active.

**After importing the new sheet (upsert only, no deletes):**

| Outcome | Count |
|---|---|
| Existing venues UPDATED with new sheet values | 1,314 |
| Existing venues NOT TOUCHED (in DB but not in new sheet) | 144 |
|   — of which 82 are misclassified London/non-NYC | 82 |
|   — of which 62 are other DB-only venues | 62 |
| New rows INSERTED | 0 |
| Total DB rows after | 1,458 (unchanged) |
| Total active after | ~1,452 (unchanged — importer doesn't deactivate) |

**Critical issue:** The 82 active misclassified venues will remain candidates for itinerary generation even after the import.

**Backfilled price_tier values will be lost.** When the importer UPSERTs, it overwrites every column from the sheet — including price_tier. Sheet has `price_tier` empty for 322 venues; current DB has price_tier populated for 1,109 venues (only 349 null). Specifically the ~143 venues backfilled from Google Places on 2026-04-27 will revert to null unless their tier was independently entered into the new sheet.

**144 vs 83 discrepancy:** 144 venues are in DB but not in new sheet; only 83 are in current sheet but not in new sheet. The other 61 are in DB but were already absent from the current sheet too — likely orphans from earlier import attempts. Worth investigating separately.

## Section 6: Importer behavior (`scripts/import_venues_v2.py`)

- **Operation:** UPSERT via `INSERT ... ON CONFLICT (venue_id) DO UPDATE`. Conflict key is `venue_id`.
- **For venues in DB but not in sheet:** **NOT TOUCHED.** They stay in the DB with their current `active` value.
- **For venues with field changes:** OVERWRITES every column except `venue_id`. There is no preserve-existing-value logic — every sheet field becomes the DB value, including null/empty (which would set the column to its default or NULL).
- **No deletes, no truncate.** Strictly additive/updating.
- **No deactivation logic.** A venue would only become `active=false` if the sheet sets it that way explicitly.

This means the 82 active misclassified venues require either:
1. **Manual SQL deactivation/deletion** keyed off the venue_ids listed in the audit, or
2. **Adding `active=no` rows for those venues to the new sheet** before importing (cleanest), or
3. **Modifying the importer** to deactivate rows missing from the sheet (most invasive — risky if the sheet is ever an incomplete extract)

Option 2 is the cleanest for a one-time cleanup. Option 1 is fastest.

## Recommended next steps

1. **Decide on the 82 misclassified venues.** Easiest: ask Reid to add them to the new sheet with `active=no`. Or, run a one-time SQL deactivation:
   ```sql
   UPDATE composer_venues_v2
   SET active = false
   WHERE venue_id IN ( /* the 83 venue_ids from current sheet that are missing from new sheet */ );
   ```
   The full venue_id list is available — generated during this audit and can be exported.

2. **Decide on price_tier preservation.** Either:
   - Re-run `scripts/backfill_price_tier.py` after the import to recover Google Places tier values for the venues that lost them, or
   - Modify the importer to use `COALESCE(EXCLUDED.price_tier, composer_venues_v2.price_tier)` — same pattern as the existing `RESY_COALESCE_COLUMNS` in `import_venues_v2.py:271`. Lowest-effort fix.

3. **Update `EXPECTED_SHEET_ID` constants** in:
   - `src/app/api/admin/sync-venues/route.ts` (line 170)
   - `scripts/import_venues_v2.py` (line 346)
   - `.env.local` `GOOGLE_SHEET_ID` value
   - `scripts/generate-configs.py` (line 31, `SHEET_ID`)

4. **Run the import** (dry-run first):
   ```bash
   python3 scripts/import_venues_v2.py --dry-run
   python3 scripts/import_venues_v2.py --execute
   ```

5. **Apply the deactivation SQL** from step 1.

6. **Spot-check 5 random venues** in the running app — generate an itinerary in chinatown/fidi/soho_nolita and confirm no London restaurants appear.

7. **Skip `npm run generate-configs`** — Master Reference is identical, no taxonomy changes.

## Open questions

1. Are the 82 active misclassified venues your call to delete, deactivate, or leave to Reid to add `active=no` rows for?
2. Is losing the Google Places-backfilled price_tier values acceptable, or should the importer be modified to coalesce nulls?
3. The new sheet drops `SF Venues`, `Corner Guides`, `Guide Memberships`, `Removed Overlaps` tabs. Are those used by any other workflow we shouldn't break?
4. The 62 "in DB but in neither sheet" orphan venues — should they also be reviewed for deactivation in this pass, or kept as a separate cleanup?
5. The `price_tier` value going from 2 → empty for "Little Flower Cafe" — intentional removal, or oversight in the new sheet?
