# Reid's branch review — `reid/sandbox-testing` vs `main`

## Summary

Reid is rebuilding the funnel. The two new commits (`ab30d48`, `92b8a35 "Big changes"`) take a feature pass and turn it into a **product expansion**: the questionnaire collapses from 5 occasions to 3 and switches from one-vibe to **multi-vibe (up to 2)**; an alternate **"I already have a spot" anchor entrypoint** lets users search the catalog, fall through to Google Places, or submit a new venue; **saved/heart venues** persist to `composer_users` with a scoring boost; **party size** persists on saved itineraries; and a new **pre-composition Resy availability gate** with in-memory caching influences venue selection (previously presentation-only). It clusters into two themes — (1) personalization (saved venues, party size, multi-vibe) and (2) a bring-your-own-anchor alternate funnel — and it adds two unit-test updates so he's at least aware of the type churn. **But it touches the load-bearing slug taxonomy (occasion + vibe) without updating the venue sheet, ships a parallel `/api/venue-import` write path that bypasses our consolidated import module, hardcodes a `+5` saved-venue boost outside `ALGORITHM.weights`, and leaves a provisional-venues RLS policy as a `NOTE: Apply this policy manually` TODO.** Two of five migrations still have the `20260501_*` prefix collision that breaks `supabase db push`. Treat as a substantial product PR, not a feature tweak.

---

## Commits

```
92b8a35  2026-05-11  Big changes — Algorithm, reduced fields, etc.
ab30d48  2026-05-10  Create VenueDetailSheet.tsx
41fcfa5  2026-05-01  Remove & Save Grid — Look at profile page for saved venues
3319e6b  2026-05-01  Add an anchor
```

## File-level scope

```
 56 files changed, 2,672 insertions(+), 299 deletions(-)
```

No deleted files. No `package.json` changes (no new dependencies).

---

## Categorization

### UI / components / styling (20 files)

| File | LoC | Notes |
|---|---|---|
| `src/components/anchor/AddVenueSheet.tsx` | **+238** | NEW — user-submission form |
| `src/components/anchor/AnchorConfirm.tsx` | +122 | NEW |
| `src/components/anchor/AnchorSearch.tsx` | +107 | NEW |
| `src/components/anchor/AreaCombobox.tsx` | +83 | NEW |
| `src/components/profile/VenueDetailSheet.tsx` | +99 | NEW |
| `src/components/profile/YourPlacesGrid.tsx` | +92 | NEW — saved-venues grid |
| `src/components/providers/SavedVenuesProvider.tsx` | +80 | NEW — context for heart state |
| `src/components/questionnaire/QuestionnaireShell.tsx` | 117 | Touches questionnaire flow |
| `src/components/questionnaire/VibeStep.tsx` | +99 | NEW — multi-select vibes |
| `src/components/questionnaire/WhenStep.tsx` | 52 | |
| `src/components/questionnaire/StepLoading.tsx` | 12 | |
| `src/components/itinerary/ItineraryView.tsx` | 41 | Wires onRemoveStop |
| `src/components/itinerary/ActionBar.tsx` | -63 (mostly) | |
| `src/components/itinerary/CompositionHeader.tsx` | 6 | |
| `src/components/ui/StopCard.tsx` | 68 | Adds HeartButton, Remove button |
| `src/components/ui/StopStatusBadge.tsx` | 60 | Signature change to dead-code component |
| `src/components/ui/Toast.tsx` | 9 | `onTimeout` callback |
| `src/components/venue/VenueDetailModal.tsx` | 5 | |
| `src/components/home/HomeScreen.tsx` | 8 | New "I already have a spot →" CTA |
| `src/app/globals.css` | 27 | |

### Scoring / composer / itinerary generation logic (7 files) — **HIGH-RISK**

| File | LoC | Notes |
|---|---|---|
| `src/lib/composer.ts` | **117** | New `composeAroundAnchor` orchestrator + multi-vibe threading + savedVenueIds param chain |
| `src/lib/itinerary/availability-enrichment.ts` | **83** | Pre-composition Resy gate added |
| `src/lib/scoring.ts` | **66** | Multi-vibe support + hardcoded `+5` saved boost; stripped our JSDoc on `pickBestForRole` |
| `src/lib/availability/resy-cache.ts` | +45 | NEW — in-memory TTL cache |
| `src/lib/sharing.ts` | 24 | |
| `src/lib/booking.ts` | 17 | |
| `src/lib/itinerary/seed.ts` | 2 | |

### Venue import pipeline / admin sync — **NONE TOUCHED** ✅

Reid did not modify any file under `src/lib/venues/`, `src/app/profile/_components/`, `src/app/api/admin/`, or `scripts/import-venues.ts`. Our Phase 1-5 consolidation is intact in-place.

⚠️ **However**, he added a parallel write path (`/api/venue-import` + `/api/venue-submission`) that does direct `INSERT`s into `composer_venues_v2` without going through `composer_apply_venue_import` — effectively bypassing the consolidation rather than modifying it.

### Auth / onboarding (2 files)

| File | LoC | Notes |
|---|---|---|
| `src/lib/auth.ts` | 12 | Adds `getSavedVenueIds` helper |
| `src/config/onboarding.ts` | 25 | |

### API routes (14 files)

| File | LoC | Notes |
|---|---|---|
| `src/app/api/generate/route.ts` | **91** | **HIGH-RISK** — anchor handling, multi-vibe, partySize, Resy pre-gate wiring |
| `src/app/api/venue-import/route.ts` | +123 | NEW — provisional venue from Google Places |
| `src/app/api/venue-search/route.ts` | +103 | NEW — catalog + Google Places fallback |
| `src/app/api/venue-submission/route.ts` | +90 | NEW — user-submitted venues |
| `src/app/api/save-venue/route.ts` | +69 | NEW — heart toggle (broken in prod, see flags) |
| `src/app/api/add-stop/route.ts` | 14 | Likely multi-vibe propagation |
| `src/app/api/swap-stop/route.ts` | 14 | Likely multi-vibe propagation |
| `src/app/api/health/route.ts` | 7 | |
| `src/app/compose/anchor/page.tsx` | +150 | NEW — anchor entry-flow page |
| `src/app/itinerary/page.tsx` | **133** | Remove-stop, savedVenues, recomputeWalks |
| `src/app/profile/page.tsx` | 69 | "Your places" grid wiring |
| `src/app/itinerary/saved/[id]/page.tsx` | 16 | partySize threading |
| `src/app/itinerary/share/[id]/page.tsx` | 2 | |

### Config — taxonomy / algorithm / prompts (6 files)

| File | LoC | Notes |
|---|---|---|
| `src/config/occasions.ts` | **54** | **TAXONOMY CHANGE** — collapse to `date_night` / `friends_family` / `solo` |
| `src/config/templates.ts` | 30 | |
| `src/config/onboarding.ts` | 25 | |
| `src/config/options.ts` | 19 | **TAXONOMY CHANGE** — occasion + vibe step (single→multi) |
| `src/config/algorithm.ts` | 17 | New `availability` block (pre-gate Resy timeout/TTL) — no weight changes |
| `src/config/prompts.ts` | 4 | Gemini input prompt updated for `vibes` array |
| `src/types/index.ts` | 16 | Adds `partySize`, `vibes[]`, provisional Venue fields |

### Generated configs — **NONE TOUCHED** ✅

Reid did not edit any file in `src/config/generated/`. Good — those are pipeline outputs.

### Docs — **NONE TOUCHED**

No updates to CLAUDE.md, ALGORITHM.md, README.md, BRAND_VOICE.md, or CONTRIBUTING.md. The taxonomy collapse, multi-vibe shift, anchor entrypoint, and new env vars all land without documentation updates.

### Tests (1 file)

| File | LoC | Notes |
|---|---|---|
| `tests/unit/scoring.test.ts` | 5 | Updated for `occasion: "date_night"`, `vibes: [...]`, `partySize: 2` |

### Other (1 file)

| File | LoC | Notes |
|---|---|---|
| `.env.example` | +2 | `GOOGLE_PLACES_API_KEY`, `FOUNDER_REVIEW_WEBHOOK_URL` |

---

## Specific flags

### Deleted files

**None.**

### New dependencies

**None** — `package.json` is unchanged. The new code uses existing `@google/generative-ai`, `motion`, and the Resy client we already have.

### High-risk core-logic touches

| File | Touched? | Risk |
|---|---|---|
| `src/lib/venues/*` (10 files) | ❌ No | — |
| `src/lib/scoring.ts` | ✅ 66 LoC | **High** — multi-vibe rewrite + hardcoded `+5` boost + stripped JSDoc |
| `src/lib/composer.ts` | ✅ 117 LoC | **High** — new `composeAroundAnchor`, multi-vibe threading |
| `src/app/api/generate/route.ts` | ✅ 91 LoC | **High** — anchor mode, multi-vibe, partySize, pre-gate |
| `src/lib/itinerary/availability-enrichment.ts` | ✅ 83 LoC | **High** — Resy availability now affects composition (was presentation-only per ALGORITHM.md) |

### Env vars / migrations / RLS

**New env vars (`.env.example`):**
- `GOOGLE_PLACES_API_KEY` (already optional in CLAUDE.md — partially documented)
- `FOUNDER_REVIEW_WEBHOOK_URL` (undocumented anywhere)

Both need adding to Vercel for the anchor + venue-import flows to function.

**Migrations (5):**

| File | Status |
|---|---|
| `20260501_provisional_venues.sql` | 🔴 **Prefix collision** with existing `20260501_composer_apply_venue_import_function.sql`; **also has `NOTE: Apply this policy manually after reviewing existing RLS`** — RLS policy not written |
| `20260501_saved_venues.sql` | 🔴 **Prefix collision**; will break `supabase db push` |
| `20260510_saved_itinerary_vibes_array.sql` | 🟡 Date OK (post 2026-05-04). Backwards-compat shim ("kept readable for one release") contradicts the "no backcompat shims unless asked" preference |
| `20260513_venue_submissions.sql` | ✅ Date OK. Proper RLS policies (INSERT, SELECT scoped to `submitter_id = auth.uid()`) |
| `20260515_saved_itinerary_party_size.sql` | 🟡 Date OK. Adds `NOT NULL DEFAULT 2` — recurring bug pattern from saved memory ("schema migrations land with their writers"). Default makes it safe, but verify Reid updated every INSERT call site on `composer_saved_itineraries` |

**RLS-affecting:**
- `/api/save-venue` writes to `composer_users` with the **authed** server client — the `20260429_lockdown_composer_users_update_rls.sql` migration **drops the UPDATE policy**, so this endpoint silently fails RLS in production. Feature broken end-to-end unless rerouted through service-role or `PATCH /api/profile`.
- `provisional_venues` migration leaves RLS as a TODO comment.

### Files with >100-line diffs (real work, not tweaks)

10 files:

```
+238  src/components/anchor/AddVenueSheet.tsx       (new)
+150  src/app/compose/anchor/page.tsx               (new)
 133  src/app/itinerary/page.tsx
+123  src/app/api/venue-import/route.ts             (new)
+122  src/components/anchor/AnchorConfirm.tsx       (new)
 117  src/components/questionnaire/QuestionnaireShell.tsx
 117  src/lib/composer.ts
+107  src/components/anchor/AnchorSearch.tsx        (new)
+103  src/app/api/venue-search/route.ts             (new)
 91   src/app/api/generate/route.ts
```

### Taxonomy-impact concerns (not asked but worth flagging)

- **Occasion taxonomy collapsed** from `dating | relationship | friends | family | solo` (5) to `date_night | friends_family | solo` (3). Per CLAUDE.md: "Slug renames require coordinated updates to the venue sheet, taxonomy config, and any saved itineraries." Reid updated the UI config but not the venue sheet or saved-itinerary backfill. Existing saved itineraries will have `occasion: "dating"` etc. that no longer matches any picker option.
- **Vibe schema changed from `string` to `string[]`** across `QuestionnaireAnswers`, `prompts.ts`, scoring, composer, the migration `20260510_*` for saved itineraries, and the route handlers. Substantial type change.
- **`/api/generate` Gemini prompt** updated to format multi-vibe — input prompt only, not the system prompt, but worth a founder eyeball given the brand-voice sensitivity.

---

## Recommendation

This is no longer a "single PR review." It's a product expansion that legitimately broadens the funnel, but it lands with three structural problems:

1. **Two migrations will break `supabase db push`** (date prefix collision) and one has an unwritten RLS policy. Cannot deploy as-is.
2. **One feature is broken in production** (`/api/save-venue` writes through the wrong client and will RLS-deny on every call).
3. **Taxonomy collapse + multi-vibe is a coordinated change** across UI + DB + venue sheet + saved-itinerary backfill, and only the UI + DB sides exist.

Suggest: split into separate PRs by feature theme (anchor flow / saved venues / questionnaire taxonomy + multi-vibe / availability pre-gate), fix the migrations and the RLS bug, then re-review each.
