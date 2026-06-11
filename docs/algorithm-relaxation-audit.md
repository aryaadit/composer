# Algorithm relaxation audit — 2026-06-11

Read-only inventory of every relaxation, fallback, widening, and degradation rule across the three generation endpoints (`/api/generate`, `/api/swap-stop`, `/api/add-stop`). Built from a code-first trace; where ALGORITHM.md, CLAUDE.md, or `src/config/algorithm.ts` comments disagree with code, **code wins** and the disagreement is logged.

---

## Headline (TL;DR)

1. **Budget is NOT a hard filter on every path.** It is hard on `/api/generate` with an upward-widening branch when the post-filter pool drops below 30. For casual specifically, that widening moves `[1] → [1, 2]` silently — the documented "downward-permissive" framing is a no-op for casual because there is no tier below 1. **The June 10 audit observation of silent upsell in thin casual neighborhoods is real and reproducible.**
2. **Budget is missing entirely from `/api/swap-stop` and `/api/add-stop`.** Neither endpoint applies `BUDGET_TIER_MAP`, time-window, business-status closed-out, or the cascade pre-filter stack. A swap or add can pull a tier-4 venue into a casual itinerary, return a closed-permanently venue, or surface a venue that isn't open during the user's chosen time block. Only the +15 scoring bonus discourages off-tier picks, and other signals easily overcome it.
3. **The Astoria 1-stop case is confirmed.** `composer.ts:140-141` degrades the itinerary to a single Main stop when no STOP_1_POOL venue clears the 1.5 km (0.4 km in bad weather) proximity cap from Main. Geography is the always-hard constraint; **stop count gives, geography holds**.
4. **Cross-neighborhood reach is endpoint-specific.** Initial generation can cross neighborhoods only via the final `relaxedFilter` cascade step inside `pickBestForRole`, and only for stop 1 (Main is enforced). Swap-stop (non-Main) and add-stop never enforce the user's chosen neighborhoods at all — proximity to Main is the only geographic constraint.
5. **Every relaxation is silent.** Two terminal failure copies exist (`"No nearby venues available to extend"` for add-stop, `"No other good matches — try adjusting your filters"` for swap-stop). Nothing else surfaces to the user when constraints loosen — the `truncated_for_end_time` flag is set on the response but no UI reads it.

---

## Direct answer to the budget question

**Soft. Silently soft on `/api/generate`; entirely absent on `/api/swap-stop` and `/api/add-stop`.**

The widening mechanism on `/api/generate`:

```ts
// src/app/api/generate/route.ts:286-305
let allowedTiers: number[] = [...(BUDGET_TIER_MAP[body.budget] ?? [1, 2, 3, 4])];
let budgetFiltered = venues.filter(
  (v) => allowedTiers.includes(v.price_tier ?? 2),
);
const maxTier = Math.max(...allowedTiers);
if (
  budgetFiltered.length < ALGORITHM.pools.minBudgetWideningThreshold && // 30
  maxTier < 4
) {
  const widened = [...allowedTiers, maxTier + 1];
  budgetFiltered = venues.filter((v) => widened.includes(v.price_tier ?? 2));
  console.info(
    `[generate] budget pool thin (${budgetFiltered.length} after upward widening from [${allowedTiers}] to [${widened}])`,
  );
  allowedTiers = widened;
}
venues = budgetFiltered;
```

For casual (`BUDGET_TIER_MAP.casual = [1]` per [src/config/generated/budgets.ts:11-13](../src/config/generated/budgets.ts#L11-L13)), `maxTier = 1 < 4`, so any thin casual neighborhood (post-time-window/closed-status/drinks filter pool < 30) silently widens to `[1, 2]`. The +15 scoring bonus from `BUDGET_PRIMARY_TIER.casual = 1` ([src/config/budgets.ts:64-70](../src/config/budgets.ts#L64-L70)) still nudges tier-1 venues higher, but in a pool where no tier-1 candidate clears the role / proximity / category cascade, a tier-2 venue wins.

The user sees the tier-2 venue's price range:
```tsx
// src/components/ui/StopCard.tsx:191-195
{stop.spend_estimate} ...
// stop.spend_estimate = spendEstimate(venue.price_tier ?? 2)
//   tier-1: "$15–30", tier-2: "$35–65"
```
…against a questionnaire card labeled **"Budget"** (`BUDGET_LABEL_OVERRIDES.casual = "Budget"`, [src/config/budgets.ts:13-18](../src/config/budgets.ts#L13-L18)) with description **"Around $30–60 per person, nothing fussy"** ([src/config/budgets.ts:20-26](../src/config/budgets.ts#L20-L26)). The widening is logged only to server stdout — no banner, no analytics event, no Gemini prompt annotation.

Additionally, swap-stop and add-stop **skip the budget filter entirely** ([src/app/api/swap-stop/route.ts:117-147](../src/app/api/swap-stop/route.ts#L117), [src/app/api/add-stop/route.ts:80-110](../src/app/api/add-stop/route.ts#L80)). Once an itinerary exists, every post-generation modification can pull any tier.

**This explains the June 10 audit observation precisely.**

---

## Rule inventory

Grouped by endpoint. Every row is one constraint-loosening rule. **W** = widening, **R** = relaxation/cascade, **D** = degradation, **T** = graceful trim. Crosses-N = "can this rule alone or in combination lead to a venue outside the user-selected neighborhood union being returned?"

### /api/generate

| # | rule | type | constraint loosened | trigger (file:line) | order | crosses-N | surfaced | copy / log |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | exclude-list graceful trim | T | exclude list | `excludeIds.length > 0 && pool − excludeIds < minPoolSize (4)` — drops oldest IDs from list tail [route.ts:217-238](../src/app/api/generate/route.ts#L217) | 1st (before any other filter) | no | silent | `console.info("partial exclusion: dropped N oldest IDs...")` |
| 2 | drinks=no profile filter | (hard cull) | none | `prefs.drinks === "no"` — drops alcohol-vibe venues [route.ts:249-253](../src/app/api/generate/route.ts#L249) | 2nd | no | silent | — |
| 3 | time-window filter (no widening) | (hard) | none | `venueOpenForWindow(v, dayColumn, window)` — logs warning if `< 30` after [route.ts:260-269](../src/app/api/generate/route.ts#L260) | 3rd | no | silent | log only on thin |
| 4 | closed-status filter | (hard) | none | `business_status ∉ {CLOSED_PERMANENTLY, CLOSED_TEMPORARILY}` [route.ts:272-276](../src/app/api/generate/route.ts#L272) | 4th | no | silent | — |
| 5 | **budget hard filter** | (hard) | budget tier | `v.price_tier ?? 2 ∈ BUDGET_TIER_MAP[budget]` [route.ts:286-289](../src/app/api/generate/route.ts#L286) | 5th | no | silent | — |
| 6 | **budget upward widening** | **W** | **budget tier** | **`budgetFiltered.length < 30 && maxTier < 4` — adds `maxTier+1` to allowed set** [route.ts:292-305](../src/app/api/generate/route.ts#L292) | **6th (post-budget-filter)** | no | **silent** | **`console.info("budget pool thin (... upward widening from [X] to [Y])")` only** |
| 7 | strict candidateFilter (role+hint+neighborhood) | (hard) | none | inside `pickBestForRole`, first pass [scoring.ts:268-269](../src/lib/scoring.ts#L268) | 7th | no | silent | — |
| 8 | venueRoleHint drop | R | venueRoleHint | strict pass returns 0 AND a hint was supplied; retries `hardFilter` without hint [scoring.ts:271-274](../src/lib/scoring.ts#L271) | 8th | no | silent | — |
| 9 | **neighborhood cascade drop (relaxedFilter)** | **R** | **neighborhood + hint + occasion-scoring signals** | **hint-drop also returns 0; `relaxedFilter` keeps only active/exclude/role-pool/weather-outdoor** [scoring.ts:275-279](../src/lib/scoring.ts#L275), [scoring.ts:176-189](../src/lib/scoring.ts#L176) | **9th — last cascade step** | **yes** | **silent** | — |
| 10 | proximity-to-Main hard cap | (hard) | none | `applyProximity` with `maxWalkKmNormal=1.5` / `maxWalkKmBadWeather=0.4` — never widens [scoring.ts:205-209](../src/lib/scoring.ts#L205) | always-hard, applied to every cascade level | sometimes | silent | — |
| 11 | weather/outdoor gate | (hard) | none | `weather.is_bad_weather && v.outdoor_seating === "yes"` — survives `relaxedFilter` [scoring.ts:171, 186](../src/lib/scoring.ts#L171) | every cascade level | no | partial | weather note shown in composition header **only when conditions affected the output** |
| 12 | **single-stop degradation** ("Astoria 1-stop case") | **D** | **stop count** | `pickBestForRole(stop1)` returned `best === null` after full cascade [composer.ts:140-141](../src/lib/composer.ts#L140) | terminal | no | **silent** | `trackServer("itinerary_fallback_single_stop", reason="no_pairs_walkable")` server-only; flag not on the response |
| 13 | end-time buffer truncation | D | stop count | post-composition arrival exceeds `endTime − lastStartBufferMin (30)`; drops trailing stops; sets `truncated_for_end_time=true` [route.ts:62-79](../src/app/api/generate/route.ts#L62) | terminal | no | silent | flag set on response, **never read by any UI component** (grep-confirmed) |
| 14 | empty composition → 404 | (terminal) | none | composed.stops empty even after cascade [route.ts:322-327](../src/app/api/generate/route.ts#L322) | terminal | no | surfaced | `"No matching venues found"` (404) |

### /api/swap-stop

| # | rule | type | constraint loosened | trigger (file:line) | order | crosses-N | surfaced | copy |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 15 | **anchor=Main (non-Main swap)** | R | neighborhood (never enforced) | `stopToReplace.role !== "main"` → anchor = mainStop.venue [swap-stop/route.ts:135-137](../src/app/api/swap-stop/route.ts#L135); flows to `enforceNeighborhood = anchor === null === false` [scoring.ts:264](../src/lib/scoring.ts#L264) | always (for non-Main swaps) | **yes** | silent | — |
| 16 | anchor=null (Main swap) | (default) | none | `stopToReplace.role === "main"` → anchor=null → enforceNeighborhood=true [swap-stop/route.ts:135-137](../src/app/api/swap-stop/route.ts#L135) | n/a | no (until cascade #18 fires) | silent | — |
| 17 | exclude-list build (NO graceful trim) | (cull) | none | `usedIds = excludeVenueIds ∪ all current stops ∪ all plan_b's` [swap-stop/route.ts:127-131](../src/app/api/swap-stop/route.ts#L127); **no minPoolSize loop** unlike #1 | always | no | silent | — |
| 18 | pickBestForRole cascade (drop hint → relaxedFilter) | R | hint, neighborhood | same scoring.ts cascade as #8-#9 | always | yes (for Main swap only) | silent | — |
| 19 | Resy enrichment with `candidatePool=undefined` | R | availability gate | passes undefined to `enrichWithAvailability` [swap-stop/route.ts:177-183](../src/app/api/swap-stop/route.ts#L177) | post-pick | no | silent | — |
| 20 | **NO budget filter** | R | budget tier | not applied [swap-stop/route.ts:117-147](../src/app/api/swap-stop/route.ts#L117) | always | no | silent | — |
| 21 | **NO time-window filter** | R | time window | not applied (same range) | always | no | silent | — |
| 22 | **NO closed-status filter** | R | closed status | not applied (same range) | always | no | silent | — |
| 23 | terminal failure | (terminal) | none | `pickBestForRole` returned null [swap-stop/route.ts:149-154](../src/app/api/swap-stop/route.ts#L149) | terminal | no | surfaced | **`"No other good matches — try adjusting your filters"`** (404) |

### /api/add-stop

| # | rule | type | constraint loosened | trigger (file:line) | order | crosses-N | surfaced | copy |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 24 | **anchor=Main (always)** | R | neighborhood (never enforced) | unconditional [add-stop/route.ts:98-110](../src/app/api/add-stop/route.ts#L98) | always | **yes** | silent | — |
| 25 | exclude-list build (NO graceful trim) | (cull) | none | `usedIds = current stops ∪ plan_b's` (no client-side excludeIds) [add-stop/route.ts:92-96](../src/app/api/add-stop/route.ts#L92) | always | no | silent | — |
| 26 | pickBestForRole cascade | R | hint, neighborhood | same scoring.ts cascade; STOP_1_POOL = `[opener, closer]` | always | yes (via #9) | silent | — |
| 27 | **NO budget / time / closed filters** | R | budget tier + time + closed | not applied [add-stop/route.ts:80-110](../src/app/api/add-stop/route.ts#L80) | always | no | silent | — |
| 28 | terminal failure | (terminal) | none | `pickBestForRole` returned null [add-stop/route.ts:112-117](../src/app/api/add-stop/route.ts#L112) | terminal | no | surfaced | **`"No nearby venues available to extend"`** (404) |

---

## The degradation ladder — what gives first

When `/api/generate`'s pool comes up thin, the system walks (in order):

1. **Exclude-list trim** ([route.ts:217-238](../src/app/api/generate/route.ts#L217)) — drops oldest seen-IDs to keep pool ≥ 4. Cheap, often invisible.
2. **Budget upward widening** ([route.ts:292-305](../src/app/api/generate/route.ts#L292)) — adds `maxTier+1` to allowed tier set if post-budget pool < 30 and `maxTier < 4`. **Silent.**
3. **venueRoleHint drop** ([scoring.ts:271-274](../src/lib/scoring.ts#L271)) — only relevant when a hint exists (drinks_led → drinks, activity_food → activity). food_forward has no hint, so this branch is dead for that vibe.
4. **Neighborhood cascade drop (relaxedFilter)** ([scoring.ts:275-279](../src/lib/scoring.ts#L275)) — drops the user's neighborhood preference (for the role being picked); keeps active / exclude / role-pool / weather-outdoor. Proximity to Main still hard.
5. **Stop count degradation** ([composer.ts:140-141](../src/lib/composer.ts#L140)) — if step 4 still returns nothing for stop 1, the composer returns Main alone. **Geography held; stop count gave.** This is the Astoria 1-stop case.
6. **End-time buffer truncation** ([route.ts:62-79](../src/app/api/generate/route.ts#L62)) — independent of cascade; drops trailing stops if the timeline would overflow `endTime`. Sets `truncated_for_end_time=true` (unread).
7. **Terminal 404** ([route.ts:322-327](../src/app/api/generate/route.ts#L322)) — if even Main couldn't be picked.

**What NEVER gives** (in /api/generate):
- Proximity-to-Main cap (1.5 km / 0.4 km in bad weather)
- Closed-status filter (CLOSED_PERMANENTLY / CLOSED_TEMPORARILY drops are permanent)
- Time-window filter (logs warning at <30 but doesn't widen)
- Weather/outdoor drop in bad weather
- Vibe / occasion (both are scoring signals only — never hard-filter; no widening because they were never a hard cut)

For `/api/swap-stop` and `/api/add-stop` the ladder is much shorter:
1. **Cascade** (hint drop, then relaxedFilter neighborhood drop — but neighborhood was never enforced for these endpoints since anchor=Main).
2. **Terminal 404** with the user-facing copy noted above.

---

## Cross-neighborhood reach map

> Does the algorithm, under any condition, return a venue outside the user-selected neighborhood union? **Yes — three paths.**

| path | endpoint | condition | how far it reaches |
| --- | --- | --- | --- |
| relaxedFilter for stop 1 | /api/generate | strict hardFilter and hint-drop both return zero candidates within proximity to the (in-neighborhood) Main | **Anywhere within 1.5 km (or 0.4 km bad weather) of the Main venue.** In practice: adjacent neighborhoods that abut the picked Main. The +10 in-neighborhood scoring bonus still penalizes the outsider, so they win only when no in-neighborhood candidate qualifies. |
| relaxedFilter for swap-Main | /api/swap-stop | user is swapping Main itself (anchor=null → enforceNeighborhood=true → cascade reaches relaxedFilter) | **Anywhere active + role-compatible + non-outdoor-in-bad-weather**, with no proximity anchor at all in this code path — so effectively **citywide**. |
| no neighborhood enforcement | /api/swap-stop (non-Main) and /api/add-stop | always — anchor=Main means `enforceNeighborhood=false` from the start | **Anywhere within 1.5 km / 0.4 km of Main.** Same reach as path 1, but unconditional, not a fallback. |

The user-selected neighborhood union is honored only on /api/generate, and only for the Main pick. Every other selection point — stop 1, swap-stop on a non-Main, add-stop — can pull from outside the user's neighborhoods as long as proximity to Main holds.

---

## User-facing copy audit — what the user sees when constraints loosen

| event | what user sees | file:line |
| --- | --- | --- |
| budget upward widening | nothing — composition header shows `"$X–Y total"`; per-stop card shows the venue's actual tier dollars | [CompositionHeader.tsx:65-71](../src/components/itinerary/CompositionHeader.tsx#L65), [StopCard.tsx:191-195](../src/components/ui/StopCard.tsx#L191) |
| neighborhood cascade drop | nothing — venue's neighborhood is shown on its card with no "outside your chosen area" annotation | [StopCard.tsx:191-195](../src/components/ui/StopCard.tsx#L191) |
| venueRoleHint drop | nothing — role label on the card still shows the canonical role | — |
| single-stop degradation (Astoria) | a 1-stop itinerary with no explanation; analytics fires `itinerary_fallback_single_stop` server-side only | [route.ts:474-490](../src/app/api/generate/route.ts#L474) |
| exclude-list trim | nothing — `console.info` server log only | [route.ts:230-237](../src/app/api/generate/route.ts#L230) |
| end-time buffer truncation | nothing — `truncated_for_end_time=true` is on the response but no component reads it | grep-verified across `src/components/` and `src/app/itinerary/` |
| weather affected the output | weather note in composition header **only if conditions changed the result** | [CompositionHeader.tsx:65-71](../src/components/itinerary/CompositionHeader.tsx#L65) |
| swap-stop terminal failure | `"No other good matches — try adjusting your filters"` (404) | [swap-stop/route.ts:149-154](../src/app/api/swap-stop/route.ts#L149) |
| add-stop terminal failure | `"No nearby venues available to extend"` (404) | [add-stop/route.ts:112-117](../src/app/api/add-stop/route.ts#L112) |
| /api/generate empty composition | `"No matching venues found"` (404) | [route.ts:322-327](../src/app/api/generate/route.ts#L322) |
| user retroactively flags a swap as off-budget | swap reason modal includes `{ key: "out_of_budget", label: "Out of budget" }` — the **only** post-generation place "budget" appears in user copy | [SwapReasonModal.tsx:29](../src/components/itinerary/SwapReasonModal.tsx#L29) |

**Summary**: every widening / cascade / degradation is silent. The only user-facing copy related to constraint loosening is the two terminal-failure 404 messages and the conditional weather note.

---

## Code vs docs / config disagreements

Severity legend: **blocker** (breaks behavior or design intent), **misleading** (docs say something the code doesn't do), **cosmetic** (style or wording).

| # | area | code | docs / config | severity | citation |
| --- | --- | --- | --- | --- | --- |
| 1 | Casual tier-set "downward-permissive" | `BUDGET_TIER_MAP.casual = [1]` — no room to go down | `src/config/algorithm.ts:207-220` comment frames widening as "downward-permissive [so] no separate downward needed". True in aggregate, **misleading for casual specifically** because casual has no downward direction; the comment uses splurge as the only example. | misleading | [budgets.ts:11-13](../src/config/generated/budgets.ts#L11), [algorithm.ts:207-220](../src/config/algorithm.ts#L207) |
| 2 | swap-stop / add-stop respecting budget | not applied — any tier can be returned | CLAUDE.md "Hard Filters (Pre-Scoring)" lists budget as filter #6 implying universal | **blocker** | [swap-stop/route.ts:117-147](../src/app/api/swap-stop/route.ts#L117), [add-stop/route.ts:80-110](../src/app/api/add-stop/route.ts#L80), CLAUDE.md |
| 3 | swap-stop / add-stop respecting time window | not applied | CLAUDE.md "Hard Filters" same as above (#4 in that list) | blocker | same |
| 4 | swap-stop / add-stop respecting business_status | not applied | CLAUDE.md "Hard Filters" #5 | blocker | same |
| 5 | swap-stop / add-stop respecting neighborhood | only enforced for swap-Main (anchor=null); never for non-Main swaps or add-stop | CLAUDE.md "Hard Filters" #7 says neighborhood is applied "in pickBestForRole, relaxes when zero candidates" — does not flag that it's gated on `anchor===null` and thus inert for these endpoints | misleading | [scoring.ts:164-170, 264](../src/lib/scoring.ts#L164), CLAUDE.md |
| 6 | swap-stop / add-stop determinism | `Math.random` (no seeded PRNG passed) | CLAUDE.md "Determinism": "Same inputs → same seed → identical picks" — implicit but unscoped | misleading | [scoring.ts:254](../src/lib/scoring.ts#L254), [swap-stop/route.ts:139-147](../src/app/api/swap-stop/route.ts#L139), [add-stop/route.ts:102-110](../src/app/api/add-stop/route.ts#L102) |
| 7 | Jitter magnitude `10` hardcoded | literal `10` in swap-stop:146 and add-stop:109 | CLAUDE.md "Canonical Modules" + "What NOT To Do": every jitter magnitude lives in `algorithm.ts` | cosmetic | [swap-stop/route.ts:146](../src/app/api/swap-stop/route.ts#L146), [add-stop/route.ts:109](../src/app/api/add-stop/route.ts#L109) |
| 8 | minPoolSize gating filters | used only by the exclude-list trim ([route.ts:223](../src/app/api/generate/route.ts#L223)) | ALGORITHM.md line 32: "If a filter would leave fewer than minPoolSize venues, it's skipped with a logged warning" — implies universal | misleading | route.ts (verified by inspection: only one caller), ALGORITHM.md:32 |
| 9 | Silent skip for unfillable roles | composer.ts only has the explicit single-stop fallback at [composer.ts:141](../src/lib/composer.ts#L141); no per-role `continue` loop | ALGORITHM.md:128-130 describes `if (!best) continue` referring to an older variable-length template architecture | misleading | composer.ts:141, ALGORITHM.md:128-130 |
| 10 | Per-vibe stop patterns | single map `VIBE_STOP_1_HINTS`; always `[stop1, main]`; no closer | ALGORITHM.md:105-110 still describes `opener → main → closer` per-vibe patterns with "drinks bookend" — Phase 2 collapsed this | misleading | [templates.ts:23-27](../src/config/templates.ts#L23), [composer.ts:58-70](../src/lib/composer.ts#L58), ALGORITHM.md:105-110 |
| 11 | `truncated_for_end_time` flag | set on response | ALGORITHM.md:130 implies it's surfaced; grep confirms **no UI reads it** | misleading | route.ts:351-356, grep across `src/components/` and `src/app/itinerary/` |
| 12 | "Casual" label | UI shows **"Budget"** ([budgets.ts:13-18](../src/config/budgets.ts#L13)) | CLAUDE.md "Display labels: Casual / Solid / Splurge / All Out / No Preference" | misleading | budgets.ts:13-18, CLAUDE.md |
| 13 | Casual description vs tier-1 range | description says **"$30–60 per person"**; tier-1 range is `[15, 30]` ([budgets.ts:78](../src/config/budgets.ts#L78)) | The promised range starts where tier-1 ENDS — so even a strict tier-1 casual itinerary renders `spend_estimate = "$15–30"` per stop, below the $30 the user expected | cosmetic | [budgets.ts:20-26](../src/config/budgets.ts#L20), [budgets.ts:78](../src/config/budgets.ts#L78) |

The **blockers** (#2-#4) all stem from one root cause: swap-stop and add-stop start from `fetchActiveVenues()` and apply only the drinks filter before reaching `pickBestForRole`. They inherited the scoring entry point but not the pre-scoring filter stack from /api/generate.

---

## Narrative — what actually happens

**Scenario A: user picks Casual + Harlem, only 1 main-eligible venue qualifies.**

1. Exclude-list trim: no-op (fresh request).
2. Time-window filter: drops anything not open in the 5-hour window.
3. Closed-status filter: drops permanently/temporarily closed.
4. **Budget filter applies `[1]` for casual. If the surviving pool drops below 30, silently widens to `[1, 2]`.** A `console.info` is logged; no client-visible artifact.
5. `pickBestForRole(Main, anchor=null)`: strict hardFilter requires Harlem + role + tier ∈ allowed. Picks the single tier-1 Harlem venue (or, post-widening, a tier-2 Harlem venue with the +15 bonus broken by sheer absence of tier-1 mains).
6. `pickBestForRole(STOP_1_POOL, anchor=Main)`: strict pass requires Harlem + stop_1 role + proximity ≤ 1.5 km of the picked Main. If empty, drops hint (if any) and retries. If still empty, `relaxedFilter` drops the Harlem requirement — any tier-1 (or widened tier-2) opener/closer/drinks/activity/coffee within 1.5 km of Main qualifies.
7. If even relaxedFilter + proximity returns nothing: `composer.ts:141` returns Main alone. Itinerary is 1 stop. No explanation in the UI; `itinerary_fallback_single_stop` fires server-side.

**The user sees a 1-stop "Casual" itinerary in Harlem with a single venue whose price tier may be 2 (rendered as "$35–65" per [StopCard.tsx:194](../src/components/ui/StopCard.tsx#L194)).** Nothing surfaces that explains why there's only one stop, or that the price tier is one step above what they picked.

**Scenario B: user hits Swap on the only candidate in a thin pool.**

1. Read itinerary; apply drinks filter; build `usedIds = excludeVenueIds ∪ all current stops ∪ plan_b's`. No graceful trim.
2. `pickBestForRole`: cascade walks strict → drop hint (no-op, no hint passed) → `relaxedFilter` (drops the already-bypassed neighborhood predicate).
3. **Budget, time-window, closed-status are not checked at any step.** The relaxed pool can include venues that are closed permanently, not open in the user's time block, or two tiers above their budget — as long as they're within 1.5 km of Main and active and role-compatible.
4. If proximity-filtered relaxed pool is non-empty: top-5 weighted pick (with Math.random — non-deterministic), enrich with Resy via `candidatePool=undefined` so a venue with no slots in the user's block is returned as-is with a Resy link.
5. If empty: 404 `"No other good matches — try adjusting your filters"`.

**Scenario C: user clicks "Add another stop".**

Same as scenario B but with `STOP_1_POOL` role and the failure message `"No nearby venues available to extend"`. No client-side excludeVenueIds — every tap retries the same deterministic Math.random-resolved pick from the same pool, so users can't "shuffle" the suggestion.

---

## What's NOT in this audit

- Recommendations on what to fix. The spec was inventory + narrative; the user runs change scope decisions.
- A live-data exercise of the rules (e.g. recompute "how many casual users would have hit silent widening across the past N generations"). That requires production analytics or a counter-factual replay.
- Coverage of /api/share. The share path snapshots the rendered ItineraryResponse and does not run the scoring cascade.
