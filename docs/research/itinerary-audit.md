# Itinerary Generation Pipeline Audit

**Date:** 2026-04-27
**Scope:** Full pipeline from POST /api/generate to ItineraryResponse
**Last updated:** 2026-04-28 — see fixes below

> **Post-audit fixes applied (2026-04-27/28):**
> - Time relevance scoring implemented via `blockCoverageFraction()` (0/0.5/1 signal)
> - Category diversity penalty added (-20pts for duplicate categories)
> - Budget is now a hard filter with ±1 tier widening
> - Google rating promoted to 5-point scoring signal
> - Jitter is now seeded (deterministic) via FNV-1a hash of request inputs
> - All magic numbers centralized in `src/config/algorithm.ts`
> - Null price_tier consistently treated as tier 2 in both filter and scoring
>
> Items marked ~~strikethrough~~ below were resolved. See `ALGORITHM.md` for current architecture.

## Executive Summary

- ~~**Time relevance scoring is a stub**~~ — **FIXED:** now uses `blockCoverageFraction()` for 0/5/10 scoring
- **Party size is hardcoded to 2** for Resy availability queries. Groups of 4+ get shown 2-person slots.
- ~~**No composition diversity guard**~~ — **FIXED:** -20pt category duplicate penalty via `ALGORITHM.penalties.categoryDuplicate`
- **All ~1,400 active venues are loaded into memory** on every request. No SQL-level time-block filtering.
- **Availability swap logic is wired but disabled** — `candidatePool` is always `undefined`.

---

## Stage 1: Input Handling

### Files
- `src/app/api/generate/route.ts` (333 lines)

### Inputs
POST body: `GenerateRequestBody` = `QuestionnaireAnswers` minus `startTime`/`endTime` (resolved server-side from `timeBlock`), plus optional `excludeVenueIds: string[]`.

### Transforms
1. **Time resolution** (line 159): `resolveTimeWindow(body.timeBlock)` → `{ startTime, endTime }` in 24h format
2. **Profile merge** (lines 122-144): Reads `name` and `drinks` from `composer_users` via auth session. Returns null gracefully if unauthenticated — does not 401.
3. **Parallel fetch** (lines 162-166): Profile, weather, and full venue table fetched concurrently.

### Outputs
`QuestionnaireAnswers` with resolved times + `AuthedPrefs | null` + `WeatherInfo | null` + `Venue[]`

### Assumptions
- `timeBlock` is always a valid `TimeBlock` value — no server-side validation. Invalid value throws in `getBlockMetadata()` (time-blocks.ts:58).
- Profile fields beyond `name` and `drinks` (dietary, favorite_hoods) are **not read** by the generate route.
- `excludeVenueIds` is lightly sanitized (line 150-152: filters non-strings) but not bounded — a client could send thousands.

### Smells
- **No input validation on timeBlock** (route.ts:159). Client sends invalid string → uncaught throw.
- **Dietary preferences are ignored** — profile.dietary exists but route.ts never reads it. The audit says Option B (disclaimer only, no filtering) was chosen, but this isn't documented in code.
- **`excludeVenueIds` has no size cap** — a malicious client could force O(n) filtering on a large array.

---

## Stage 2: Candidate Filtering

### Files
- `src/app/api/generate/route.ts` (lines 165-223)
- `src/lib/itinerary/time-blocks.ts` (lines 118-172)

### Filter chain (in order)

| # | Filter | Location | Logic | Approx reduction |
|---|--------|----------|-------|------------------|
| 1 | Active | SQL WHERE | `active = true` | ~5% (inactive venues) |
| 2 | Exclude IDs | route.ts:175-188 | Skip if in `excludeVenueIds` (unless pool < 4) | Variable |
| 3 | Drinks = no | route.ts:199-203 | Drop alcohol venues if `prefs.drinks === "no"` | ~20% when active |
| 4 | Time block | route.ts:207-216 | `venueOpenForBlock()` — hybrid per-day/global rule | ~30-50% |
| 5 | Closed status | route.ts:219-223 | Drop CLOSED_PERMANENTLY / CLOSED_TEMPORARILY | <1% |
| 6 | Budget tier | route.ts:217-233 | Hard filter: only venues in allowed tiers; widens by ±1 if pool < 30. Null price_tier treated as tier 2. | ~10-20% |

### Missing filters
- **No dietary filter** — venues with `category: "steakhouse"` still shown to vegetarians.
- ~~**No price_tier filter at candidate stage**~~ — **FIXED:** budget is now a hard filter with widening.

### Smells
- **Fetches ALL active venues from DB** (route.ts:165) — `SELECT * FROM composer_venues_v2 WHERE active = true`. No SQL-level time-block or neighborhood filtering. ~1,400 rows loaded into memory per request.
- **`MIN_POOL_SIZE = 4`** (route.ts:175) — silently ignores exclude list if it would drop pool below 4. Logged but user doesn't know their exclusions were overridden.
- **`drinks === "sometimes"` treated same as `"yes"`** (route.ts:199) — both allow alcohol venues. Intentional per code comment but worth revisiting.

---

## Stage 3: Scoring

### Files
- `src/lib/scoring.ts` (196 lines)

### Hard filters in `hardFilter()` (scoring.ts:93-113)

Before scoring, `pickBestForRole` applies:
1. Not active → drop
2. Already used (in `usedIds`) → drop
3. Doesn't match canonical role (via `ROLE_EXPANSION`) → drop
4. Outside selected neighborhoods (if any selected) → drop
5. Outdoor-only + bad weather → drop

Then proximity filter (scoring.ts:164-169): must be within `MAX_WALK_KM` of Main anchor.
- Normal: 1.5km (~20 min walk) (scoring.ts:15)
- Bad weather: 0.4km (~5 min walk) (scoring.ts:16)

### Scoring components

| Component | Max pts | Weight | Location | How computed |
|-----------|---------|--------|----------|-------------|
| Vibe match | 35 | ~35% | scoring.ts:41-54 | Set intersection of venue.vibe_tags with VIBE_VENUE_TAGS[user_vibe]. 2+ hits=35, 1 hit=25, 0 hits=10. "mix_it_up"=25 baseline. |
| Occasion | 15 | ~15% | scoring.ts:57-60 | venue.occasion_tags.includes(answers.occasion) |
| Budget | 15 | ~15% | scoring.ts:63-67 | venue.price_tier in BUDGET_TIER_MAP[answers.budget] |
| Location | 10 | ~10% | scoring.ts:70-75 | venue.neighborhood in answers.neighborhoods (or empty = all match) |
| Time | 0-10 | ~10% | scoring.ts:94-100 | `blockCoverageFraction(venue, dayColumn, timeBlock) * 10` — 1.0/0.5/0.0 based on per-day + global block coverage |
| Quality | 0-10 | ~10% | scoring.ts:85 | `(venue.quality_score / 10) * 10` |
| Curation boost | variable | ~5% | scoring.ts:88 | `venue.curation_boost * 5` (unbounded) |
| Google rating | 0-5 | ~5% | scoring.ts:108-112 | `max(0, (rating - 3.5) / 1.5) * 5`. Below 3.5→0. Null→0. |
| Category penalty | -20 | — | scoring.ts:233-235 | Deducted when venue.category matches an already-used category in the itinerary |
| Jitter | 0-10 | — | scoring.ts:115 | Seeded PRNG via `seed.ts` — `random() * jitter`. Same inputs → same seed → deterministic. |

**Effective max:** ~110 (35+15+15+10+10+10+5+5+10=115 theoretical, minus category penalty)

### Tiebreaking (scoring.ts:183-192)
1. Score (descending)
2. google_rating (descending)
3. google_review_count (descending)
4. quality_score (descending)

### Progressive relaxation (scoring.ts:172-177)
If hard filter + proximity = 0 candidates:
1. Drop neighborhood requirement (keep role + weather)
2. Re-apply proximity filter
3. If still 0 → return null (slot unfilled)

Proximity is **never** relaxed.

### Smells
- ~~**Time relevance is dead code**~~ — **FIXED:** now implemented via `blockCoverageFraction()`.
- **Curation boost is unbounded** (scoring.ts:88): `curation_boost * 5`. A venue with `curation_boost = 10` gets +50 points, dominating all other signals. No venues currently have boost that high, but no cap enforces it.
- ~~**No category diversity in scoring**~~ — **FIXED:** -20pt penalty for duplicate categories.
- **"mix_it_up" vibe gets 25 baseline** (scoring.ts:48) while other vibes get 10 for zero matches. This means "mix_it_up" effectively boosts everything uniformly rather than being neutral.

---

## Stage 4: Composition

### Files
- `src/lib/composer.ts` (159 lines)

### Stop count planning (composer.ts:44-80)

Templates tried largest → smallest:
```
4 stops: ["opener", "main", "closer", "closer"]  — needs ≥315 min (5h15m)
3 stops: ["opener", "main", "closer"]              — needs ≥245 min (4h05m)
2 stops: ["opener", "main"]                        — needs ≥180 min (3h00m, minimum)
```

Duration budget per role: opener=60min, main=120min, closer=60min.
Walk buffer: 10 min between each pair. Slack: 15 min.

### Selection order (composer.ts:98-137)
1. Pick **Main** first (no anchor, scored freely)
2. Fill remaining slots left→right, each anchored to Main for proximity
3. Each pick adds venue to `usedIds` to prevent repeats
4. Plan B = second-ranked venue from same scoring run (composer.ts:135)
5. If no candidate found for a slot → **silently skipped** (composer.ts:133)

### End-time buffer (route.ts:52-90)
After composition, `applyEndTimeBuffer()` checks if last stop's estimated start + duration exceeds `endTime - 30min`. If so, trailing stops are dropped. No re-composition.

### Diversity rules
- **Category duplicate penalty** (-20pts): `usedCategories` set tracks categories across picks. Subsequent picks matching an already-used category get penalized. Soft — a duplicate can still win if it scores 20+ better than alternatives.
- **Venue repeat prevention**: `usedIds` prevents the same venue from appearing twice.
- No vibe diversity or price tier diversity rules.

### Smells
- **Silent slot skipping** (composer.ts:133): `if (!best) continue;` — user requested 3 stops, might get 2 or 1 with no explanation.
- **All non-Main stops anchored only to Main** (composer.ts:125) — not to each other. If Main is in SoHo and opener in West Village, closer must be near Main (SoHo), not near opener (West Village). This can produce non-linear walking paths.
- **Plan B is just scored[1]** (composer.ts:135) — no guarantee it's a different category or vibe from the primary pick. Plan B could be the same type of venue.

---

## Stage 5: Output Assembly

### Files
- `src/app/api/generate/route.ts` (lines 224-333)
- `src/lib/claude.ts` (83 lines)
- `src/config/prompts.ts` (131 lines)
- `src/lib/itinerary/availability-enrichment.ts` (263 lines)

### Response shape (`ItineraryResponse`)
```typescript
{
  header: { title, subtitle, occasion_tag, vibe_tag, estimated_total, weather },
  stops: ItineraryStop[],
  walks: WalkSegment[],
  walking: WalkingMeta,
  truncated_for_end_time: boolean,
  maps_url: string,
  inputs: QuestionnaireAnswers,
}
```

### Gemini copy generation (claude.ts)
- Model: `gemini-2.5-flash` (prompts.ts:3)
- Max tokens: 1000 (prompts.ts:4)
- Thinking disabled (`thinkingBudget: 0`, claude.ts:51) — copy shaping, not reasoning
- Output: JSON with `title`, `subtitle`, `venue_notes` per venue
- **Fallback** (claude.ts:69-81): generic title + DB `curation_note` per stop
- Defensive JSON extraction via regex (claude.ts:63) handles prose wrapping

### Availability enrichment (availability-enrichment.ts)
- **Per-stop Resy fetch** with 5s timeout (line 18)
- Walk-in venues → `status: "walk_in"`, no fetch
- Missing resy data → `status: "unconfirmed"`
- Slots filtered to user's time block via `isSlotInBlock()`
- **Swap logic exists but is disabled** — `candidatePool = undefined` (route.ts:322)

### Smells
- **Party size hardcoded to 2** (route.ts:320): Resy queries always request 2-person availability regardless of actual group size.
- **Swap logic dead code** — `attemptSwap()` (availability-enrichment.ts:83-153) is fully implemented but never called because candidatePool is never passed.
- **N sequential Resy API calls** — one per stop, not parallelized. 3 stops × 5s timeout = 15s worst case.

---

## Cross-Cutting Quality Concerns

### Composition diversity
~~No diversity guard exists.~~ **FIXED:** A -20pt category duplicate penalty discourages same-category picks. Three identical categories are still theoretically possible if one category dominates the pool by 20+ points, but in practice the penalty produces mixed itineraries in dense neighborhoods.

### Vibe accuracy
Vibe scoring is well-implemented via exact tag matching with the VIBE_VENUE_TAGS map. The 35/25/10 tiered scoring is sound. One concern: the 10-point baseline for zero matches means a high-quality non-matching venue (quality=10, curation=2) can outscore a mediocre matching venue (quality=3, curation=0). This is arguably correct — quality matters — but could surprise users expecting strict vibe adherence.

### Budget honesty
~~Budget is a 15-point scoring signal, not a hard filter.~~ **FIXED:** Budget is now a hard filter at the candidate stage (route.ts:217-233). Venues outside allowed tiers are dropped. If the pool drops below 30, tiers widen by ±1. Budget also remains a 15-point scoring tiebreaker among surviving venues.

### Neighborhood respect
Neighborhoods are a hard filter in `hardFilter()` (scoring.ts:105-107). Venues outside selected neighborhoods are dropped. Progressive relaxation drops this filter when candidates are too few — logged as a warning but user isn't told. This is the correct tradeoff: better to show a nearby-but-outside venue than return nothing.

### Time block honesty
The `venueOpenForBlock()` hybrid rule (per-day blocks when populated, global fallback when empty) is solid. The filter applies before scoring, so closed venues are never scored. ~~One gap: the time relevance scoring component is a stub.~~ **FIXED:** `blockCoverageFraction()` now scores 1.0 (both sources confirm), 0.5 (one source), or 0.0 (no data), multiplied by 10pts.

### Walking reasonableness
The 1.5km hard cap (scoring.ts:15) with 1.3x Manhattan grid factor (geo.ts:1) produces ~20 min max walks. All non-Main stops are anchored to Main. Walking is honest but can feel non-linear — opener in West Village, main in SoHo, closer in SoHo — because closer is anchored to Main, not to opener.

### Reservation visibility
Resy availability is fetched post-composition and **does not influence venue selection**. A venue with zero available slots gets the same score as one with 20 slots. The availability data is presentation-only, shown after the itinerary is assembled.

### Repetition handling
Jitter (0-10 points, **seeded from request hash** via `seed.ts`) provides deterministic results for identical inputs and variety when `excludeVenueIds` changes. Same inputs → same seed → same picks. Different exclusions → different seed → different jitter → different picks. This makes "regenerate" (which adds current venues to exclusions) produce variety while keeping direct links shareable.

---

## Top Smells (prioritized)

> Items 1, 2, 6 resolved post-audit. Renumbered.

1. **Party size hardcoded to 2** — route.ts:320, Resy queries ignore actual group size
2. **Full venue table loaded into memory** — route.ts:165, no SQL-level pre-filtering
3. **Swap logic is wired but disabled** — availability-enrichment.ts:83-153 never called
4. **Silent slot skipping** — composer.ts:133, user might get fewer stops with no explanation
5. **Curation boost unbounded** — scoring.ts:88, could dominate all other signals
6. **Sequential Resy API calls** — one per stop, not parallelized
7. **No server-side timeBlock validation** — route.ts:159, invalid value throws

---

## Magic Numbers Inventory

> **All scoring/composition magic numbers are now centralized in `src/config/algorithm.ts`.**
> See that file's JSDoc for sane ranges and calibration notes.

| Value | Location | Purpose |
|-------|----------|---------|
| 35 | algorithm.ts | vibeMatch2Plus |
| 25 | algorithm.ts | vibeMatch1 / vibeMixItUpBaseline |
| 10 | algorithm.ts | vibeMatch0 / neighborhood / timeRelevance / qualityNormalize |
| 15 | algorithm.ts | occasion / budget |
| 5 | algorithm.ts | curationMultiplier / googleRating |
| 20 | algorithm.ts | categoryDuplicate penalty |
| 1.5 | algorithm.ts | maxWalkKmNormal |
| 0.4 | algorithm.ts | maxWalkKmBadWeather |
| 10 | algorithm.ts | jitter magnitude |
| 30 | algorithm.ts | minBudgetWideningThreshold / lastStartBufferMin |
| 4 | algorithm.ts | minPoolSize |
| 4 | route.ts:175 | MIN_POOL_SIZE | No |
| 30 | route.ts:32 | LAST_START_BUFFER_MIN | Yes |
| 15 | route.ts:38 | WALK_SOFT_CAP_MIN | Yes |
| 5 | route.ts:39 | WALK_SOFT_CAP_MIN_BAD_WEATHER | Yes |
| 60 | composer.ts:19 | Opener duration (min) | Yes (ROLE_AVG_DURATION_MIN) |
| 120 | composer.ts:20 | Main duration (min) | Yes |
| 60 | composer.ts:21 | Closer duration (min) | Yes |
| 10 | composer.ts:27 | AVG_WALK_BETWEEN_STOPS_MIN | Yes |
| 15 | composer.ts:33 | BUDGET_SLACK_MIN | Yes |
| 1.3 | geo.ts:1 | MANHATTAN_GRID_FACTOR | Yes |
| 4.8 | geo.ts:2 | WALK_SPEED_KMH | Yes |
| 5000 | availability-enrichment.ts:18 | RESY_TIMEOUT_MS | Yes |
| 3 | availability-enrichment.ts:19 | MAX_SWAP_CANDIDATES | Yes |
| 1.6 | availability-enrichment.ts:20 | SWAP_RADIUS_KM | Yes |
| 2 | route.ts:320 | Default party size | No |
| 1000 | prompts.ts:4 | GEMINI_MAX_TOKENS | Yes |

---

## Questions / Decisions

1. **Should budget be a hard filter or stay as a scoring signal?** Current: soft (15pts). A casual user can get $$$ venues. Hard filter would shrink candidate pool significantly in some neighborhoods.

2. **Should category diversity be enforced in composition?** Current: no rule. Fix options: score penalty for duplicate categories, or hard constraint "no two stops same category."

3. **Should Resy availability influence venue selection?** Current: availability is presentation-only, fetched after composition. Moving it pre-composition would add latency but could avoid showing venues with zero slots.

4. **Should party size flow from the client to Resy queries?** Current: hardcoded to 2. The questionnaire doesn't ask party size. Adding it means a new question or profile field.

5. **Should time relevance scoring be implemented or removed?** Current: stub returning 10. Options: implement it (prefer venues open all evening vs. barely open), or remove the dead weight and redistribute the 10 points.

6. **Should walking proximity be to Main only, or to the previous stop?** Current: all non-Main stops anchored to Main. Alternative: chain anchoring (closer near opener, not just near Main) would produce more linear walking routes.

7. **Should the swap logic be enabled?** It's fully implemented (availability-enrichment.ts:83-153) but candidatePool is never passed. Enabling it means passing the filtered venue pool through the response — adds memory but could auto-swap venues with no availability.

8. **Should progressive relaxation tell the user it activated?** Current: server logs a warning, user sees venues from unexpected neighborhoods with no explanation.

9. **How should "no slots in block" be handled during composition?** Current: shown post-hoc. Alternative: if venue has Resy data and zero evening slots, score it down or skip it during composition.

10. **Should full venue table SELECT be pushed to SQL?** Current: loads ~1,400 rows per request. Supabase supports array-contains queries (`time_blocks @> ARRAY['evening']`) that could cut the in-memory pool significantly.
