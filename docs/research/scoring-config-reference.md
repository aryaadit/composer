# Scoring & Config Reference

Generated 2026-04-17. Use this to align the Google Sheet dropdowns with what the app's scoring engine expects.

---

## 1. VIBE_VENUE_TAGS — Scored Tags (35% of venue score)

When a user picks a vibe in the questionnaire, the scorer checks each venue's `vibe_tags` array for exact matches against the corresponding tag group. More matches = higher score.

| User picks this vibe | Scorer looks for these tags in `vibe_tags` |
|---|---|
| **food_forward** | `food_forward`, `tasting`, `dinner`, `bistro` |
| **drinks_led** | `cocktail_forward`, `wine_bar`, `speakeasy`, `drinks` |
| **activity_food** | `activity`, `comedy`, `karaoke`, `games`, `bowling` |
| **walk_explore** | `walk`, `gallery`, `bookstore`, `market`, `park` |
| **mix_it_up** | *(empty — no vibe filter, all venues score 25 base)* |

**18 scored tags total.**

Scoring tiers:
- 2+ tag matches → 35 pts
- 1 tag match → 25 pts
- 0 tag matches → 10 pts base

### Cross-Cutting Tags (valid but NOT scored)

These can appear in a venue's `vibe_tags` alongside scored tags. They don't affect the vibe match score but are recognized as canonical. Future features (filters, display badges, semantic matching) may consume them.

```
romantic
conversation_friendly
group_friendly
late_night
casual
upscale
outdoor
classic
iykyk
lunch
cash_only
reliable
```

**12 cross-cutting tags. 30 total canonical tags (18 scored + 12 cross-cutting).**

Any tag in the sheet's `vibe_tags` column that isn't in this set of 30 will still import (the script is a passthrough), but the scoring engine won't match on it — it's effectively inert unless you add it to one of these lists in `src/config/vibes.ts`.

---

## 2. NEIGHBORHOOD_GROUPS — Questionnaire Picker Mapping

The questionnaire shows ~14 neighborhood groups. Each group expands to 1+ storage slugs for scoring. The sheet's `neighborhood` column should use **storage slugs** (right column below), not group IDs.

| Group ID | Label | Borough | Storage Slugs |
|---|---|---|---|
| `west_village` | West Village | Manhattan | `west_village` |
| `greenwich_village` | Greenwich Village | Manhattan | `greenwich_village` |
| `east_village_les` | East Village / LES | Manhattan | `east_village`, `lower_east_side`, `east_village_les`, `bowery` |
| `soho_nolita_tribeca` | SoHo / Nolita / Tribeca | Manhattan | `soho_nolita`, `nolita`, `noho`, `tribeca`, `little_italy`, `hudson_square` |
| `chelsea_flatiron` | Chelsea / Flatiron | Manhattan | `chelsea`, `flatiron`, `nomad`, `gramercy_kips_bay`, `kips_bay`, `murray_hill` |
| `midtown_hk` | Midtown / Hell's Kitchen | Manhattan | `midtown`, `midtown_west`, `midtown_east`, `midtown_hells_kitchen`, `koreatown` |
| `chinatown_fidi` | Chinatown / FiDi | Manhattan | `chinatown`, `fidi`, `battery_park_city` |
| `upper_west_side` | Upper West Side | Manhattan | `upper_west_side` |
| `upper_east_side` | Upper East Side | Manhattan | `upper_east_side` |
| `harlem_uptown` | Harlem / Washington Heights | Manhattan | `harlem`, `west_harlem`, `washington_heights` |
| `williamsburg_greenpoint` | Williamsburg / Greenpoint | Brooklyn | `williamsburg`, `greenpoint`, `east_williamsburg` |
| `brooklyn` | DUMBO / Brooklyn | Brooklyn | `dumbo`, `brooklyn_heights`, `fort_greene`, `clinton_hill`, `cobble_hill`, `carroll_gardens`, `gowanus`, `red_hook`, `park_slope`, `prospect_heights`, `prospect_lefferts`, `crown_heights`, `bed_stuy`, `flatbush_plg`, `sunset_park`, `gravesend`, `sheepshead_bay`, `columbia_waterfront` |
| `outer_boroughs` | Queens / Bronx / SI | Outer | `astoria`, `long_island_city`, `sunnyside`, `jackson_heights`, `flushing`, `ridgewood`, `howard_beach`, `south_ozone_park`, `arthur_avenue`, `bronx`, `bronx_fordham`, `bronx_concourse`, `mott_haven`, `staten_island`, `stapleton_heights`, `city_island` |

**68 storage slugs** across 13 groups + 3 boroughs.

---

## 3. ROLE_EXPANSION — Stop Roles

The sheet's `stop_roles` column uses 6 raw values. The composition engine plans itineraries with 3 canonical slots (opener → main → closer). The scoring layer expands venue roles at query time:

| Venue role (sheet value) | Can serve as |
|---|---|
| `opener` | opener |
| `main` | main |
| `closer` | closer |
| `drinks` | opener OR closer |
| `activity` | opener |
| `coffee` | opener |

A venue tagged `drinks` will be considered for both opener and closer slots. A venue tagged `main` will only be considered for the main slot.

---

## 4. OCCASIONS

Valid values for the sheet's `occasion_tags` column (comma-separated, multiple allowed per venue):

```
first_date
dating
couple
friends
solo
```

Scoring: if the venue's `occasion_tags` includes the user's selected occasion → +15 pts (15% of score).

---

## 5. BUDGETS

The user picks a budget in the questionnaire. The scorer checks whether the venue's `price_tier` falls within the allowed tiers for that budget.

| Budget (user picks) | Matches `price_tier` |
|---|---|
| casual ($) | 1 |
| nice_out ($$) | 2 |
| splurge ($$$) | 3 |
| all_out ($$$$) | 4 |
| no_preference | 1, 2, 3, 4 |

Scoring: if the venue's tier matches → +15 pts (15% of score).

### Price Tier Display Ranges

| `price_tier` | Per-person estimate |
|---|---|
| 1 | $15–$30 |
| 2 | $35–$65 |
| 3 | $75–$150 |
| 4 | $150–$300 |

---

## 6. Full Scoring Weight Breakdown

| Factor | Weight | Field(s) | Logic |
|---|---|---|---|
| Vibe match | 35% | `vibe_tags` | Set intersection with selected vibe's tag group (see §1) |
| Occasion fit | 15% | `occasion_tags` | Exact match against user's selected occasion |
| Budget fit | 15% | `price_tier` | Tier falls within budget's allowed set |
| Location | 10% | `neighborhood` | Venue is in one of user's selected neighborhoods |
| Time relevance | 10% | *(base score)* | Fixed 10 pts for now (Phase 2: role-aware) |
| Quality signal | 10% | `quality_score` | Linear: `(quality_score / 10) * 10` |
| Curation boost | 5% | `curation_boost` | `curation_boost * 5` (0, 5, or 10 pts) |
| Jitter | variable | *(random)* | `Math.random() * 10` for variety on regenerate |

### Hard Filters (before scoring, binary pass/fail)

| Filter | Field | Rule |
|---|---|---|
| Active | `active` | Must be `true` |
| Role match | `stop_roles` | Venue must serve the requested composition role (via ROLE_EXPANSION) |
| Neighborhood | `neighborhood` | Must be in user's selected neighborhoods (relaxed if zero candidates) |
| Bad weather | `outdoor_seating` | If `outdoor_seating = "yes"` and weather is bad → filtered out |
| No alcohol | `vibe_tags` | If user's `drinks = "no"` → drop venues with `cocktail_forward`, `wine_bar`, `speakeasy`, or `drinks` tags |
| Walking proximity | `latitude`, `longitude` | Walk distance to anchor venue ≤ 1.5km (normal) or 0.4km (bad weather) |

---

## 7. Sheet Column → DB Column Quick Reference

| Sheet Column | DB Column | Type | Notes |
|---|---|---|---|
| name | name | TEXT NOT NULL | Primary identifier |
| neighborhood | neighborhood | TEXT NOT NULL | Must be a storage slug from §2 |
| category | category | TEXT NOT NULL | Lowercase, e.g. `italian`, `speakeasy` |
| price_tier | price_tier | INTEGER 1–4 | See §5 |
| vibe_tags | vibe_tags | TEXT[] | Comma-separated → array. Use tags from §1 |
| occasion_tags | occasion_tags | TEXT[] | Comma-separated → array. Use values from §4 |
| stop_roles | stop_roles | TEXT[] | Pipe or comma-separated → array. Use values from §3 |
| duration_hours | duration_hours | INTEGER 1–5 | Hours (1, 2, 3). Used for end-time buffer calc |
| outdoor_seating | outdoor_seating | TEXT | `yes` / `no` / `unknown` |
| reservation_difficulty | reservation_difficulty | INTEGER 1–4 | ≥3 shows "Book ahead" badge |
| reservation_url | reservation_url | TEXT | Full URL to Resy/OpenTable/Tock |
| maps_url | maps_url | TEXT | Google Maps URL |
| curation_note | curation_note | TEXT | 1–2 sentence human note. AI fallback. |
| awards | awards | TEXT | Single text, e.g. "Michelin Star" |
| curated_by | curated_by | TEXT | `reid` / `adit` / `community` |
| signature_order | signature_order | TEXT | "Get the cacio e pepe" — Gemini uses verbatim |
| address | address | TEXT | Street address |
| latitude | latitude | FLOAT | Required for geo |
| longitude | longitude | FLOAT | Required for geo |
| active | active | BOOLEAN | `true` / `false` |
| notes | notes | TEXT | Internal notes, not surfaced in UI |
| hours | hours | TEXT | Free-text, e.g. "Mon-Fri 11am-11pm" |
| last_verified | last_verified | DATE | ISO date, e.g. "2026-04-17" |
| happy_hour | happy_hour | TEXT | Free-text happy hour info |
| dog_friendly | dog_friendly | BOOLEAN | `true` / `false` |
| kid_friendly | kid_friendly | BOOLEAN | `true` / `false` |
| wheelchair_accessible | wheelchair_accessible | BOOLEAN | `true` / `false` |
| cash_only | cash_only | BOOLEAN | `true` → shows "Cash only" badge |
| quality_score | quality_score | INTEGER 1–10 | Default 7. Feeds 10% scoring weight |
| curation_boost | curation_boost | INTEGER 0–2 | Default 0. Feeds 5% scoring weight |
