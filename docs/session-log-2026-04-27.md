# Session Log — April 27, 2026

Summary of all changes made in this session, for context continuity.

---

## 1. Venue Detail Modal: Fix Double-Prefixed Photo URLs

**Files:** `src/components/venue/VenueDetailModal.tsx`

**Problem:** `VenueDetailModal` had a stale `photoUrl()` helper that prepended the Supabase storage URL. The `PhotoCarousel` called `getVenueImageUrls()` (which returns full URLs) then passed them through `photoUrl()`, double-prefixing the URL and producing 404s.

**Fix:** Removed the dead `photoUrl()` function and unused `SUPABASE_URL` constant. Carousel now uses full URLs from `getVenueImageUrls()` directly as `<img src>`.

**Commit:** `fix(venue-modal): remove double-prefixed photo URLs breaking image loads`

---

## 2. StopCard Redesign: Tighten Meta + Actions

**Files:** `src/components/ui/StopCard.tsx`, `src/components/itinerary/StopAvailability.tsx`, `src/components/itinerary/ItineraryView.tsx`, `src/lib/itinerary/time-blocks.ts`

**Changes:**
- **Compressed meta block** — Rating right-aligned on name row (`4.5 ★ 160`). Category, neighborhood, price, reservation status collapsed into one dot-separated line.
- **Unified reservation status** — Single `reservationStatus()` function: "Reservations required" / "Reservations recommended" / "Walk-in welcome" in the meta line. Removed `StopStatusBadge` import and walk-in pill.
- **Contextual book CTA** — Inline reserve link stays; big maroon booking button only renders when `selectedSlot` exists.
- **4 default time chips** — `pickRecommendedSlots` default count changed from 8 to 4.
- **Slimmer role separator** — `py-8` → `py-5`, smaller label text.

**Commit:** `refactor(stop-card): tighten meta + actions, unify reservation status, contextual book CTA`

---

## 3. Resy Chip Table Type + Date-Aware Deep Links

**Files:** `src/components/itinerary/SlotChip.tsx`, `src/components/itinerary/StopAvailability.tsx`, `src/components/ui/StopCard.tsx`, `src/components/itinerary/ItineraryView.tsx`

**Changes:**
- **SlotChip** now renders a two-line layout: time on top, `slot.type` (e.g. "Bar", "Dining Room") below in smaller muted text. Added `dedupeSlots()` to remove duplicate time+type combinations.
- **StopCard** now receives `date` and `partySize` props. For Resy venues, builds a date-aware URL via `buildResyBookingUrl(slug, date, partySize)`. For Resy venues without a slug, appends `?date=...&seats=...` to raw reservation_url.
- **ItineraryView** passes `date` and `partySize` through to StopCard.
- Fixed saved and share pages which were missing `date`/`partySize` props on `<ItineraryView>`.

**Commits:**
- `fix(stop-card): show Resy table type on chips, pass date to Resy deep-link`
- `fix(stop-card): append date param to all Resy URLs, not just slug-matched venues`
- `fix(stop-card): pass date and partySize to ItineraryView on saved and share pages`

---

## 4. Itinerary Header Expansion

**Files:** `src/components/itinerary/CompositionHeader.tsx`, `src/app/itinerary/page.tsx`, `src/app/itinerary/saved/[id]/page.tsx`, `src/app/itinerary/share/[id]/page.tsx`

**Changes:**
- Header now shows three layers: title/subtitle → utility rows (date · time block · neighborhoods) → atmosphere row (occasion · vibe · budget · weather)
- Date formatted via `Intl.DateTimeFormat` with UTC-safe parsing
- Time block label from `getBlockMetadata()`
- Neighborhoods reverse-mapped from expanded slugs to group labels via `deriveGroupIds()`
- Weather moved into atmosphere row, "total" word stripped from budget
- All three caller pages pass `inputs` prop

**Commits:**
- `feat(itinerary): expand header to show date, time block, neighborhoods, and party size`
- `fix(itinerary): header reverse-maps expanded slugs to group labels`

---

## 5. Show More Times Toggle

**Files:** `src/components/itinerary/StopAvailability.tsx`

**Change:** "Show more times (N more)" is now a toggle. When expanded, text changes to "Show fewer times". Collapsing preserves the selected slot — if it falls outside the default 4, it swaps into the visible set.

**Commit:** `fix(stop-card): make show more times a toggle, preserve selection on collapse`

---

## 6. Book Button Layout Fix

**Files:** `src/components/ui/StopCard.tsx`, `src/components/itinerary/StopAvailability.tsx`, `src/components/itinerary/ItineraryView.tsx`

**Changes:**
- "Reserve on Resy →" now stays visible regardless of slot selection (removed `!hasSelectedSlot` guard)
- Book button wrapped in its own `<div>` block for separate row rendering
- Removed unused `hasSelectedSlot` prop

**Commit:** `fix(stop-card): book button on its own row, keep reserve link visible after slot select`

---

## 7. Generate-Configs: Live Google Sheet

**Files:** `scripts/generate-configs.py`, `CLAUDE.md`

**Change:** Rewrote the generator script to read from the live Google Sheet (`139gp-s2sBbEZbi4-6mrsMlhKykpoGWvuQdboMaAt20o`) via Google Sheets API instead of the stale local xlsx file. Structured configs (neighborhood groups, vibe scoring matrix, budget tiers, role expansion) are maintained as constants in the script. Flat value lists (neighborhoods, categories, vibes, occasions, stop roles) read from the Master Reference tab.

**Commit:** `chore(scripts): generate-configs reads from live Google Sheet, not local xlsx`

---

## 8. Config Drift Audit

**Files:** `docs/config-drift-audit.md` (created, later archived)

**Audit findings:**
- 12 phantom slugs in NEIGHBORHOOD_GROUPS with zero active venues
- 4 orphan slugs in DB with no group (bushwick=17 venues!)
- `acclaimed` vibe tag missing from generated config
- `shopping`, `vegan` categories missing
- 8 phantom categories with no venues

---

## 9. Neighborhood Picker Audit

**Files:** `docs/neighborhood-picker-audit.md` (created, later archived)

**Finding:** Minor drift — profile page uses standalone inline picker instead of shared `NeighborhoodPicker`. Onboarding and questionnaire share the component. The "8 slugs in header" bug was a display issue in `CompositionHeader`, not a picker bug.

---

## 10. Regenerate All Configs from Live Sheet

**Files:** All `src/config/generated/*.ts` files

**Changes:**
- neighborhoods.ts: phantom slugs removed, bushwick added, gramercy replaces gramercy_kips_bay
- vibes.ts: `acclaimed` added to CROSS_CUTTING_VIBE_TAGS
- categories.ts: `shopping`, `vegan` added
- occasions.ts, stop-roles.ts, budgets.ts: header-only changes

**Commit:** `chore(config): regenerate all configs from live sheet`

---

## 11. 25-Group Neighborhood Taxonomy

**Files:** `scripts/generate-configs.py`, `src/config/generated/neighborhoods.ts`, `src/config/neighborhoods.ts`

**Change:** Replaced 13-group taxonomy with 25 fine-grained groups:
- Manhattan split: chelsea_flatiron → chelsea + flatiron_nomad + gramercy_murray_hill; midtown_hk → midtown_west + midtown_east + koreatown; chinatown_fidi → chinatown + fidi_lower_manhattan
- Brooklyn split: brooklyn (18-slug catch-all) → williamsburg_greenpoint + east_williamsburg_bushwick + dumbo_brooklyn_heights + fort_greene_clinton_hill + park_slope_prospect + bed_stuy_crown_heights + south_brooklyn
- Outer split: outer_boroughs → astoria_lic + queens + bronx_si
- Added `"queens"` to Borough type

**Commit:** `fix(config): land 25-group neighborhood taxonomy`

---

## 12. Profile Favorite Hoods: Fix Stale ID Persistence

**Files:** `src/app/profile/_components/AccountDetails.tsx`

**Problem:** When editing favorite neighborhoods, stale group IDs (from old taxonomy, e.g. `chelsea_flatiron`) persisted invisibly in the draft. User selected new groups but old ones stayed, producing appended arrays.

**Fix:** Filter `profile.favorite_hoods` through valid `FAVORITE_HOODS` IDs before initializing the draft. Stale entries are stripped on load.

**Commit:** `fix(profile): replace favorite_hoods on save instead of appending`

---

## 13. Remove Dead LABEL_OVERRIDES

**Files:** `src/config/neighborhoods.ts`

**Change:** Removed `midtown_hells_kitchen` and `flatbush_plg` from LABEL_OVERRIDES (zero venues, removed from taxonomy). Kept `gramercy_kips_bay` (still a valid storage slug in the gramercy_murray_hill group).

**Commit:** `chore(neighborhoods): remove dead LABEL_OVERRIDES entries from old taxonomy`

---

## 14. Profile Picker → Shared NeighborhoodPicker

**Files:** `src/app/profile/_components/AccountDetails.tsx`

**Change:** Replaced the standalone inline pill rendering in `HoodsField` with the shared `NeighborhoodPicker` component. Removed the now-unnecessary `toggle` function. Preserved stale-ID filter, uncapped selections, flat layout, no animation.

**Commit:** `refactor(profile): use shared NeighborhoodPicker in HoodsField`

---

## 15. Archive Resolved Audit Docs

**Files:** `docs/config-drift-audit.md` → `docs/archive/2026-04-27-config-drift-audit.md`, `docs/neighborhood-picker-audit.md` → `docs/archive/2026-04-27-neighborhood-picker-audit.md`

**Change:** Moved both audit reports to `docs/archive/` with date prefixes and archive notes. Both describe pre-fix state that's now resolved.

**Commit:** `docs: archive resolved audit reports`

---

## 16. Itinerary Pipeline Audit

**Files:** `docs/itinerary-audit.md` (created)

**Read-only audit** covering the full generation pipeline. Top findings:
1. No composition diversity guard (three same-category stops possible)
2. Time relevance scoring is dead code (stub returning 10/10)
3. Party size hardcoded to 2 for Resy queries
4. All ~1,400 venues loaded into memory per request
5. Swap logic wired but disabled
6. Budget is soft signal, not hard filter
7. Silent slot skipping
8. Curation boost unbounded
9. Sequential Resy API calls
10. No server-side timeBlock validation

10 design questions for future work.

---

## 17. Algorithm Tuning Module + Three Fixes

**Files:** `src/config/algorithm.ts` (new), `src/lib/scoring.ts`, `src/lib/composer.ts`, `src/app/api/generate/route.ts`, `src/lib/itinerary/seed.ts` (new), `src/config/budgets.ts`

### Section 0: Centralize constants
Created `src/config/algorithm.ts` — single source of truth for all scoring weights, distance caps, pool thresholds, composition rules, and jitter magnitude. Migrated all magic numbers from scoring.ts, composer.ts, and route.ts.

**Commit:** `refactor(algorithm): centralize all generation tuning constants in algorithm.ts`

### Section 1: Deterministic jitter
Created `src/lib/itinerary/seed.ts` with FNV-1a hash + Mulberry32 PRNG. Same request inputs produce same seed → same jitter → same itinerary. Seeded random plumbed through `composeItinerary()` → `pickBestForRole()` → `scoreVenue()`.

**Commit:** `feat(scoring): seed jitter from request hash for deterministic itineraries`

### Section 2: Budget hard filter
Budget is now a hard filter at candidate-filtering stage. If pool drops below 30 venues, widens by one tier in each direction via `widenBudgetTiers()`. "no_preference" skips the filter.

**Commit:** `feat(scoring): make budget a hard filter with one-tier widening`

### Section 3: Category diversity penalty
`usedCategories: Set<string>` tracks categories across stop picks. -20 score penalty (from `ALGORITHM.penalties.categoryDuplicate`) when a candidate matches an already-used category. Soft penalty — duplicate can still win if other signals are strong.

**Commit:** `feat(scoring): -20 score penalty for repeated category in composition`

---

## 18. Auth: Default to Email Login

**Files:** `src/components/auth/AuthScreen.tsx`

**Change:** Flipped default `authMode` from `"phone"` to `"email"`. Phone OTP isn't working yet; email/password form was already fully implemented. Users can still switch to phone via "Use phone instead" link.

**Commit:** `fix(auth): default to email login instead of phone OTP`

---

## Files Created This Session

| File | Purpose |
|------|---------|
| `src/config/algorithm.ts` | Algorithm tuning constants (weights, thresholds, caps) |
| `src/lib/itinerary/seed.ts` | Deterministic seeded PRNG for scoring jitter |
| `docs/itinerary-audit.md` | Full pipeline audit report |
| `docs/archive/2026-04-27-config-drift-audit.md` | Archived config drift audit |
| `docs/archive/2026-04-27-neighborhood-picker-audit.md` | Archived picker audit |
| `docs/session-log-2026-04-27.md` | This file |

## Test Status

95 tests passing across 4 test files. Clean TypeScript compile throughout.
