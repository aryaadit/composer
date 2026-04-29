# Composer Itinerary Generation

Composer takes a short questionnaire (occasion, neighborhoods, budget, vibe, when) and produces a curated 2-4 stop evening itinerary for NYC. The generation pipeline scores ~1,400 active venues against the user's inputs, picks the best combination, and enriches it with walking routes, Resy availability, and AI-written copy.

The algorithm is designed to feel opinionated — "this is the move" — not exhaustive. It prefers strong matches over safe averages, and uses a category-diversity penalty to avoid three-of-the-same. Every tunable constant lives in `src/config/algorithm.ts`.

## Pipeline at a glance

```
POST /api/generate
  │
  1. INPUT        Parse request + merge user profile
  │               src/app/api/generate/route.ts
  │
  2. FILTER       Drop venues that fail hard requirements
  │               src/app/api/generate/route.ts
  │
  3. SCORE        Rank candidates per-role (7 weighted signals)
  │               src/lib/scoring.ts
  │
  4. COMPOSE      Pick N stops, enforce diversity + proximity
  │               src/lib/composer.ts
  │
  5. ENRICH       Resy slots, weather, walks, AI copy
  │               src/lib/claude.ts, availability-enrichment.ts
  │
  └─→ ItineraryResponse
```

## The five filters (Stage 2)

Filters run in sequence. Each narrows the pool. If a filter would leave fewer than `ALGORITHM.pools.minPoolSize` venues, it's skipped with a logged warning.

### Active and business status

Fetches all rows with `active = true` from `composer_venues_v2`. Then drops `CLOSED_PERMANENTLY` and `CLOSED_TEMPORARILY` in memory. This catches venues that Google flagged but the sheet hasn't updated yet.

### Neighborhood match

Hard filter: if the user selected neighborhoods, only venues in those neighborhoods pass. Neighborhoods arrive as expanded storage slugs (the questionnaire expands group IDs like "east_village_les" into individual slugs like "east_village", "lower_east_side", "bowery"). Relaxation happens later in scoring — if the hard filter + proximity filter leaves zero candidates for a role, `pickBestForRole` drops the neighborhood requirement.

### Time block coverage

Uses the hybrid per-day/global rule (`venueOpenForBlock` in `time-blocks.ts`): if any per-day column is populated across all 7 days, trust the per-day data for the requested day. If all per-day columns are empty, fall back to the global `time_blocks` array. A venue with no data for the requested day is treated as closed.

### Budget tier

Hard filter with widening. Maps the user's budget slug to allowed tiers (casual → [1], splurge → [3], etc.) and drops venues outside those tiers. If the filtered pool drops below `ALGORITHM.pools.minBudgetWideningThreshold`, widens by ±1 tier (e.g., splurge [3] → [2,3,4]). Venues with null price_tier are treated as tier 2.

### Drinks preference

If the authenticated user's profile has `drinks = "no"`, drops all venues whose vibe_tags include any tag from the "drinks_led" vibe set (cocktail_forward, wine_bar, speakeasy, drinks).

## The scoring components (Stage 3)

Each venue that passes filtering gets scored by `scoreVenue` in `scoring.ts`. The score is a sum of weighted components. All weights live in `ALGORITHM.weights`.

### Vibe match (up to 35 pts)

The dominant signal. The user picks a vibe (food_forward, drinks_led, activity_food, walk_explore, mix_it_up). Each vibe maps to a set of venue tags. The score counts how many of the venue's `vibe_tags` overlap:

- 2+ overlaps → full weight (35)
- 1 overlap → partial (25)
- 0 overlaps → baseline (10)
- "mix it up" (empty tag set) → flat 25 for all venues

### Occasion match (15 pts)

Binary: if the venue's `occasion_tags` includes the user's occasion (dating, friends, solo, etc.), full points. Otherwise 0. Simple signal — occasions are broad.

### Budget match (15 pts)

Binary: if the venue's `price_tier` falls within the user's allowed tiers, full points. Low weight because budget is already a hard filter upstream — this tiebreaks between exact-match and widened-match venues.

### Neighborhood match (10 pts)

Binary: if the venue is in one of the user's selected neighborhoods (or they selected none), full points. Stacks on top of the hard filter — venues that survive relaxation (dropped neighborhood requirement) score 0 here while in-neighborhood venues get 10.

### Quality score (up to 10 pts)

Normalized from the venue's `quality_score` (curator-assigned 0-10). Formula: `(quality_score / 10) * weight`. A venue with quality 7 gets 7 pts; quality 10 gets 10.

### Curation boost (variable)

Per-venue multiplier set by curators to promote specific picks. Formula: `curation_boost * weight`. Most venues have boost 0; a few have 1-3. At weight 5, a boost of 2 gives +10 pts.

### Time relevance (up to 10 pts)

Measures how well the venue's schedule data covers the user's time block, using `blockCoverageFraction()`. A venue confirmed open in both global and per-day block data gets full points. One source only gets half. No data gets 0.

### Google rating (up to 5 pts)

Normalized from Google Places rating. Formula: `max(0, (rating - 3.5) / 1.5) * weight`. A 5.0-star venue gets full weight; 3.5 or below gets 0. Null ratings get 0. Kept low to avoid biasing toward mainstream tourist venues.

### Tiebreaking

When two venues have identical total scores (within 0.01), the sort falls through to: google_rating → google_review_count → quality_score.

## Composition rules (Stage 4)

### Vibe-driven templates

Each vibe maps to its own sequence of stop patterns in `src/config/templates.ts`. A "drinks-led" itinerary has a different stop structure than a "food-forward" one:

- **food_forward**: opener → main → closer (standard)
- **drinks_led**: opener (hint: drinks) → main → closer (hint: drinks) — bookends with bars
- **activity_food**: opener (hint: activity) → main → closer — starts with something to do
- **walk_explore**: opener (hint: coffee) → main (hint: activity) → closer — morning coffee → gallery → dinner
- **mix_it_up**: randomly picks one of the four concrete vibes at runtime

Each slot has a canonical `role` (opener, main, closer) and an optional `venueRoleHint` that biases candidate selection. When the hinted pool is empty, `pickBestForRole` falls back gracefully via cascade relaxation: strict (with hint) → drop hint → drop neighborhood.

`planStopMix` picks the largest template whose time budget fits the user's window. Main is picked first as the geographic anchor. All other stops must be within `ALGORITHM.distance.maxWalkKmNormal` (1.5km) of Main.

### Weighted top-N pick

Instead of always picking the #1 scored venue, `pickBestForRole` samples from the top N candidates using rank-based weights (configurable via `ALGORITHM.pools.pickTopN` and `pickWeights`). Default: top 5, weighted `[5,4,3,2,1]` — #1 is 5x more likely than #5 but not guaranteed. This adds variety across regenerations while preserving quality. Falls back to deterministic top-1 when `jitter === 0`.

### Category diversity penalty

As each stop is picked, its category is added to `usedCategories`. Subsequent picks that match an already-used category get `ALGORITHM.penalties.categoryDuplicate` (20 pts) deducted. Soft penalty — a duplicate category can still win if it scores 20+ pts better than alternatives.

### Deterministic seeding

Jitter uses a seeded PRNG (`src/lib/itinerary/seed.ts`). The seed is an FNV-1a hash of the request inputs (occasion, vibe, budget, timeBlock, day, sorted neighborhoods, sorted excludeVenueIds). Same inputs → same seed → same jitter → same picks. Different `excludeVenueIds` produce different seeds, so "regenerate" (which excludes current venues) gives variety.

### Silent skip for unfillable roles

If `pickBestForRole` returns null for a role (no candidates survive all filters + proximity), that role is silently skipped — `composer.ts` uses `if (!best) continue`. A 3-stop plan can become 2 stops without explanation. The `truncated_for_end_time` flag on the response only covers end-time truncation, not this case.

## When something feels wrong

| Symptom | Likely cause | Where to look |
|---|---|---|
| Three same-category stops | `categoryDuplicate` penalty too low | `ALGORITHM.penalties.categoryDuplicate` |
| $$$ venue in casual itinerary | Budget widening triggered | Server logs for "budget pool thin" |
| Same input → different output | Seeded PRNG not plumbed | `seed.ts`, `scoring.ts` random param |
| Venue closed during my block | Time block hybrid rule edge case | `venueOpenForBlock` in `time-blocks.ts` |
| Itinerary has 2 stops not 3 | Silent role-skip | `composer.ts` no-candidate `continue` |
| Mediocre venue over great one | Jitter swung the ranking | Lower `ALGORITHM.jitter.magnitude` |
| Same 3 venues every time | Jitter too low or pool too thin | Raise jitter or broaden filters |
| Walk too long between stops | Proximity cap in scoring | `ALGORITHM.distance.maxWalkKmNormal` |
| Drinks itinerary has no bars | venueRoleHint pool empty, fell back | Check venue stop_roles data, `templates.ts` hints |
| Too much variety across regenerates | pickTopN too high or weights too flat | `ALGORITHM.pools.pickTopN`, `pickWeights` |

## Tunable levers

All live in `src/config/algorithm.ts`. See inline JSDoc there for sane ranges and calibration notes.

| Lever | Current | Effect |
|---|---|---|
| vibeMatch2Plus | 35 | How much a strong vibe match dominates |
| occasion | 15 | Occasion tag relevance |
| budget | 15 | Budget tier tiebreaker weight |
| neighborhood | 10 | In-neighborhood vs. relaxed preference |
| timeRelevance | 10 | Schedule coverage importance |
| qualityNormalize | 10 | Curator quality score weight |
| curationMultiplier | 5 | Per-venue boost amplifier |
| googleRating | 5 | Google Places crowd signal |
| categoryDuplicate | 20 | Diversity enforcement strength |
| jitter.magnitude | 10 | Randomness range |
| maxWalkKmNormal | 1.5 | Proximity hard cap (km) |
| minBudgetWideningThreshold | 30 | When budget filter loosens |
| pickTopN | 5 | How many top candidates to sample from |
| pickWeights | [5,4,3,2,1] | Rank-based sampling probabilities |

## Known limitations

- **Time relevance is coarse** — 0/0.5/1 signal, not a smooth gradient based on hours of overlap.
- **Walking distance is a filter, not a scoring signal** — a venue 200m away scores the same as one 1.4km away.
- **Resy availability is presentation-only** — doesn't affect venue selection. A venue with zero slots scores identically to one with 20.
- **~488 venues have null price_tier** — treated as tier 2. Google had no priceLevel data for them (galleries, parks, etc.).
- **Party size hardcoded to 2** for Resy availability queries.
- **Swap logic is wired but disabled** — `candidatePool` is never passed to `enrichWithAvailability`.
- **No per-stop proximity** — all non-Main stops anchor to Main, not to each other. Walking routes can feel non-linear.

See `docs/itinerary-audit.md` for the full audit.

## How to retune safely

1. Change **one lever** at a time in `algorithm.ts`.
2. Restart the dev server.
3. Generate 3-5 itineraries with diverse inputs (different vibes, neighborhoods, budgets).
4. Compare picks against a control (save the "before" venue IDs).
5. If picks shift as expected, ship. If surprising, investigate before stacking another change.
