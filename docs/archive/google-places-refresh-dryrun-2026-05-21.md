# Google Places refresh — dry-run results

**Date:** 2026-05-21
**Script:** `scripts/refresh_google_places_data.py`
**Mode:** Dry-run (no writes performed)

## Summary

```
Total active venues to refresh:    1328
Skipped (no place_id):             0
Successful lookups:                1328
Lookup errors (network/5xx):       0
Place IDs not found (404):         0
Venues with material changes:      1270
enriched flipped to 'yes':         19
```

All 1,328 venues resolved cleanly. Zero 404s, zero network errors. The 19 venues that flipped `enriched` to `yes` are exactly the K-town venues backfilled earlier today (the 18 high-confidence + Mari + Dookki re-resolve).

## 🔴 9 venues — business_status change (REQUIRES REVIEW)

These were `OPERATIONAL` in the sheet but Google now reports them as closed:

```
v0015  Book Club Bar               OPERATIONAL → CLOSED_TEMPORARILY
v0260  Bandits Burger + Dive       OPERATIONAL → CLOSED_PERMANENTLY
v0359  Five Senses (Koreatown)     OPERATIONAL → CLOSED_PERMANENTLY
v0498  Oi bozu                     OPERATIONAL → CLOSED_PERMANENTLY
v0924  Mah-Ze-Dahr Bakery          OPERATIONAL → CLOSED_PERMANENTLY
v1057  SculptureCenter             OPERATIONAL → CLOSED_TEMPORARILY
v1100  Larry's Ca Phe              OPERATIONAL → CLOSED_PERMANENTLY
v1194  Archestratus Books + Foods  OPERATIONAL → CLOSED_PERMANENTLY
v1231  Dae                         OPERATIONAL → CLOSED_PERMANENTLY
```

7 permanent closures, 2 temporary. These are the venues that need a human call — `apply` will write the new status, which means the generation pipeline will exclude them from itineraries (the route already drops `CLOSED_PERMANENTLY` and `CLOSED_TEMPORARILY` at `src/app/api/generate/route.ts:224-227`).

## ⚠️ 1 place_id change (unexpected)

```
v0293  Canoe   ChIJifrVXQBZwokR7G1KOWW_dgU → ChIJl822lfFZwokRSujKoE4Cgys
```

Google's Places Details endpoint sometimes returns a **different** place_id for the same place — this happens when Google's place data gets consolidated / re-canonicalized. The new ID is the current canonical one for "Canoe". Both IDs typically resolve to the same venue. Safe to accept the new one (it future-proofs the lookup). Worth eyeballing on Google Maps before approving.

## Rating changes — modest overall drift

```
changed:       114 venues
avg delta:     -0.021  (very mild overall drift)
max delta:     -0.60
> 0.3 drops:   2 venues
  v0147  canteenM                        4.4 → 4.1 (-0.30)
  v0915  Morgenstern's Finest Ice Cream  5.0 → 4.4 (-0.60)
```

Average drift of -0.02 is noise. The two big drops:

- **canteenM** -0.30 — within the band where it could be 1-2 bad recent reviews on a venue with few total reviews. Probably accurate; nothing to do.
- **Morgenstern's** -0.60 from 5.0 to 4.4 — going from 5.0 is unusual (very few ratings to start with, more accumulated). Almost certainly a legitimate rating settling-in, not a data error.

## Cost

**~$26.56** at $0.020/call. (Conservative Places Details v1 Advanced-tier estimate. Actual could be slightly less.)

## What `--apply` will do

If approved:

1. Write a snapshot CSV at `scripts/snapshots/google_refresh_YYYYMMDD_HHMMSS.csv` (rollback ammunition)
2. Single Sheets `batchUpdate` covering 8 columns × 1,328 venues = ~10,624 cells, atomic
3. Touches **only** AP, AV, AW, AX, AY, AZ, BA, AI — hardcoded whitelist, any other column rejected
4. Print next step: `npm run import-venues -- dry-run` then `apply` to sync the refreshed values from sheet → Supabase

## Decisions to make before `--apply`

1. **Spot-check the 9 closures.** If any are actually still open (Google is sometimes wrong, especially for venues that don't update their Google profile), the apply will exclude them from itineraries. Options:
   - Approve as-is (trust Google, lose those venues from rotation)
   - Pre-emptively set them to `active=no` in the sheet so they're explicitly out
   - Investigate each before approving
2. **Spot-check Canoe's new place_id** on Google Maps (`ChIJl822lfFZwokRSujKoE4Cgys`) — confirm it's the same venue.
3. **Decide on cost.** $26.56 is fine for a one-shot full refresh; if planning to run this monthly that's ~$320/year on this single SKU.

## Operational notes

- Verified all 8 sheet column letters (AP, AI, AV, AW, AX, AY, AZ, BA) match the live sheet's row-2 headers before doing any work. The script halts on mismatch.
- Rate-limited to 5 RPS (below Google's 10 RPS hard cap). Full run took ~5 minutes.
- Retry logic: 3 retries with exponential backoff on 429 / 5xx. Zero retries needed in this run.
- `last_verified` will bump to today's date for every venue refreshed (bookkeeping, not counted as a material change).
- Reference: `scripts/refresh_google_places_data.py` is the durable artifact; safe to re-run as a periodic refresh job.
