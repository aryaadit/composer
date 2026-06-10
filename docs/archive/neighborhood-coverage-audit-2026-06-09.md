# Neighborhood-group venue coverage audit — 2026-06-09

> ⚠️ **CORRECTION 2026-06-09 (later same day): the per-group counts below are wrong.** The throwaway script that produced this matrix ran a single un-paginated `select` against `composer_venues_v2` and silently capped at Supabase's default 1000-row limit. ~320 venues were truncated from the rollup, all of which appear to have been in outer-Brooklyn slugs. Bed-Stuy / Crown Heights, Fort Greene / Clinton Hill, Park Slope / Prospect, and East Williamsburg / Bushwick were all flagged DEAD or thin-role because of this — they are NOT dead in reality (live active rollups: 31 / 20 / 44 / 76). The trace is in [bed-stuy-pipeline-diagnostic-2026-06-09.md](bed-stuy-pipeline-diagnostic-2026-06-09.md). Subsequent investigation found the **same truncation bug in three production runtime fetches** ([/api/generate](../../src/app/api/generate/route.ts), [/api/swap-stop](../../src/app/api/swap-stop/route.ts), [/api/add-stop](../../src/app/api/add-stop/route.ts)) — full audit in [runtime-fetch-truncation-diagnostic-2026-06-09.md](runtime-fetch-truncation-diagnostic-2026-06-09.md), fix in commit `a17cf00`.
>
> **The corrected re-run is at [neighborhood-coverage-audit-2026-06-10.md](neighborhood-coverage-audit-2026-06-10.md)** (paginated reads, `fetched == count` asserted). With proper pagination there are **0 dead groups** and only **1 thin-role group** (Harlem / Uptown). Use the 06-10 matrix; treat this 06-09 matrix as historical only.

Read-only diagnostic. Snapshot of `composer_venues_v2` (`active = true`) joined against the 25 user-facing neighborhood groups in `src/config/generated/neighborhoods.ts`. Numbers from a throwaway script run on 2026-06-09 (script deleted after).

Spawned from the question: the picker is showing groups that can't compose quality itineraries. Before designing a visibility filter, we need real coverage numbers per group.

---

## Part 1 — Two diagnostic answers

### 1. Where does the picker's neighborhood-group list come from?

**Static config, baked at build time.** The canonical list is a Python constant `NEIGHBORHOOD_GROUPS` in `scripts/generate-configs.py:188` (~25 entries). `npm run generate-configs` reads the sheet's Master Reference tab, queries Supabase for active venue counts per storage slug, and emits `src/config/generated/neighborhoods.ts` as:

```ts
Record<string /* groupId */, {
  label: string;
  borough: string;
  slugs: string[];      // 1+ storage slugs the group expands to
  venueCount: number;   // baked at generate-time, not live
}>
```

The picker reads this static record at compile time via `src/config/neighborhoods.ts` re-exports and hides groups where `venueCount < ALGORITHM.pools.minGroupVenuesToRender` (currently **25**, not 50 as CLAUDE.md states — flag for separate fix).

### 2. When the user selects multiple groups, does generation pool or compose within one?

**Pooled across all selected groups.** In `src/components/questionnaire/QuestionnaireShell.tsx:201-203`, the selected group IDs flatten through `expandNeighborhoodGroup()` and de-dupe into a single flat `string[]` of storage slugs, stored as `answers.neighborhoods`. At filter time, `src/lib/scoring.ts:166-167` keeps a venue iff `answers.neighborhoods.includes(v.neighborhood)`.

Implication: **a thin group is weak only when selected alone.** Paired with any healthy group it rides the union pool.

---

## Part 2 — Coverage matrix

Sort: ascending by total composable pairs across the 3 user-facing tiers.

Tier sets use `BUDGET_TIER_MAP` (downward-permissive, strict — no widening applied). Widening is a global-pool operation done at compose time, not per-group, so showing strict counts per group reflects what a user sees when this group is selected alone. Null `price_tier` treated as tier 2 (matches scoring). Pairs = ordered (opener_closer, main) minus venues role-eligible for both (a venue can't pair with itself).

Cell format `mains/OC/pairs` per tier (C = casual, N = nice_out, S = splurge). Swap depth per role = `min over tiers of max(0, count - 1)` — alternatives left after one placement, in the role's worst tier. Median dist = haversine across all in-group venue pairs, meters.

| group | total | mains | OC | C: m/oc/p | N: m/oc/p | S: m/oc/p | dead tiers | swap main | swap OC | med dist (m) | Σ pairs | flags |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| East Williamsburg / Bushwick | 20 | 0 | 20 | 0/5/0 | 0/19/0 | 0/15/0 | 3 | 0 | 4 | 1201 | 0 | **DEAD** thin-role |
| Fort Greene / Clinton Hill | 1 | 0 | 1 | 0/0/0 | 0/1/0 | 0/1/0 | 3 | 0 | 0 | 0 | 0 | **DEAD** thin-role |
| Park Slope / Prospect | 3 | 0 | 3 | 0/0/0 | 0/3/0 | 0/3/0 | 3 | 0 | 0 | 4760 | 0 | **DEAD** thin-role |
| Bed-Stuy / Crown Heights | 1 | 0 | 1 | 0/0/0 | 0/1/0 | 0/1/0 | 3 | 0 | 0 | 0 | 0 | **DEAD** thin-role |
| Harlem / Uptown | 5 | 2 | 3 | 1/1/1 | 2/2/4 | 1/1/1 | 0 | 0 | 0 | 3610 | 6 | thin-role |
| DUMBO / Brooklyn Heights | 4 | 2 | 3 | 0/2/0 | 2/3/5 | 2/1/1 | 1 | 0 | 0 | 559 | 6 | thin-role |
| South Brooklyn | 6 | 4 | 2 | 0/2/0 | 3/2/6 | 4/0/0 | 2 | 0 | 0 | 5215 | 6 | thin-role |
| Gramercy / Murray Hill | 13 | 7 | 7 | 0/2/0 | 4/6/23 | 7/5/34 | 1 | 0 | 1 | 706 | 57 |  |
| **Koreatown** | 27 | 25 | 3 | 1/2/2 | 13/3/38 | 22/1/21 | 0 | 0 | 0 | 286 | 61 | **focus** |
| Bronx / Staten Island | 14 | 10 | 4 | 4/1/4 | 10/4/40 | 6/3/18 | 0 | 3 | 0 | 10677 | 62 |  |
| Upper East Side | 26 | 14 | 17 | 0/1/0 | 6/3/18 | 10/10/99 | 1 | 0 | 0 | 1031 | 117 |  |
| Queens | 25 | 20 | 5 | 11/2/22 | 20/5/100 | 9/3/27 | 0 | 8 | 1 | 5158 | 149 |  |
| Hell's Kitchen / Midtown West | 29 | 13 | 17 | 5/5/25 | 9/9/80 | 6/12/71 | 0 | 4 | 4 | 841 | 176 |  |
| FiDi / Lower Manhattan | 26 | 12 | 14 | 1/6/6 | 9/12/108 | 9/7/63 | 0 | 0 | 5 | 612 | 177 |  |
| Midtown East | 29 | 15 | 16 | 1/2/2 | 9/9/81 | 11/12/131 | 0 | 0 | 1 | 933 | 214 |  |
| Williamsburg / Greenpoint | 37 | 5 | 32 | 0/5/0 | 5/29/145 | 5/27/135 | 1 | 0 | 4 | 784 | 280 |  |
| Greenwich Village | 31 | 16 | 17 | 1/4/3 | 9/13/115 | 14/13/181 | 0 | 0 | 3 | 550 | 299 |  |
| Upper West Side | 33 | 23 | 14 | 2/6/10 | 14/11/151 | 18/8/142 | 0 | 1 | 5 | 1730 | 303 |  |
| Chinatown | 35 | 20 | 15 | 10/8/80 | 15/13/195 | 8/7/56 | 0 | 7 | 6 | 371 | 331 |  |
| Astoria / LIC | 37 | 21 | 16 | 5/2/10 | 20/11/220 | 16/13/208 | 0 | 4 | 1 | 2156 | 438 |  |
| Chelsea | 40 | 18 | 28 | 3/8/21 | 11/24/260 | 14/19/264 | 0 | 2 | 7 | 629 | 545 |  |
| Flatiron / NoMad | 61 | 19 | 44 | 1/5/4 | 11/27/296 | 15/38/569 | 0 | 0 | 4 | 664 | 869 |  |
| West Village | 128 | 55 | 76 | 5/27/134 | 32/64/2046 | 46/47/2161 | 0 | 4 | 26 | 469 | 4341 |  |
| SoHo / Nolita / Tribeca | 149 | 73 | 79 | 12/29/346 | 46/63/2896 | 55/50/2749 | 0 | 11 | 28 | 827 | 5991 |  |
| East Village / LES | 220 | 65 | 161 | 11/61/668 | 51/142/7238 | 49/100/4897 | 0 | 10 | 60 | 753 | 12803 |  |

**Summary:** 25 groups · **4 dead** (zero composable pairs in any tier) · **7 with any role <3 venues**.

### Koreatown (focus row)

- total=27 · mains=25, OC=3
- casual 1/2/2 · nice_out 13/3/38 · splurge 22/1/21
- dead tiers=0
- swap main worst-tier=0 (casual has only 1 main eligible)
- swap OC worst-tier=0 (splurge has only 1 OC eligible)
- median pairwise distance=286m
- Σ pairs=61

Koreatown's elevated swap rate is consistent with the OC shortage: 3 OC-eligible venues total across the whole group, and only 1 in splurge. With Plan B captured as `scored[1]` from the same scoring run, a user who rejects the picked OC has at most 2 alternatives at nice_out (median tier) and 0 at splurge.

---

## Part 3 — Flags

### Dead groups (no composable pair in any tier; cannot produce an itinerary if selected alone)
1. **East Williamsburg / Bushwick** — 20 active, **0 mains** across the entire group
2. **Fort Greene / Clinton Hill** — 1 active total
3. **Park Slope / Prospect** — 3 active, **0 mains**
4. **Bed-Stuy / Crown Heights** — 1 active total

### Any role <3 venues total (in addition to the 4 dead)
- **Harlem / Uptown** — mains=2
- **DUMBO / Brooklyn Heights** — mains=2
- **South Brooklyn** — OC=2

---

## Methodology

- Source: throwaway `scripts/coverage-audit.ts`, run on 2026-06-09, deleted after run.
- Connection: service-role Supabase client.
- Data: `composer_venues_v2 where active = true`.
- Role expansion: `ROLE_EXPANSION` from `src/config/generated/stop-roles.ts` — `drinks→[opener,closer]`, `activity→[opener]`, `coffee→[opener]`, otherwise identity. A venue is "main-eligible" iff `expandedRoles ⊇ {main}`; "OC-eligible" iff `expandedRoles ∩ {opener, closer} ≠ ∅`.
- Tier sets: `BUDGET_TIER_MAP` — casual=[1], nice_out=[1,2], splurge=[2,3]. No widening (widening is a global-pool operation in `/api/generate`, not per-group; showing strict per-group counts reflects what a single-group user sees).
- Pairs: ordered (OC, main). Subtracts venues role-eligible for both roles so a venue isn't paired with itself.
- Median distance: haversine across all `C(n, 2)` in-group venue pairs.

## Caveats

- Distances and counts are point-in-time snapshots; new sheet imports will move them.
- "Dead" assumes the group is selected **alone**. Per Part 1 answer 2, a dead group paired with a healthy one is fine.
- CLAUDE.md states `minGroupVenuesToRender = 50`. Live value is **25** — should be reconciled separately.

## What's NOT in this report

- Recommendations. (Spec said numbers + diagnostic answers only.)
