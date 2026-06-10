# Neighborhood-group venue coverage audit — 2026-06-10

Re-run of [neighborhood-coverage-audit-2026-06-09.md](neighborhood-coverage-audit-2026-06-09.md) with paginated reads, after the runtime fetch truncation diagnosed in [runtime-fetch-truncation-diagnostic-2026-06-09.md](runtime-fetch-truncation-diagnostic-2026-06-09.md) was fixed (commit `a17cf00`). This audit additionally asserts `fetched == count` before the rollup runs.

Methodology identical to the 06-09 audit's Part 2; only the data layer changed. Throwaway script deleted after run.

---

## Headline

**0 dead groups · 1 thin-role group · 1320 active venues fetched (matched the head:true count).**

The four "DEAD" groups from the 06-09 matrix (Bed-Stuy / Crown Heights, Fort Greene / Clinton Hill, Park Slope / Prospect, East Williamsburg / Bushwick) were artifacts of the 1000-row truncation in the throwaway script. With paginated reads they compose comfortably across all three tiers. Only Harlem / Uptown (5 active venues total: harlem=3 + washington_heights=2) retains a thin-role flag.

---

## Part 1 — Diagnostic answers (unchanged from 06-09)

1. **Picker's neighborhood group list**: static config in [scripts/generate-configs.py:188](../../scripts/generate-configs.py#L188) (`NEIGHBORHOOD_GROUPS`), baked into [src/config/generated/neighborhoods.ts](../../src/config/generated/neighborhoods.ts) with `venueCount` per group queried from Supabase at generate-time.
2. **Multi-group selection**: pooled across all selected groups. `expandNeighborhoodGroup()` flat-maps + de-dupes to a single flat `string[]` of storage slugs. Thin groups are weak only when selected alone.

See the 06-09 doc for full citations.

---

## Part 2 — Coverage matrix (corrected)

Sort: ascending by total composable pairs across the 3 user-facing tiers.

Tier sets via `BUDGET_TIER_MAP` (downward-permissive, strict — no widening per-group). Null `price_tier` treated as tier 2. Pairs = ordered (opener_closer, main) minus venues role-eligible for both.

Cell format `mains/OC/pairs` per tier (C = casual, N = nice_out, S = splurge). Swap depth per role = `min over tiers of max(0, count - 1)` — alternatives left after one placement in the role's worst tier. Median dist = haversine across all in-group venue pairs, meters.

| group | total | mains | OC | C: m/oc/p | N: m/oc/p | S: m/oc/p | dead tiers | swap main | swap OC | med dist (m) | Σ pairs | flags |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Harlem / Uptown | 5 | 2 | 3 | 1/1/1 | 2/2/4 | 1/1/1 | 0 | 0 | 0 | 3610 | 6 | thin-role |
| Gramercy / Murray Hill | 13 | 7 | 7 | 0/2/0 | 4/6/23 | 7/5/34 | 1 | 0 | 1 | 706 | 57 |  |
| Bronx / Staten Island | 14 | 10 | 4 | 4/1/4 | 10/4/40 | 6/3/18 | 0 | 3 | 0 | 10677 | 62 |  |
| South Brooklyn | 16 | 8 | 8 | 0/5/0 | 7/8/56 | 8/3/24 | 1 | 0 | 2 | 3949 | 80 |  |
| Upper East Side | 26 | 14 | 17 | 0/1/0 | 6/3/18 | 10/10/99 | 1 | 0 | 0 | 1031 | 117 |  |
| Queens | 25 | 20 | 5 | 11/2/22 | 20/5/100 | 9/3/27 | 0 | 8 | 1 | 5158 | 149 |  |
| **Koreatown** | 39 | 37 | 4 | 8/2/16 | 24/4/94 | 27/2/52 | 0 | 7 | 1 | 239 | 162 | **focus** |
| Fort Greene / Clinton Hill | 20 | 10 | 10 | 0/1/0 | 8/9/72 | 10/9/90 | 1 | 0 | 0 | 822 | 162 |  |
| FiDi / Lower Manhattan | 25 | 12 | 13 | 1/6/6 | 9/12/108 | 9/6/54 | 0 | 0 | 5 | 599 | 168 |  |
| Hell's Kitchen / Midtown West | 30 | 14 | 17 | 5/5/25 | 9/9/80 | 7/12/83 | 0 | 4 | 4 | 816 | 188 |  |
| Midtown East | 29 | 15 | 16 | 1/2/2 | 9/9/81 | 11/12/131 | 0 | 0 | 1 | 933 | 214 |  |
| Greenwich Village | 31 | 16 | 17 | 1/4/3 | 9/13/115 | 14/13/181 | 0 | 0 | 3 | 550 | 299 |  |
| Upper West Side | 33 | 23 | 14 | 2/6/10 | 14/11/151 | 18/8/142 | 0 | 1 | 5 | 1730 | 303 |  |
| Chinatown | 35 | 20 | 15 | 10/8/80 | 15/13/195 | 8/7/56 | 0 | 7 | 6 | 371 | 331 |  |
| Bed-Stuy / Crown Heights | 31 | 18 | 13 | 2/5/10 | 17/13/221 | 16/8/128 | 0 | 1 | 4 | 1338 | 359 |  |
| Astoria / LIC | 37 | 21 | 16 | 5/2/10 | 20/11/220 | 16/13/208 | 0 | 4 | 1 | 2156 | 438 |  |
| Chelsea | 40 | 18 | 28 | 3/8/21 | 11/24/260 | 14/19/264 | 0 | 2 | 7 | 629 | 545 |  |
| Park Slope / Prospect | 44 | 22 | 22 | 4/5/20 | 15/19/285 | 17/17/289 | 0 | 3 | 4 | 1169 | 594 |  |
| Flatiron / NoMad | 62 | 20 | 44 | 1/5/4 | 11/27/296 | 16/38/607 | 0 | 0 | 4 | 662 | 907 |  |
| DUMBO / Brooklyn Heights | 51 | 28 | 26 | 4/8/31 | 24/24/573 | 22/18/394 | 0 | 3 | 7 | 1149 | 998 |  |
| East Williamsburg / Bushwick | 76 | 17 | 59 | 7/17/119 | 17/57/969 | 10/42/420 | 0 | 6 | 16 | 1409 | 1508 |  |
| West Village | 128 | 55 | 76 | 5/27/134 | 32/64/2046 | 46/47/2161 | 0 | 4 | 26 | 469 | 4341 |  |
| SoHo / Nolita / Tribeca | 149 | 73 | 79 | 12/29/346 | 46/63/2896 | 55/50/2749 | 0 | 11 | 28 | 827 | 5991 |  |
| Williamsburg / Greenpoint | 141 | 42 | 100 | 3/22/65 | 35/89/3114 | 38/78/2964 | 0 | 2 | 21 | 845 | 6143 |  |
| East Village / LES | 220 | 65 | 161 | 11/61/668 | 51/142/7238 | 49/100/4897 | 0 | 10 | 60 | 753 | 12803 |  |

**Summary:** 25 groups · **0 dead** · **1 with any role <3 venues (Harlem / Uptown)** · total active venues = 1320 (= head:true count, asserted before rollup).

### Koreatown (focus row)

- total=39 · mains=37, OC=4
- casual 8/2/16 · nice_out 24/4/94 · splurge 27/2/52
- dead tiers=0
- swap main worst-tier=7 (casual tier; comfortable)
- **swap OC worst-tier=1** (splurge tier has only 2 OC venues; one swap available, no more)
- median pairwise distance=239m
- Σ pairs=162

The 06-09 audit reported Koreatown total=27 mains=25 OC=3 Σ pairs=61. Today: total=39 mains=37 OC=4 Σ pairs=162. The OC count moved by 1, but the truncation hit Koreatown mains as well — 12 mains were dropped from the rollup. The swap-OC=1 worst-tier number still stands as the most useful diagnostic for Koreatown's elevated swap rate: in splurge specifically there are only 2 OC venues, so a user who rejects the picked OC has at most one alternative left and then the role is exhausted.

---

## Part 3 — Flags

### Dead groups
**None.** All 25 groups can compose at least one valid 2-stop pair in at least one tier.

### Any role <3 venues total
**1 group**: Harlem / Uptown (mains=2). The group label is `harlem_uptown`, slugs `harlem` + `washington_heights`. Live counts 3+2=5. Not a pipeline issue — actually thin.

---

## Diff vs the corrected 06-09 audit

| group | 06-09 total (truncated) | 06-10 total (paginated) | delta |
| --- | --- | --- | --- |
| East Williamsburg / Bushwick | 20 | 76 | +56 |
| Fort Greene / Clinton Hill | 1 | 20 | +19 |
| Park Slope / Prospect | 3 | 44 | +41 |
| Bed-Stuy / Crown Heights | 1 | 31 | +30 |
| DUMBO / Brooklyn Heights | 4 | 51 | +47 |
| Williamsburg / Greenpoint | 37 | 141 | +104 |
| Koreatown | 27 | 39 | +12 |
| South Brooklyn | 6 | 16 | +10 |
| Hell's Kitchen / Midtown West | 29 | 30 | +1 |
| Flatiron / NoMad | 61 | 62 | +1 |
| Astoria / LIC | 37 | 37 | 0 |
| (all 14 other groups) | unchanged | unchanged | 0 |

~320 venues that were dropped by the 06-09 truncation, all in outer Brooklyn + Queens + Koreatown. Manhattan core groups were largely unaffected (they fit inside the first 1000 rows of whatever scan order the unprotected query happened to use).

---

## Methodology

- Source: throwaway `scripts/coverage-audit.ts`, run on 2026-06-10, deleted after run.
- Connection: service-role Supabase client.
- Data fetch: `.range()` loop with PAGE=1000, `.order("id", asc)`, terminates on partial page. Followed by head:true exact count; aborts with `fetched != count` error if mismatched.
- Filter: `active = true`.
- Role expansion: `ROLE_EXPANSION` from [src/config/generated/stop-roles.ts](../../src/config/generated/stop-roles.ts). Main-eligible iff `expandedRoles ⊇ {main}`; OC-eligible iff `expandedRoles ∩ {opener, closer} ≠ ∅`.
- Tier sets: `BUDGET_TIER_MAP` — casual=[1], nice_out=[1,2], splurge=[2,3]. No widening (widening is a global-pool operation in `/api/generate`, not per-group).
- Pairs: ordered (OC, main). Subtracts venues role-eligible for both roles so a venue isn't paired with itself.
- Median distance: haversine across all `C(n, 2)` in-group venue pairs, rounded to the nearest meter.

## Caveats

- Distances and counts are point-in-time snapshots; new sheet imports will move them.
- "Thin-role" assumes the group is selected **alone**. Per Part 1 answer 2, Harlem/Uptown paired with any healthy group rides the union pool.
- The CLAUDE.md / `minGroupVenuesToRender` doc/code discrepancy (CLAUDE.md says 50, code says 25) flagged in the 06-09 audit is still open.

## What's NOT in this report

- Recommendations on whether to ship a picker visibility filter. With 0 dead groups, the answer is "no" by default — but a thin-OC tier flag (Koreatown splurge, Astoria splurge, others) could still drive a per-tier hint shown when the user picks a budget that would compose poorly in their selected group.
