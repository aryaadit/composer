# Generated Config Drift Audit

**Date:** 2026-04-27
**Auditor:** Claude (automated trace)

---

## Source-of-Truth Summary

All 6 generated config files in `src/config/generated/` come from `docs/composer_venue_sheet_curated.xlsx` — the **old v1 sheet export**.

| Fact | Value |
|---|---|
| Generator script | `scripts/generate-configs.py` — reads `.xlsx` reference tabs |
| Input source | `docs/composer_venue_sheet_curated.xlsx` (file dated Apr 17) |
| Last generated | `2026-04-17T05:44:28Z` — 10 days ago, before the v2 migration |
| Current Google Sheet ID | `139gp-s2sBbEZbi4-6mrsMlhKykpoGWvuQdboMaAt20o` (v2) |
| xlsx source sheet | The old v1 sheet. The script has never been re-run against the v2 sheet. |

The script reads a local `.xlsx` file, not the Google Sheets API. Updating configs requires: export new sheet as xlsx → overwrite `docs/composer_venue_sheet_curated.xlsx` → run `npm run generate-configs`. This hasn't been done since the v2 sheet migration.

---

## Neighborhoods

### Phantom slugs: in NEIGHBORHOOD_GROUPS but zero active venues in DB (12)

| Slug | Appears in group |
|---|---|
| `arthur_avenue` | outer_boroughs |
| `bronx_concourse` | outer_boroughs |
| `columbia_waterfront` | brooklyn |
| `east_village_les` | east_village_les |
| `flatbush_plg` | brooklyn |
| `gramercy_kips_bay` | chelsea_flatiron |
| `kips_bay` | chelsea_flatiron |
| `midtown_hells_kitchen` | midtown_hk |
| `red_hook` | brooklyn |
| `sunnyside` | outer_boroughs |
| `washington_heights` | harlem_uptown |
| `west_harlem` | harlem_uptown |

### Orphan slugs: in DB but not in any NEIGHBORHOOD_GROUP (4)

| Slug | Active venue count | Impact |
|---|---|---|
| `bushwick` | **17** | Users can never select Bushwick — 17 venues invisible to neighborhood filter |
| `gramercy` | 4 | DB uses `gramercy`, config uses `gramercy_kips_bay` — 4 venues invisible to Chelsea/Flatiron group |
| `nyc` | 3 | Generic slug, no group |
| `queens` | 1 | Generic slug, no group |

### Unusually broad groups (>3 slugs)

| Group | Slug count | Slugs |
|---|---|---|
| `chelsea_flatiron` | 6 | chelsea, flatiron, nomad, gramercy_kips_bay, kips_bay, murray_hill |
| `soho_nolita_tribeca` | 6 | soho_nolita, nolita, noho, tribeca, little_italy, hudson_square |
| `midtown_hk` | 5 | midtown, midtown_west, midtown_east, midtown_hells_kitchen, koreatown |
| `east_village_les` | 4 | east_village, lower_east_side, east_village_les, bowery |
| `chinatown_fidi` | 4 | chinatown, fidi, battery_park_city, lower_manhattan |
| `brooklyn` | 18 | catch-all for non-Williamsburg Brooklyn |
| `outer_boroughs` | 16 | catch-all for Queens/Bronx/SI |

### Active venues per neighborhood (top 20)

| Neighborhood | Count |
|---|---|
| lower_east_side | 115 |
| west_village | 102 |
| east_village | 64 |
| williamsburg | 57 |
| chinatown | 56 |
| fidi | 54 |
| soho_nolita | 47 |
| nomad | 35 |
| flatiron | 34 |
| noho | 33 |
| chelsea | 32 |
| tribeca | 30 |
| hudson_square | 28 |
| little_italy | 22 |
| midtown_west | 22 |
| upper_east_side | 21 |
| east_williamsburg | 21 |
| upper_west_side | 20 |
| greenwich_village | 20 |
| **bushwick** | **17** (orphaned!) |

---

## Vibe Tags

| Status | Tags |
|---|---|
| In DB but missing from generated config | `acclaimed` |
| In generated config but not in DB | (none) |

`acclaimed` is used in venue vibe_tags but was never added to the Vibe Tags reference tab. It gets zero score on vibe matching (neither scored nor cross-cutting).

---

## Occasions

**No drift.** Generated config matches DB exactly.

Generated: `first_date`, `dating`, `couple`, `friends`, `solo`
DB: `first_date`, `dating`, `couple`, `friends`, `solo`

---

## Stop Roles

**No drift.** Generated config matches DB exactly.

Generated: `opener`, `main`, `closer`, `drinks`, `activity`, `coffee`
DB: `opener`, `main`, `closer`, `drinks`, `activity`, `coffee`

---

## Categories

| Status | Tags |
|---|---|
| In DB but missing from generated config (2) | `shopping`, `vegan` |
| In generated config but not in DB (8) | `bbq`, `bolivian`, `dominican`, `egyptian`, `moroccan`, `nepali`, `nigerian`, `senegalese` |

The 8 phantom categories were in the old sheet's reference tab but have zero active venues. The 2 new ones (`shopping`, `vegan`) were added in v2 venue data but the reference tab wasn't updated.

---

## Recommended Fixes

### On the v2 Google Sheet (Reference tabs)

**Neighborhood Groups tab:**
1. Add `bushwick` to `williamsburg_greenpoint` group (or create a new `bushwick` group)
2. Replace `gramercy_kips_bay` with `gramercy` in the `chelsea_flatiron` group
3. Remove `kips_bay` from `chelsea_flatiron` (zero venues)
4. Consider removing other phantom slugs, or add venues to justify them
5. Add `nyc` and `queens` to `outer_boroughs` or create a catch-all

**Neighborhoods tab:**
1. Add `bushwick`, `gramercy`, `queens`
2. Remove zero-venue slugs if they're not expected to have venues soon

**Vibe Tags tab:**
1. Add `acclaimed`

**Categories tab:**
1. Add `shopping`, `vegan`
2. Remove the 8 phantom categories (or leave them if you plan to add venues)

### After sheet updates

```bash
# 1. Export v2 sheet as xlsx
#    File → Download → .xlsx → save to docs/composer_venue_sheet_curated.xlsx

# 2. Regenerate configs
npm run generate-configs

# 3. Verify types
npx tsc --noEmit

# 4. Commit
git add src/config/generated/ docs/composer_venue_sheet_curated.xlsx
git commit -m "chore: regenerate configs from v2 sheet, fix neighborhood drift"
```

The generator script itself needs no changes — the drift is entirely from stale input data.
