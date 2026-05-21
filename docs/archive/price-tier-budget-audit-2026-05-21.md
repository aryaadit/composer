# `price_tier` × budget — end-to-end trace

**Date:** 2026-05-21
**Trigger:** Decide whether setting `price_tier = NULL` on the 322 unrated venues hides them from non-`no_preference` users.

## The flow at a glance

1. **Pre-scoring hard filter** in `route.ts:231-247` — drops venues outside the user's tier band; widens if the pool gets thin.
2. **In-scorer match** in `scoring.ts:95-99` — awards 15 pts to surviving venues whose tier is in the (possibly post-widened) allowed set.

Both code paths share the **same null-coercion default** (`?? 2`) and the **same tier map** (`BUDGET_TIER_MAP`).

---

## 2a. What range qualifies per budget slug

The map lives in `src/config/generated/budgets.ts:10-31`, surfaced as `BUDGET_TIER_MAP` at `src/config/budgets.ts:38-40`:

| UI slug | UI label | `tiers` allowed |
|---|---|---|
| `casual` | "Budget" (override at `budgets.ts:14`) | `[1]` |
| `nice_out` | "Solid" | `[2]` |
| `splurge` | "Splurge" | `[3]` |
| `all_out` | "All Out" | `[4]` |
| `no_preference` | "No Preference" | `[1, 2, 3, 4]` |

So "Solid" (slug `nice_out`) **only** matches `price_tier = 2`. Each non-preference bucket is a **single-tier** match — not a range — before widening kicks in.

**Exact comparison code (filter):** `route.ts:232-236`
```ts
const allowedTiers = BUDGET_TIER_MAP[body.budget] ?? [1, 2, 3, 4];
let budgetFiltered = venues.filter(
  (v) => allowedTiers.includes(v.price_tier ?? 2)
);
```

**Exact comparison code (scorer):** `scoring.ts:96-99`
```ts
const allowedTiers = BUDGET_TIER_MAP[answers.budget] ?? [1, 2, 3];
if (allowedTiers.includes(venue.price_tier ?? 2)) {
  score += W.budget;
}
```

(Minor inconsistency worth flagging: the scorer's fallback for an unknown slug is `[1, 2, 3]`, the filter's is `[1, 2, 3, 4]`. Only matters if `body.budget` is something not in the map — which today is unreachable.)

**Widening kicks in** at `route.ts:237-244` when the filtered pool drops below `ALGORITHM.pools.minBudgetWideningThreshold = 30` (`algorithm.ts:209`). `widenBudgetTiers()` (`budgets.ts:63-70`) expands by ±1:

- `casual [1]` → `[1, 2]`
- `nice_out [2]` → `[1, 2, 3]`
- `splurge [3]` → `[2, 3, 4]`
- `all_out [4]` → `[3, 4]`

Widening is **once-only** — there's no second cascade if the widened pool is still thin.

## 2b. What happens to `price_tier = null`

Coerced to `2` via `v.price_tier ?? 2` in both code paths:
- Pre-scoring filter: `route.ts:235` and `route.ts:240`
- In-scorer match: `scoring.ts:97`

Comment at `route.ts:233`: `// Null price_tier defaults to tier 2 ("nice_out") — same as scoring.`

So a null-tier venue is **silently treated as a tier-2 venue** everywhere. Same display behavior too — `calculateTotalSpend()` (`route.ts:322`) uses the same fallback for spend calculation.

## 2c. Filter vs. scoring — both, not one

**Two distinct gates, applied sequentially:**

1. **Hard filter** at `route.ts:231-247` — venues outside `allowedTiers` are **removed from the pool entirely** before any scoring happens.
2. **Scoring component** at `scoring.ts:96-99` — surviving venues either get the full 15 points (`W.budget` from `algorithm.ts:99`) or zero from this signal.

Per the ALGORITHM.md note: budget is the only signal that's *both* a hard filter *and* a scoring tiebreaker. After widening, in-tier venues outscore widened-in venues by the 15-pt budget bonus — that's how the scorer prefers exact-tier matches over compromise picks.

---

## 3. Pre-scoring filter location

**Yes, the budget hard filter lives in `src/app/api/generate/route.ts`, not in scoring.ts.** Specifically `route.ts:229-247`. The scorer trusts that the pool it receives has already been budget-filtered.

The order of pre-scoring filters in `route.ts` (top-down):
1. `active = true` — Supabase query at L177 (approx — `.eq("active", true)`)
2. Exclude-list trim — L184-205
3. Drinks filter (if profile says `no`) — L213-217
4. Time block coverage — L221-224 approx
5. `business_status` closed exclusion — L224-227
6. **Budget tier hard filter** — L231-247

Neighborhood + outdoor-in-bad-weather + role-match filters all happen INSIDE the scorer at `scoring.ts:124-145` (the `hardFilter()` function called by `pickBestForRole`).

---

## 4. The question: are 322 null-tier venues invisible to non-`no_preference` users?

**No, they're not invisible — but the answer is nuanced.**

Live DB count (queried `composer_venues_v2 WHERE active = true GROUP BY price_tier`):
```
NULL → 322
   1 → 254
   2 → 526
   3 → 182
   4 →  45
```

Total active: 1,329. Null-tier: 322 (24%).

Because the code does `v.price_tier ?? 2` everywhere, **every null-tier venue is treated as if it had `price_tier = 2`.** Consequences per user budget pick:

| User picks | Tiers allowed (pre-widen) | Null-tier venues visible? |
|---|---|---|
| `casual` (slug for "Budget") | `[1]` | ❌ Hidden (null→2, not in `[1]`) |
| `nice_out` ("Solid") | `[2]` | ✅ **All 322 visible** (null→2, in `[2]`) |
| `splurge` | `[3]` | ❌ Hidden (null→2, not in `[3]`) |
| `all_out` | `[4]` | ❌ Hidden |
| `no_preference` | `[1,2,3,4]` | ✅ Visible |

After widening (if pool drops below 30):
- Casual widens to `[1,2]` → now picks up null venues
- Splurge widens to `[2,3,4]` → now picks up null venues
- All Out widens to `[3,4]` → still excludes null venues

So nulls don't disappear — they collapse onto **the tier-2 (Solid) bucket**. A user picking "Solid" effectively sees the full curated tier-2 set (526) plus all 322 unrated venues mixed in, with no signal distinguishing them. A user picking "Splurge" sees 182 real tier-3 venues, with the 322 null-tier venues silently excluded — but **they don't know that**, because the UI doesn't tell them their pool is missing 24% of the catalog.

**Setting price_tier to NULL on 322 venues doesn't make them invisible — it makes them mis-classified as tier 2.** That's worse for the "Solid" bucket (over-inclusive: untagged stuff dilutes the curated set) and worse for "Casual"/"Splurge"/"All Out" (under-inclusive: those 322 are silently excluded from any non-tier-2 bucket).

If the actual goal is "hide unrated venues unless the user explicitly opts out of budget filtering," you'd want a sentinel value — perhaps treating null as "matches all tiers" so it always passes, or excluding null entirely except on `no_preference`. The current `?? 2` is the lazy default and the one place where the system silently lies about coverage.

---

## 5. ALGORITHM constants

| Constant | File:line | Value | Purpose |
|---|---|---|---|
| `ALGORITHM.weights.budget` | `algorithm.ts:99` | `15` | Scoring weight when in-tier |
| `ALGORITHM.pools.minBudgetWideningThreshold` | `algorithm.ts:209` | `30` | Pool size below which widen ±1 tier |

There is **no `ALGORITHM.budgets` block** — the slug→tier mapping isn't an `algorithm.ts` knob. It lives in `src/config/generated/budgets.ts` (sheet-side) and is consumed via `BUDGET_TIER_MAP` from `src/config/budgets.ts`. The only `algorithm.ts` knobs related to budget are the scoring weight and the widening threshold above.
