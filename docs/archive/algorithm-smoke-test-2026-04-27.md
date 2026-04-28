# Algorithm Smoke Test Results

**Date:** 2026-04-27
**Server:** localhost:3000
**Auth:** None required (generate route handles missing auth gracefully)

---

## Results

| # | Test | Body | Expected | Actual | Result |
|---|------|------|----------|--------|--------|
| 1 | Determinism | relationship / drinks_led / splurge / evening / west_village+chelsea+flatiron+nomad | Same venue IDs on two identical requests | Run 1: `[ea4f09fe, 5a7b209d, f567d91a]` Run 2: `[ea4f09fe, 5a7b209d, f567d91a]` | **PASS** |
| 2 | Casual hard filter | casual / food_forward / evening / west_village | Every stop price_tier === 1 | Tiers: `[1, 1, 1]` | **PASS** |
| 3 | Splurge hard filter | splurge / food_forward / evening / west_village | Every stop price_tier === 3 | Tiers: `[3, 3, 3]` | **PASS** |
| 4 | Budget widening | splurge / food_forward / morning / east_williamsburg+bushwick | Widening kicks in (thin pool) or all tier 3 | Tiers: `[2, 3]` — widened. Names: Benvenuto Cafe, Locanda Verde Tribeca | **PASS** |
| 5 | Category diversity | drinks_led / splurge / evening / west_village | >= 2 distinct categories across 3 stops | Categories: `[bar, french, speakeasy]` (3 distinct). Names: Arthur's Tavern, Dante West Village, Little Branch | **PASS** |

**5/5 PASS**

---

## What was tested

### Test 1: Determinism (seeded PRNG)
Verifies that `computeRequestSeed()` + `createSeededRandom()` produce identical jitter for identical inputs, making venue selection deterministic. Two POST requests with the same body must return the same venue IDs.

### Test 2: Casual budget hard filter
Verifies that budget is now a hard filter, not just a scoring signal. A "casual" request should only return tier 1 venues. Previously, high-scoring tier 2-3 venues could appear.

### Test 3: Splurge budget hard filter
Same as Test 2 but for "splurge" — all tier 3.

### Test 4: Budget widening on thin pools
Uses a deliberately thin combination (morning + bushwick + splurge + food_forward) to trigger the widening logic. When fewer than 30 venues pass the budget filter, `widenBudgetTiers()` expands by ±1 tier. Result shows tier 2 venues appearing alongside tier 3, confirming widening worked.

### Test 5: Category diversity penalty
Verifies the -20 `categoryDuplicate` penalty in `ALGORITHM.penalties`. A drinks-led evening in West Village (many bars/speakeasies) should produce diverse categories rather than three of the same type.

---

## Implementation references

| Feature | File | Key function/constant |
|---------|------|-----------------------|
| Tuning constants | `src/config/algorithm.ts` | `ALGORITHM` object |
| Seeded PRNG | `src/lib/itinerary/seed.ts` | `computeRequestSeed()`, `createSeededRandom()` |
| Budget hard filter | `src/app/api/generate/route.ts` | Budget filter block after closed-venue filter |
| Budget widening | `src/config/budgets.ts` | `widenBudgetTiers()` |
| Category penalty | `src/lib/scoring.ts` | `usedCategories` check in `pickBestForRole()` |
| Category tracking | `src/lib/composer.ts` | `usedCategories: Set<string>` |
