# Venue Data Pipeline Audit

Generated 2026-04-16. Covers the full lifecycle: Reid's spreadsheet → import script → Supabase DB → TypeScript types → app runtime.

---

## Complete Field Mapping: Sheet → Import → DB → TypeScript → App

### Actively Used Fields

| Sheet Column | Import Transform | DB Column | DB Type | TS Type | Used By |
|---|---|---|---|---|---|
| `name` | trim | `name` | TEXT NOT NULL | `string` | Everywhere — StopCard, composer, scoring, Gemini prompt |
| `category` | lowercase, trim | `category` | TEXT NOT NULL | `string` | StopCard display, Gemini prompt |
| `Category 2` | trim or NULL | `category_group` | TEXT (nullable) | `string \| null` | StopCard display badge — only in Reid's enriched StopCard (migration not applied to prod yet) |
| `neighborhood` | validate vs CANONICAL_NEIGHBORHOODS + NEIGHBORHOOD_ERROR_FIX overrides | `neighborhood` | TEXT NOT NULL | `Neighborhood` (branded union from config) | Scoring (10%), hard filter, StopCard display |
| `lat` | parse_float | `latitude` | DOUBLE PRECISION NOT NULL | `number` | Geo: walk distance, proximity filtering, Maps URL |
| `lng` | parse_float | `longitude` | DOUBLE PRECISION NOT NULL | `number` | Geo: walk distance, proximity filtering, Maps URL |
| `stop_role` | `split_roles()` on `[\|,;]` → STOP_ROLE_MAP lossy mapping (e.g. "drinks" → ["opener","closer"], "activity"/"coffee" → ["opener"]) | `stop_roles` | TEXT[] NOT NULL DEFAULT '{}' | `StopRole[]` ("opener" \| "main" \| "closer") | Scoring hard filter, composition pattern matching |
| `price_tier` | parse_int, validated 1–4 | `price_tier` | INT CHECK(1–4) | `1 \| 2 \| 3 \| 4` | Scoring (15%), spend estimate, budget filter |
| `vibe_tags` | `split_tags()` → 4-bucket normalization: (1) direct canonical hits pass through, (2) VIBE_TAG_MAP semantic mapping, (3) unmapped tags dropped, (4) CATEGORY_VIBE_AUGMENT adds implied tags + logistics tags extracted to separate columns | `vibe_tags` | TEXT[] | `string[]` | Scoring (35% vibe match), alcohol filter |
| `occasion_fit` | `split_tags()` → OCCASION_MAP (25 raw values → 6 canonical; non-occasion values dropped silently) | `occasion_tags` | TEXT[] | `Occasion[]` ("first-date" \| "second-date" \| "dating" \| "established" \| "friends" \| "solo") | Scoring (15%) |
| `outdoor_seating` | parse_bool ({yes, no, unknown} → true/false/null) | `outdoor_seating` | BOOLEAN (nullable) | `boolean \| null` | Weather gate hard filter (bad weather drops outdoor=true venues; null treated as "unknown, skip filter") |
| `reservation_url` | trim or NULL | `reservation_url` | TEXT (nullable) | `string \| null` | StopCard booking link (detectBookingPlatform infers Resy/OpenTable/Tock) |
| `curation_note` | trim, default "" | `curation_note` | TEXT NOT NULL DEFAULT '' | `string` | StopCard display, Gemini prompt input, fallback when AI copy generation fails |
| `active` | parse_bool, default true | `active` | BOOLEAN NOT NULL DEFAULT TRUE | `boolean` | Hard filter on every venue query (`WHERE active = true`) |
| `time_estimate` | `parse_int() * 60` (hours → minutes) | `duration_minutes` | INTEGER (nullable) | `number \| null` | applyEndTimeBuffer in /api/generate — per-venue arrival timing; falls back to ROLE_AVG_DURATION_MIN (60/120/60) when null |
| `reservation_difficulty` | parse_int, validated 1–4 | `reservation_difficulty` | INTEGER CHECK(1–4) (nullable) | `number \| null` | StopCard "Book ahead" badge when ≥ 3 |
| `signature_order` | trim or NULL | `signature_order` | TEXT (nullable) | `string \| null` | Gemini prompt — inserted verbatim (e.g. "Get the cacio e pepe"). Gemini must NOT paraphrase when present. |
| `cash_only` *(extracted from vibe_tags)* | If `cash_only` tag present in raw vibe_tags → set cash_only=true, remove tag from canonical vibe_tags | `cash_only` | BOOLEAN (nullable) | `boolean \| null` | StopCard "Cash only" badge |
| *(not imported — hand-set in Supabase)* | — | `quality_score` | INTEGER CHECK(1–10) DEFAULT 7 | `number` | Scoring (10% weight). Intentionally excluded from import upsert so hand-tuned values survive re-imports. |
| *(not imported — hand-set in Supabase)* | — | `curation_boost` | INTEGER CHECK(0–2) DEFAULT 0 | `number` | Scoring (5% weight). Intentionally excluded from import upsert so hand-tuned values survive re-imports. |

### Dead Fields (stored in DB but zero app code reads them)

| Sheet Column | DB Column | DB Type | TS Type | Reserved For |
|---|---|---|---|---|
| `stop_role` (raw string preserved) | `raw_stop_role` | TEXT (nullable) | `string \| null` | Phase 2: richer role categorization beyond opener/main/closer |
| `vibe_tags` (full raw list preserved) | `raw_vibe_tags` | TEXT[] DEFAULT '{}' | `string[]` | Phase 2: semantic embeddings from Reid's full 81-tag taxonomy |
| `curated_by` | `curated_by` | TEXT (nullable) | `string \| null` | Phase 2: curation credits ("reid" / "adit" / "community"), community submissions |
| `last_verified` | `last_verified` | DATE (nullable) | `string \| null` | Phase 2: staleness warnings ("verified 6 months ago") |
| `hours` | `hours` | TEXT (nullable) | `string \| null` | Phase 2: operating hours display, closed-now filter |
| `dog_friendly` | `dog_friendly` | BOOLEAN (nullable) | `boolean \| null` | Phase 2: user preference filter |
| `kid_friendly` | `kid_friendly` | BOOLEAN (nullable) | `boolean \| null` | Phase 2: family occasion filter |
| `wheelchair_accessible` | `wheelchair_accessible` | TEXT (nullable) | `string \| null` | Phase 2: accessibility filter ('yes' / 'no' / 'partial') |
| *(not imported — seed-only)* | `best_before` | TEXT (nullable) | `string \| null` | Seed-only. Never populated by import. Originally intended for time-of-day filtering. |
| *(not imported — seed-only)* | `best_after` | TEXT (nullable) | `string \| null` | Seed-only. Never populated by import. Originally intended for time-of-day filtering. |
| *(not imported)* | `address` | TEXT (nullable) | `string \| null` | Reid's sheet has no dedicated address column. Column made nullable by 20260413 migration. |
| *(auto-generated)* | `created_at` | TIMESTAMPTZ DEFAULT NOW() | *(not in Venue type)* | Auditing only |

### Card Enrichment Fields (migration NOT applied to production)

These columns are defined in `supabase/migrations/20260414_venue_card_enrichment.sql` which has never been pushed to the remote DB. The TypeScript Venue type declares them and StopCard renders them conditionally, but at runtime `select *` returns rows without these fields. The values are `undefined` (not `null`), and all conditional renders (`photo_url &&`, `awards?.length > 0`, etc.) gracefully skip. No runtime error — just ~30 lines of dead StopCard JSX.

| Sheet Column | DB Column | DB Type | TS Type | What it would do |
|---|---|---|---|---|
| *(manual population)* | `photo_url` | TEXT (nullable) | `string \| null` | StopCard 16:9 hero image. Currently renders empty cream placeholder box. |
| *(manual population)* | `awards` | TEXT[] DEFAULT '{}' | `string[] \| null` | StopCard award pill badges (see src/config/awards.ts for slug list) |
| *(manual population)* | `amex_dining` | BOOLEAN DEFAULT false | `boolean \| null` | StopCard right-side Amex Platinum Global Dining Access logo |
| *(manual population)* | `chase_sapphire` | BOOLEAN DEFAULT false | `boolean \| null` | StopCard right-side Chase Sapphire Reserve Dining logo |
| `dress_code` | `dress_code` | TEXT (nullable) | `string \| null` | StopCard "Dress: {value}" line |

---

## Column Name Renames (Sheet ≠ DB)

| What Reid's Sheet Calls It | What the Import Script Outputs | Why |
|---|---|---|
| `stop_role` (singular) | `stop_roles` (plural, array) | Sheet has one cell; script splits on `\|,;` and maps via STOP_ROLE_MAP to produce an array |
| `occasion_fit` | `occasion_tags` | Sheet uses "fit" (Reid's UX term); DB uses "tags" (matches vibe_tags convention). OCCASION_MAP also transforms values. |
| `time_estimate` (hours) | `duration_minutes` (minutes) | Unit conversion: `parse_int() * 60`. Sheet stores hours (1, 2, 3); DB stores minutes (60, 120, 180). |
| `Category 2` | `category_group` | Sheet uses "Category 2" (Reid's spreadsheet header); DB/TS uses the more descriptive `category_group`. |
| `lat` / `lng` | `latitude` / `longitude` | Short vs long form. |

---

## Scoring Weight Breakdown

For reference — how venue fields map to the weighted scoring algorithm in `lib/scoring.ts`:

| Factor | Weight | Field(s) Used | Logic |
|---|---|---|---|
| Vibe match | 35% | `vibe_tags` | Set intersection with selected vibe's canonical tags. 2+ hits = 35, 1 hit = 25, 0 hits = 10. "mix-it-up" gives 25 base. |
| Occasion fit | 15% | `occasion_tags` | `venue.occasion_tags.includes(answers.occasion)` — exact match |
| Budget fit | 15% | `price_tier` | `BUDGET_TIER_MAP[answers.budget].includes(venue.price_tier)` |
| Location | 10% | `neighborhood` | Venue is in one of the user's selected neighborhoods (or neighborhoods is empty = all match) |
| Time relevance | 10% | *(none — base score for now)* | `score += 10` for everyone. Role-aware time logic is Phase 2. |
| Quality signal | 10% | `quality_score` | `(quality_score / 10) * 10` — linear 0–10 scale |
| Curation boost | 5% | `curation_boost` | `curation_boost * 5` — 0, 5, or 10 extra points |
| Jitter | variable | *(random)* | `Math.random() * jitter` — default jitter=10, provides variety on regenerate |

### Hard Filters (applied before scoring, not weighted)

| Filter | Field | Logic |
|---|---|---|
| Active | `active` | `v.active === true` |
| Role match | `stop_roles` | `v.stop_roles.includes(role)` |
| Neighborhood match | `neighborhood` | `answers.neighborhoods.includes(v.neighborhood)` (relaxed if zero candidates survive) |
| Bad-weather outdoor | `outdoor_seating` | `weather.is_bad_weather && v.outdoor_seating === true` → filtered out |
| Alcohol preference | `vibe_tags` | If `profile.drinks === "no"`, drop venues with any ALCOHOL_VIBE_TAGS hit |
| Walking proximity | `latitude`, `longitude` | walkDistanceKm to anchor venue ≤ MAX_WALK_KM (1.5km normal, 0.4km bad weather) |

---

## Import Script Transformations (scripts/import_venues.py)

### Stop Role Mapping (STOP_ROLE_MAP)

| Sheet Value | → Canonical stop_roles |
|---|---|
| `opener` | `["opener"]` |
| `main` | `["main"]` |
| `closer` | `["closer"]` |
| `drinks` | `["opener", "closer"]` |
| `activity` | `["opener"]` |
| `coffee` | `["opener"]` |

Original raw string preserved in `raw_stop_role`.

### Occasion Mapping (OCCASION_MAP)

| Sheet Value | → Canonical occasion_tag |
|---|---|
| `first_date` / `first-date` | `first-date` |
| `second_date` / `second-date` | `second-date` |
| `dating` / `date` | `dating` |
| `couple` / `celebration` / `anniversary` / `special-occasion` / `special-night` / `established` | `established` |
| `friends` / `group` / `late_night_crew` / `hang` / `casual` / `unwind` | `friends` |
| `solo` | `solo` |
| `rainy-day` / `morning` / `coffee` / `work` / `family` / `snack` / `dinner` / `lunch` / `drinks` / `cocktails` | *(dropped)* |

### Vibe Tag Normalization (4 buckets)

**Bucket 1 — Direct canonical hits (pass through):**
All 22 canonical tags: `food_forward`, `tasting`, `dinner`, `bistro`, `cocktail_forward`, `wine_bar`, `speakeasy`, `drinks`, `activity`, `comedy`, `karaoke`, `games`, `bowling`, `walk`, `gallery`, `bookstore`, `market`, `park`, `romantic`, `conversation_friendly`, `group_friendly`, `late_night`, `casual`, `upscale`, `outdoor`, `classic`.

**Bucket 2 — Semantic mapping (VIBE_TAG_MAP):**
| Raw Tag | → Canonical |
|---|---|
| `grown-up` | `upscale` |
| `date-ready` / `intimate` / `low-lit` | `romantic` |
| `cultural` | `gallery` |
| `cozy` | `conversation_friendly` |
| `cocktails` | `cocktail_forward` |
| `pasta-forward` | `food_forward` |
| `wine-forward` | `wine_bar` |
| `social` / `shareable` | `group_friendly` |
| `omakase` | `tasting` |
| `group-friendly` | `group_friendly` |
| `late-night` | `late_night` |

**Bucket 3 — Dropped (not canonical, not mapped):**
Tags like `iykyk`, `hidden`, `cheap_eats`, `trendy`, `scenic`, etc. Raw preserved in `raw_vibe_tags`.

**Bucket 4 — Logistics extraction:**
`cash_only` tag → extracted from vibe_tags, set as boolean column `cash_only = true`.

**Category augmentation (CATEGORY_VIBE_AUGMENT):**
If `venue.category` matches, implied vibe tags are auto-added:
| Category | → Added Tag |
|---|---|
| `park` | `park` |
| `bookstore` | `bookstore` |
| `museum` / `gallery` | `gallery` |
| `market` | `market` |
| *(others per CATEGORY_VIBE_AUGMENT dict)* | *(varies)* |

---

## Misalignments & Issues

### 1. Venue card enrichment migration never applied to production

`supabase/migrations/20260414_venue_card_enrichment.sql` adds 5 columns (`photo_url`, `awards`, `amex_dining`, `chase_sapphire`, `dress_code`). It exists locally but was never pushed to the remote Supabase project. The migration history shows it as local-only. As a result:
- StopCard's hero photo renders an empty cream placeholder on every venue
- Award pills, Amex/Chase badges, and dress code line never render
- ~30 lines of StopCard JSX are effectively dead code in production

**Fix:** Either apply the migration (columns would all be null/default until populated) or remove the StopCard rendering + type fields until you're ready to populate the data.

### 2. `quality_score` and `curation_boost` are not settable via import

Both are intentionally excluded from the import script's INSERT/UPDATE column lists. Hand-tuned seed values (e.g. Via Carota = quality_score 9, curation_boost 2) survive re-imports. But there's no way to set these from the spreadsheet — they're admin-only, modified directly in Supabase SQL editor. This is by design but undocumented outside a code comment.

### 3. `last_verified` type mismatch

DB stores `DATE` but TypeScript declares `string | null`. No runtime issue since nothing reads the field, but if it ever surfaces in the UI, the value would need parsing from ISO date string format.

### 4. `best_before` / `best_after` are orphaned

These exist on the DB schema (from the original seed migration) and the TypeScript type, but:
- The import script doesn't write them (not in INSERT_COLS)
- No app code reads them
- Only 5 seed rows have values
- No clear Phase 2 plan references them

They're dead weight — harmless but confusing for new contributors.

### 5. Deduplication behavior undocumented

The import uses `ON CONFLICT (LOWER(name), neighborhood) DO UPDATE` — last row wins. If two rows in the CSV share the same name + neighborhood, the later one silently overwrites the earlier. This is by design but should be documented prominently.

---

## Files That Reference Venue Fields

| File | What it reads | Purpose |
|---|---|---|
| `src/lib/scoring.ts` | `vibe_tags`, `occasion_tags`, `price_tier`, `neighborhood`, `quality_score`, `curation_boost`, `stop_roles`, `active`, `outdoor_seating`, `latitude`, `longitude` | Scoring + hard filtering |
| `src/lib/composer.ts` | `stop_roles` (via scoring), `duration_minutes` (comment only — used post-composition in route) | Stop-mix planning |
| `src/app/api/generate/route.ts` | `vibe_tags` (alcohol filter), `duration_minutes` (end-time buffer), all via `Venue` type | Generation pipeline |
| `src/app/api/add-stop/route.ts` | Same as generate | Extend-itinerary pipeline |
| `src/components/ui/StopCard.tsx` | `name`, `category`, `neighborhood`, `photo_url`, `awards`, `dress_code`, `curation_note`, `reservation_url`, `reservation_difficulty`, `cash_only`, `amex_dining`, `chase_sapphire`, `price_tier` | Venue card display |
| `src/lib/claude.ts` (Gemini) | `name`, `category`, `neighborhood`, `curation_note`, `signature_order` | AI copy generation prompt |
| `src/lib/geo.ts` | `latitude`, `longitude` | Walk distance, Maps URL |
| `src/config/vibes.ts` | Defines `VIBE_VENUE_TAGS` (scored tags) + `ALCOHOL_VIBE_TAGS` (drinks filter) + `CROSS_CUTTING_VIBE_TAGS` (metadata) | Tag taxonomy |
| `scripts/import_venues.py` | All sheet columns | CSV → SQL import |
