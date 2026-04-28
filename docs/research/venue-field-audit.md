# Venue Field Utilization Audit

**Date:** 2026-04-27
**Scope:** Every column in composer_venues_v2 against the generation/display pipeline
**Sample:** 1,000 of 1,452 active venues (69% sample via Supabase default limit)

## Summary

- Total columns audited: 55 (excluding created_at, updated_at, id)
- Used in filtering: 9
- Used in scoring: 6
- Used in display: 20
- Used in AI prompt: 5
- Admin/metadata only: 12
- Unused entirely: 4
- Identified opportunities: 11

## Hard filtering currently applied

1. `active = true` — SQL WHERE (route.ts:157)
2. `business_status NOT IN ('CLOSED_PERMANENTLY', 'CLOSED_TEMPORARILY')` — in-memory (route.ts:209-212)
3. Neighborhood match — `answers.neighborhoods.includes(v.neighborhood)` (scoring.ts:107-109)
4. Time block match — `venueOpenForBlock(v, dayColumn, timeBlock)` hybrid per-day/global (route.ts:199-200)
5. Budget tier match — `allowedTiers.includes(v.price_tier)` with widening (route.ts:218-230)
6. Outdoor seating — excluded when `weather.is_bad_weather && v.outdoor_seating === "yes"` (scoring.ts:113)
7. Stop role match — `venueMatchesRole(v, role)` via ROLE_EXPANSION (scoring.ts:106)
8. Drinks = no — drops alcohol vibe venues when `prefs.drinks === "no"` (route.ts:189-192)
9. Exclude IDs — skip recently-seen venues (route.ts:168-178)

## Scoring components currently applied

| Component | Weight | Column(s) read | Location |
|-----------|--------|---------------|----------|
| Vibe match | 10-35 | vibe_tags | scoring.ts:48-58 |
| Occasion | 15 | occasion_tags | scoring.ts:61 |
| Budget | 15 | price_tier | scoring.ts:67 |
| Neighborhood | 10 | neighborhood | scoring.ts:75 |
| Time relevance | 10 | (none — stub) | scoring.ts:81 |
| Quality | 0-10 | quality_score | scoring.ts:85 |
| Curation boost | variable | curation_boost | scoring.ts:88 |
| Category penalty | -20 | category | scoring.ts:186 |
| Tiebreaker 1 | — | google_rating | scoring.ts:195 |
| Tiebreaker 2 | — | google_review_count | scoring.ts:197 |
| Tiebreaker 3 | — | quality_score | scoring.ts:199 |

## Full field table

| Column | Type | Pop% | Filter | Score | Display | Correctness | Opportunity |
|--------|------|------|--------|-------|---------|-------------|-------------|
| venue_id | string | 100 | — | — | Admin only | OK | — |
| name | string | 100 | — | — | StopCard:112, Modal:100, prompt | OK | — |
| neighborhood | string | 100 | scoring.ts:109 | scoring.ts:75 | StopCard:148, Modal:104 | OK | — |
| category | string\|null | 96 | — | scoring.ts:186 (penalty) | StopCard:147, Modal:103 | OK | — |
| price_tier | number\|null | 65 | route.ts:220 | scoring.ts:67 | Via spend_estimate | **35% null → defaults to 2** | Backfill nulls in sheet |
| vibe_tags | string[] | 89 | route.ts:191 (alcohol) | scoring.ts:54 | Modal:152 | OK | — |
| occasion_tags | string[] | 100 | — | scoring.ts:61 | — | OK | — |
| stop_roles | string[] | 91 | scoring.ts:106 | — | — | **9% empty → never selected** | Backfill in sheet |
| time_blocks | string[] | 100 | route.ts:200 | — | — | OK (global fallback) | — |
| mon-sun_blocks | string[] | 85 | route.ts:200 (via hybrid) | — | — | OK | — |
| duration_hours | number\|null | 29 | — | — | route.ts:73 (buffer calc) | **71% null → role average fallback** | Backfill; use in scoring fit |
| outdoor_seating | string\|null | 34 | scoring.ts:113 | — | Modal:277 | **66% null → weather filter misses them** | Treat null as "unknown", don't filter |
| reservation_difficulty | number\|null | 100 | — | — | StopCard:64 (status label) | OK | Score boost for easy-reserve venues |
| reservation_lead_days | number\|null | 4 | — | — | — | **UNUSED, 96% null** | Warn user if generating <lead_days out |
| reservation_url | string\|null | 53 | — | — | StopCard:75, Modal:203 | OK | — |
| maps_url | string\|null | 100 | — | — | Modal:186 | OK | — |
| curation_note | string\|null | 99 | — | — | Modal:137, StopCard (via AI) | OK | — |
| awards | string\|null | 7 | — | — | StopCard:153, Modal:128 | OK | Boost +5 when awards present |
| quality_score | number | 100 | — | scoring.ts:85 | — | OK | — |
| curation_boost | number | 3 (nonzero) | — | scoring.ts:88 | — | OK | — |
| curated_by | string\|null | 100 | — | — | — | OK (admin metadata) | — |
| address | string\|null | 100 | — | — | Modal:179 | OK | — |
| latitude | number | 100 | — | scoring.ts:135 (proximity) | Modal:187 | OK | — |
| longitude | number | 100 | — | scoring.ts:135 (proximity) | Modal:187 | OK | — |
| active | boolean | 100 | scoring.ts:104 | — | — | OK | — |
| notes | string\|null | 29 | — | — | — | OK (internal) | — |
| verified | boolean\|null | 0 | — | — | — | **DEAD COLUMN — 0% populated** | Delete or backfill |
| hours | string\|null | 98 | — | — | Modal:166 | OK | — |
| last_verified | string\|null | 71 | — | — | — | OK (admin metadata) | Penalize stale venues (>6mo) |
| last_updated | string\|null | 71 | — | — | — | OK (admin metadata) | — |
| happy_hour | string\|null | 4 | — | — | Modal:171 | OK | Surface in StopCard for afternoon block |
| dog_friendly | boolean\|null | 14 | — | — | Modal:272 | OK | Filter for family/dog occasions |
| kid_friendly | boolean\|null | 17 | — | — | — | **UNUSED — never read** | Filter for family occasion |
| wheelchair_accessible | boolean\|null | 70 | — | — | Modal:273 | OK | Surface in accessibility filter |
| signature_order | string\|null | 6 | — | — | Modal:144, prompt | OK | — |
| google_place_id | string\|null | 100 | — | — | — | OK (storage key) | — |
| corner_id | string\|null | 71 | — | — | — | OK (admin) | — |
| corner_photo_url | string\|null | 71 | — | — | — | OK (admin) | — |
| guide_count | number\|null | 71 | — | — | — | OK (admin) | Boost venues in 3+ guides |
| source_guides | string[] | 71 | — | — | — | OK (admin) | — |
| all_neighborhoods | string[] | 53 | — | — | — | OK (admin) | — |
| google_rating | number\|null | 99 | — | scoring.ts:195 (tiebreak) | StopCard:135, Modal:109 | OK | Promote to scoring signal |
| google_review_count | number\|null | 99 | — | scoring.ts:197 (tiebreak) | StopCard:138, Modal:113 | OK | Popularity signal in scoring |
| google_types | string[] | 100 | — | — | — | **UNUSED — never read** | Cross-validate category |
| google_phone | string\|null | 80 | — | — | Modal:117 | OK | — |
| enriched | boolean | 100 | — | — | — | OK (admin flag) | — |
| business_status | string\|null | 100 | route.ts:211 | — | — | OK | — |
| image_keys | string[] | 100 | — | — | StopCard:107, Modal:78 | OK | — |
| reservation_platform | string\|null | 27 | — | — | Availability routing | OK | — |
| resy_venue_id | number\|null | 27 | — | — | Availability fetch | OK | — |
| resy_slug | string\|null | 27 | — | — | Booking URL | OK | — |

## Top opportunities (prioritized)

### 1. Backfill price_tier nulls (35% null)
**Why:** 35% of venues have null price_tier, which defaults to tier 2 in scoring (scoring.ts:67: `venue.price_tier ?? 2`). This means the budget hard filter silently drops these venues when budget != "nice_out". A "casual" request loses 35% of the pool to null price_tier, not to actual pricing.
**How:** Backfill via sheet — estimate tier from Google price level, category, or neighborhood median.
**Risk:** Mis-estimating tier is worse than null; better to use "unknown" handling than wrong values.

### 2. Use google_rating as a scoring signal, not just tiebreaker
**Why:** 99.4% populated, high signal-to-noise. Currently only breaks ties (scoring.ts:195). A 4.8-rated venue and a 3.2-rated venue score identically if other factors match.
**How:** Add `ALGORITHM.weights.googleRating` (e.g., 5pts). Score: `(rating - 3.5) / 1.5 * weight` (normalized so 3.5 = 0, 5.0 = max).
**Risk:** Biases toward popular tourist venues. Mitigate by keeping weight low (5pts) and trusting curation_boost for hidden gems.

### 3. Use kid_friendly for family occasions
**Why:** 17% populated, never read. The `family` occasion exists in the questionnaire but has no venue-side filtering.
**How:** When `occasion === "family"`, boost kid_friendly=true venues by +10. Not a hard filter (too few populated).
**Risk:** Low population rate means most venues have null — only a soft boost, not a requirement.

### 4. Use awards as a scoring boost
**Why:** 7.4% populated (74 venues). Awards like "Michelin", "James Beard", "Composer Favorite" are high-value curation signals but contribute zero to scoring.
**How:** Add `ALGORITHM.weights.awards` (e.g., 5pts) when `awards` is non-null.
**Risk:** Overlaps with curation_boost (curators may have already boosted award-winning venues). Check correlation before adding.

### 5. Use guide_count as a popularity signal
**Why:** 71% populated. Venues appearing in 5+ Corner guides are strongly validated by the community. Currently admin-only metadata.
**How:** Score: `Math.min(guide_count, 5) * 1` (cap at 5pts). Only for venues with corner_id (imported from Corner).
**Risk:** Biases toward Corner-sourced venues over founder-curated ones. Keep weight low.

### 6. Fix outdoor_seating null handling
**Why:** 66% of venues have null outdoor_seating. The weather filter at scoring.ts:113 only drops `outdoor_seating === "yes"` in bad weather, so nulls pass through. This is probably correct (null = "we don't know, let them through"), but it means the filter only catches 34% of potentially outdoor venues.
**How:** Backfill outdoor_seating in the sheet using Google Places types. Alternatively, treat null as "no" for filtering purposes.
**Risk:** Backfill errors could hide good indoor venues during rain.

### 7. Warn on last_verified > 6 months
**Why:** 71% populated. Stale venue data (closed, moved, changed hours) degrades user trust. A venue last verified 8 months ago may have different hours or may be closed.
**How:** UI indicator on stop card ("Verify hours before going") when `last_verified` is >180 days old.
**Risk:** Alarming users unnecessarily for stable venues. Consider only showing for venues without google enrichment.

## Surprises / smells

1. **`verified` is 0% populated** — dead column. Every single venue has null. Either it was never used, or the import pipeline doesn't populate it. Should be deleted from schema or backfilled.

2. **`price_tier` is 35% null** — the budget hard filter (`route.ts:220`) drops null-tier venues unless they fall in the widening range. These venues are silently excluded, not scored at default. The `?? 2` fallback only applies in scoring.ts:67, not in the hard filter.

3. **`reservation_lead_days` is 96% null and never read** — designed for "you need to book 2 weeks ahead" warnings but never implemented. Only 44 venues have data.

4. **`google_types` is 100% populated but never read** — rich Google Places categorization data sitting unused. Could cross-validate `category` or power a "what type of place" filter.

5. **`duration_hours` is 71% null** — the end-time buffer (route.ts:73) falls back to role average (60/120/60 min). This means most itineraries use the same duration for every venue, regardless of whether it's a quick cocktail bar (45min) or a tasting menu (3hr).

6. **`outdoor_seating` population is low (34%)** — the weather filter only protects against 34% of potentially outdoor venues. The other 66% pass through even in rain because null != "yes".

7. **`stop_roles` is 9% empty** — 130+ venues with no role assignment can never be selected for any stop. They pass through all other filters but fail `venueMatchesRole` every time. Effectively invisible.

8. **`time relevance` scoring is dead code** — scoring.ts:81 returns 10 for every venue regardless. The `duration_hours` and per-day block data exist but aren't used to prefer venues whose operating hours best fit the time window.

## Cross-cutting questions for design discussion

1. **Should google_rating be a scoring signal or stay as tiebreaker?** At 99.4% populated it's the most universal quality metric, but it biases toward well-reviewed mainstream venues over IYKYK spots.

2. **Should price_tier null be treated as "exclude from budget filter" or "default to tier 2"?** Current behavior is inconsistent: hard filter excludes nulls, scoring defaults them to 2.

3. **Should reservation_difficulty influence scoring?** Easy-to-book venues (difficulty=1) create smoother user experiences. Should the algorithm prefer them, especially for same-day/next-day itineraries?

4. **Should duration_hours be backfilled and used in composition?** Currently 71% null with a static role-average fallback. Actual durations would improve end-time buffer accuracy and enable tighter time windows.

5. **Should the family occasion trigger kid_friendly filtering?** 17% populated — hard filter would be too aggressive, but a soft boost would reward venues that have the data.

6. **Should guide_count (Corner community signal) contribute to scoring alongside quality_score (founder signal)?** They measure different things — community validation vs. curation judgment.

7. **Should awards overlap with curation_boost, or should they be independent signals?** If a venue has awards AND curation_boost, it may be double-dipping on the same "this place is special" signal.

8. **Should last_verified age affect scoring or just display?** A venue verified last week is more trustworthy than one verified 8 months ago. But penalizing stale data punishes venues the founders haven't revisited, not necessarily bad venues.

9. **Should google_types be used to auto-assign stop_roles for the 9% of venues with empty roles?** The Google types data is 100% populated and includes signals like "bar", "restaurant", "cafe" that map cleanly to opener/main/closer roles.
