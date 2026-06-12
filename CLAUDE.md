# CLAUDE.md — Composer

## Project Overview

Composer is a date and night-out itinerary generator for NYC. Users answer a short cascading questionnaire (occasion → neighborhoods → budget → vibe → when) and receive a curated 2-4 stop evening itinerary structured as **Opener → Main → Closer**.

The product is built on a **hybrid curation model**: the venue database is human-curated by the founders (Reid and Adit), scored and assembled by a weighted, deterministic algorithm, and polished by the Gemini API for copy voice. The human taste layer is the core differentiator — this is not a generic AI recommendation engine.

For algorithm details see [ALGORITHM.md](ALGORITHM.md). For tunable constants see `src/config/algorithm.ts`.

**Primary target: Mobile-responsive web.** Website first at onpalate.com/composer. iOS via Capacitor is Phase 2. Every UI decision should work on a phone screen first.

**Auth: Supabase phone OTP (SMS via Twilio), with email/password as alternative.** Default `AuthScreen` flow is phone entry → 6-digit SMS code → verify. Users can switch to email login. First-time users (no `composer_users` row) are routed to `/onboarding`; returning users land on home. No OAuth providers. Profile and saved itineraries live in Supabase tables with RLS (`composer_users`, `composer_saved_itineraries`, `composer_shared_itineraries`). The one exception to "no client persistence" is the page-to-page sessionStorage bridge between `/compose` and `/itinerary` — that's in-tab flight state, not user state.

**Profile writes go through `PATCH /api/profile`.** Direct browser UPDATEs to `composer_users` are blocked by RLS (only the SELECT and INSERT policies remain). Per-field profile edits (`useFieldEditor.save`) call the API route, which validates server-side via `validateProfilePayload` and writes via the service-role client. Onboarding signup still does a direct INSERT via `upsertProfile` — that's allowed by the INSERT policy.

---

## Tech Stack

- **Framework**: Next.js 16 (App Router, Turbopack) + TypeScript (strict)
- **UI**: React 19, Tailwind CSS 4, Motion
- **Database**: Supabase (PostgreSQL + Row Level Security)
- **AI**: Google Gemini 2.5 Flash (`gemini-2.5-flash`) — itinerary copy and voice
- **Weather**: OpenWeatherMap API — called per generation, not cached
- **Reservations**: Resy availability API (POST /4/find) for slot lookup + booking deep-links
- **Validation**: `obscenity` package for name profanity filtering
- **Package Manager**: npm
- **Deployment**: Vercel
- **Mobile (Phase 2)**: Capacitor → iOS

---

## Environment Variables

```
# Required
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY        # server-only, used by /api/profile and admin scripts
GEMINI_API_KEY
OPENWEATHERMAP_API_KEY

# Sheet sync (admin-only routes + scripts)
GOOGLE_SHEETS_CLIENT_EMAIL
GOOGLE_SHEETS_PRIVATE_KEY
GOOGLE_SHEET_ID                  # the venue sheet id (no hardcoded constant — operator validates identity via the import preview)

# Optional enrichment
GOOGLE_PLACES_API_KEY            # used by photo + price-tier backfill scripts

# Mapbox — two-token model. They are not interchangeable.
NEXT_PUBLIC_MAPBOX_TOKEN         # CLIENT-side: interactive Mapbox GL map + Static Image URLs.
                                 # URL-restricted in the Mapbox dashboard to onpalate.com / Vercel previews / localhost
                                 # (browser sends a matching Referer, so the restriction is fine).
MAPBOX_SERVER_TOKEN              # SERVER-side ONLY: Directions API in src/lib/walking-routes.ts.
                                 # NO URL restrictions. Server-side fetches don't send a matching Referer,
                                 # so the public token would silently 403 here. Never expose this token to
                                 # the client and never cross-fallback to NEXT_PUBLIC_MAPBOX_TOKEN.
```

Never hardcode these. Never commit `.env.local`. Always use `process.env.*` server-side and `NEXT_PUBLIC_*` only when the value is safe to expose to the client.

**Vercel:** every required env var must also be set in the Vercel project. When the venue sheet ID changes, both `.env.local` AND Vercel must be updated.

---

## Project Structure

```
src/
├── app/
│   ├── layout.tsx                        # Root layout + AuthProvider
│   ├── page.tsx                          # Root gate: AuthScreen → /onboarding → HomeScreen
│   ├── globals.css                       # Tailwind 4 @theme tokens + crown utility shims
│   ├── compose/page.tsx                  # Questionnaire flow
│   ├── itinerary/page.tsx                # Fresh composition output
│   ├── itinerary/saved/[id]/page.tsx     # Saved itinerary view
│   ├── itinerary/share/[id]/page.tsx     # Public shared itinerary view (snapshot)
│   ├── onboarding/page.tsx               # Profile builder (2 steps: name → prefs)
│   ├── profile/page.tsx                  # Profile + saved plans + admin section
│   ├── profile/_components/              # Profile-page-private widgets (saved list, field editor, sync panels)
│   ├── auth/callback/                    # Supabase OAuth/OTP callback (legacy + email confirm)
│   ├── auth/reset/page.tsx               # Password-reset landing
│   ├── admin/onboarding/page.tsx         # Admin-only onboarding inspector
│   └── api/
│       ├── generate/route.ts             # POST: weather + scoring + Gemini → itinerary
│       ├── add-stop/route.ts             # POST: extend itinerary
│       ├── swap-stop/route.ts            # POST: replace one stop
│       ├── daily-pick/route.ts           # POST: today's seeded pick (cache-once-per-day per user)
│       ├── share/route.ts                # POST: snapshot itinerary into shareable link
│       ├── itineraries/[id]/route.ts     # PATCH: rename saved itinerary (custom_name)
│       ├── profile/route.ts              # PATCH: validated profile updates (server-side)
│       ├── analytics/track/route.ts      # POST: server-side mirror write (Supabase)
│       ├── availability/[venueId]/route.ts # GET: ad-hoc Resy availability lookup
│       ├── health/route.ts               # GET: diagnostic (Supabase + scoring + Gemini)
│       └── admin/
│           ├── sync-venues/route.ts      # POST: re-sync from sheet
│           └── venue/route.ts            # GET: lookup by name (admin)
│
├── components/
│   ├── Header.tsx                        # Shared page header (variant: default | crown)
│   ├── ui/                               # Button, StopCard, DatePicker, WalkConnector, OptionCard, ProgressBar, FeedbackButton
│   ├── auth/                             # AuthScreen (phone-default), ForgotPasswordScreen
│   ├── providers/                        # AuthProvider
│   ├── shared/                           # NeighborhoodPicker, SavedPlanRow, SavedPlanRowExpanded
│   ├── home/                             # HomeScreen, LuckyDieButton, LuckyOverlay, TonightsPickCard
│   ├── onboarding/                       # OnboardingFlow (2 steps; context step removed 2026-05-20)
│   ├── questionnaire/                    # QuestionnaireShell, StandardStep, NeighborhoodStep, WhenStep, StepLoading, CitySwitcher
│   ├── itinerary/                        # ActionBar, ComposeFailureBlock, CompositionHeader, ConfirmModal,
│   │                                     # EngagementProvider, ItineraryMap(+Inner), ItineraryView,
│   │                                     # LooksGoodCTA, LuckyBanner, LuckyCrown, OrderingConflictBanner,
│   │                                     # PastItineraryBanner, SlotChip, StopAvailability, SwapReasonModal
│   └── venue/                            # VenueDetailModal
│
├── hooks/
│   ├── useSavedPlans.ts                  # Shared saved-itineraries list (home + profile)
│   ├── useSwapStop.ts                    # Swap orchestration + undo + exclusions ref
│   └── useTonightsPick.ts                # Daily-pick fetch on mount + once-per-day analytics
│
├── lib/
│   ├── supabase.ts                       # Anon + service-role Supabase clients
│   ├── supabase/browser.ts               # Browser auth-aware client
│   ├── supabase/server.ts                # Server auth-aware client
│   ├── auth.ts                           # signIn/signUp/upsertProfile (validates payload)
│   ├── analytics.ts                      # Client wrapper (typed track + identify + mirror)
│   ├── analytics-server.ts               # Server wrapper (trackServer + mirror)
│   ├── analytics/events.ts               # Canonical EventSchemas (single source of truth)
│   ├── analytics/compose-abandoned.ts    # In-tab compose-abandon flag (sessionStorage)
│   ├── analytics/signup-source.ts        # signup_at / signup_source $set_once helpers
│   ├── posthog-server.ts                 # posthog-node client (server-only, gated import)
│   ├── scoring.ts                        # Weighted scoring + cascade relaxation
│   ├── composer.ts                       # planStopMix + composeItinerary
│   ├── claude.ts                         # Gemini call with graceful fallback
│   ├── weather.ts                        # OpenWeatherMap
│   ├── geo.ts                            # Haversine + Manhattan grid factor + maps URL
│   ├── walking-routes.ts                 # Mapbox Directions cache + polyline encode
│   ├── mapbox.ts                         # Mapbox static-map URL builder
│   ├── google-places.ts                  # Photo enrichment client (admin scripts)
│   ├── sharing.ts                        # Legacy URL-param share-link DECODER (today's share is a snapshot)
│   ├── booking.ts                        # Booking platform detection
│   ├── profanity.ts                      # validateName + obscenity-based filter
│   ├── exclusions.ts                     # Recent-venue exclusion fetch (anti-stale-pick)
│   ├── calendar.ts                       # ICS export for the Looks Good modal
│   ├── dateUtils.ts                      # isPastDate + splitPlansByDate
│   ├── styles.ts                         # Shared pillClass builder
│   ├── lucky.ts                          # Pure rolls (rollLuckyInputs, nextEligibleStartTime)
│   ├── lucky-runner.ts                   # Retry orchestration around /api/generate
│   ├── questionnaireReducer.ts           # Questionnaire-shell reducer
│   ├── format/category.ts                # Display formatting for category strings
│   ├── format/stop-eyebrow.ts            # Position-aware stop label (Start here / Main / Last call)
│   ├── validation/profile.ts             # validateProfilePayload (taxonomy check)
│   ├── itinerary/
│   │   ├── seed.ts                       # FNV-1a + Mulberry32 PRNG (deterministic jitter)
│   │   ├── time-blocks.ts                # TimeWindow + resolve/format + isSlotInWindow
│   │   ├── weighted-pick.ts              # Top-N rank-weighted sampling
│   │   ├── availability-enrichment.ts    # Resy availability per stop
│   │   ├── pre-filter.ts                 # Shared hard-filter stack for generate/swap/add
│   │   ├── compose-failure.ts            # Client-safe failure copy registry + types
│   │   ├── compose-failure-server.ts     # Server response helpers (posthog-node kept off client)
│   │   ├── is-lucky.ts                   # Canonical isLuckyItinerary(inputs) predicate
│   │   ├── save.ts                       # composer_saved_itineraries INSERT helper
│   │   ├── saved-hydration.ts            # Row → ItineraryResponse for saved-page revisits
│   │   └── swap-reason.ts                # Swap reason analytics payload builder
│   ├── availability/
│   │   ├── resy.ts                       # POST /4/find client
│   │   ├── opentable.ts                  # OpenTable URL pre-fill helpers
│   │   ├── booking-url.ts                # Resy slot-specific deep-link builder
│   │   └── index.ts                      # Re-exports
│   └── venues/
│       ├── fetch-active.ts               # Canonical paginated active-venue read
│       ├── images.ts                     # Supabase Storage public URLs
│       ├── import.ts                     # Sheet → DB pipeline (admin UI + CLI)
│       ├── apply.ts                      # composer_apply_venue_import RPC client
│       ├── diff.ts                       # Diff builder for import preview
│       ├── assertions.ts                 # Sanity assertions (counts, taxonomy presence)
│       ├── sheet.ts                      # Google Sheets reader
│       ├── transform.ts                  # Sheet rows → venue shape
│       ├── columns.ts                    # Sheet column metadata
│       ├── config.ts                     # Shared importer config
│       ├── audit.ts                      # composer_import_runs writer
│       └── types.ts                      # Importer-local types
│
├── config/
│   ├── algorithm.ts                      # SINGLE source of truth for weights/thresholds/penalties
│   ├── options.ts                        # Questionnaire step definitions
│   ├── budgets.ts                        # BUDGET_TIERS + label overrides
│   ├── vibes.ts                          # VIBES + label overrides + ALCOHOL_VIBE_TAGS
│   ├── neighborhoods.ts                  # expand/derive helpers (groups baked into generated/)
│   ├── occasions.ts                      # OCCASION_BUCKET taxonomy + legacy slug map
│   ├── onboarding.ts                     # Onboarding step copy (context step deprecated 2026-05-20)
│   ├── templates.ts                      # Vibe-driven stop pattern templates
│   ├── prompts.ts                        # Gemini system prompt + builder
│   ├── storage.ts                        # sessionStorage keys (page-to-page in-tab only)
│   ├── roles.ts                          # STOP_ROLES + ROLE_LABELS (display fallback)
│   ├── lucky.ts                          # LUCKY constants (cap times, debounce, attempts)
│   ├── cities.ts                         # Single-city today; placeholder for multi-city expansion
│   ├── group-visibility.ts               # Neighborhood-group visibility predicate
│   └── generated/*.ts                    # Auto-generated from Google Sheet (DO NOT EDIT)
│
└── types/index.ts                        # Shared types (Venue, ItineraryResponse, etc.)

scripts/                                  # Python: sheet sync, backfills, snapshots
supabase/migrations/                      # Schema migrations (numbered by date)
tests/unit/                               # Vitest (no jsdom — source-grep contracts for render code)
```

---

## Database Schema

The active venues table is **`composer_venues_v2`** (the v1 `composer_venues` is deprecated). Full DDL in `supabase/migrations/20260428_composer_venues_v2.sql`.

```sql
composer_venues_v2 (
  id uuid primary key,
  venue_id text unique,                       -- sheet ID, used as upsert conflict key
  name text not null,
  neighborhood text not null,
  category text,
  price_tier int,                             -- 1-4, null treated as 2 in scoring + filter
  vibe_tags text[], occasion_tags text[], stop_roles text[],
  time_blocks text[],
  mon_blocks text[], tue_blocks text[], ... sun_blocks text[],   -- per-day overrides
  duration_hours numeric,
  outdoor_seating text,
  reservation_difficulty int, reservation_url text, maps_url text,
  curation_note text, awards text, curated_by text, signature_order text,
  address text, latitude float not null, longitude float not null,
  active boolean, notes text, hours text, last_verified date, last_updated date,
  happy_hour text, dog_friendly boolean, kid_friendly boolean, wheelchair_accessible boolean,
  google_place_id text, google_rating numeric, google_review_count int,
  google_types text[], google_phone text,
  business_status text,                       -- OPERATIONAL / CLOSED_PERMANENTLY / CLOSED_TEMPORARILY
  reservation_platform text, resy_venue_id int, resy_slug text,
  image_keys text[],                          -- Supabase Storage paths, NOT in sheet
  corner_id text, corner_photo_url text, guide_count int, source_guides text[], all_neighborhoods text[],
  enriched boolean, quality_score int, curation_boost int,
  created_at timestamptz, updated_at timestamptz
)
```

**`image_keys` is DB-only** — never written from the sheet. Populated by `scripts/backfill_venue_photos_v2.py` and preserved across imports via the snapshot/restore scripts.

### Canonical Taxonomy

All taxonomy lists generated from the Google Sheet's Master Reference tab via `npm run generate-configs`. Files in `src/config/generated/` are auto-generated — never edit by hand.

Display labels are overridden in:
- **Vibes** (`src/config/vibes.ts`): `Meal` / `Drinks` / `Activity` / `Stroll` / `Variety`
- **Budgets** (`src/config/budgets.ts`): `Casual` / `Solid` / `Splurge` / `All Out` / `No Preference`
- **Neighborhoods** — 25 user-facing groups (Manhattan: 15, Brooklyn: 7, Queens: 2, Bronx/SI: 1) maintained as constants in `scripts/generate-configs.py`. Groups with `venueCount < ALGORITHM.pools.minGroupVenuesToRender` (live value: **25**) are hidden from the picker. The total-count threshold is slated for replacement by a composability-based gate (mains × OC pairs per tier) — see `docs/archive/neighborhood-coverage-audit-2026-06-10.md`.

- **Baked venue counts go stale.** `npm run generate-configs` must be re-run after any venue import to refresh `venueCount` in `src/config/generated/neighborhoods.ts`. The picker reads this baked value, not a live query.

Scored vibe tags map to canonical venue tags (see `VIBE_VENUE_TAGS` in the generated `vibes.ts`).

### Neighborhood Slugs

Always snake_case. The taxonomy is now 25 user-facing groups, each expanding to 1+ storage slugs. The questionnaire picker shows groups; expansion to storage slugs happens in `QuestionnaireShell.handleNeighborhoodContinue` via `expandNeighborhoodGroup()`. The reverse — slugs → group labels for display in headers — happens via `deriveGroupIds()` in `CompositionHeader`.

### Auth Tables (20260415 migration)

Both have RLS on with `auth.uid()`-scoped policies. The anon client can only see the signed-in user's own rows.

```sql
composer_users (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  context text[] default '{}',          -- DEPRECATED 2026-05-20 (see note below)
  drinks text,
  dietary text[] default '{}',
  favorite_hoods text[] default '{}',
  is_admin boolean not null default false,
  created_at timestamptz
)

composer_saved_itineraries (
  id uuid primary key,
  user_id uuid references composer_users(id) on delete cascade,
  title text, subtitle text,
  occasion text, neighborhoods text[], budget text, vibe text, day text,
  stops jsonb, walking jsonb, weather jsonb,
  created_at timestamptz
)
```

Admin access is granted by setting `is_admin = true` on the `composer_users` row directly in Supabase — never via the app. One-liner:

```sql
update composer_users set is_admin = true where id = (
  select id from auth.users where email = 'someone@example.com'
);
```

The existing RLS policy (`auth.uid() = id`) means each session can only read its own profile row, so admin status isn't leaked between users. `AuthProvider` exposes it as `useAuth().isAdmin`.

**`context` column deprecated 2026-05-20** — onboarding no longer collects "What brings you here?", the profile no longer displays it, and scoring/Gemini never used it. Column retained for potential future use; safe to drop if confirmed unused after 90 days. Cleared via `migrations/data/2026-05-20_clear_onboarding_contexts.sql` (run by hand, not picked up by `supabase db push`).

---

## Architecture Principles

### API Route for Generation
All itinerary generation happens server-side in `app/api/generate/route.ts`. The client POSTs questionnaire answers and receives a complete itinerary. The client never calls Supabase, OpenWeatherMap, or Claude directly.

### Supabase Access Splits by Trust Boundary
- **Anon reads of public data (venues):** `lib/supabase.ts` via `getSupabase()` — no cookie session, fine for Route Handlers that don't need `auth.uid()`.
- **Client-side user-scoped reads/writes (profile, saved itineraries):** `lib/supabase/browser.ts` via `getBrowserSupabase()`. Session lives in cookies so the server can see it.
- **Server-side user-scoped reads:** `lib/supabase/server.ts` via `getServerSupabase()` inside Route Handlers. This is how `/api/generate` resolves the signed-in user's profile for personalization and hard filters.
- RLS enforces row visibility. Components calling `getBrowserSupabase()` is allowed — RLS gates the data, not the import boundary.

### Scoring Logic Lives in `lib/scoring.ts`
The weighted scoring algorithm and itinerary composer are isolated here. Do not inline scoring logic in the API route. If scoring behavior needs to change, it changes in one place.

### Weather is Stateless
`lib/weather.ts` fetches current NYC conditions per request. There is no caching layer. This is intentional — itineraries should reflect actual current conditions.

### Claude as Polish Layer, Not Core Logic
The Claude API call in `lib/claude.ts` is a copy enhancement step, not the core logic. The scoring and venue selection happen first. Claude receives the selected venues and writes the composition header and personalizes curation notes. If the Claude call fails, `lib/claude.ts` falls back gracefully to the raw `curation_note` from the database — the itinerary still renders.

---

## Scoring System

**Single source of truth for all weights/thresholds/penalties: `src/config/algorithm.ts`.** Don't sprinkle magic numbers across `scoring.ts`, `composer.ts`, or `route.ts`.

Vibe match uses **exact canonical tag matching** via set intersection. No substring/fuzzy matching. Scored tags live in `VIBE_VENUE_TAGS` (generated from the sheet).

### Weighted Score Breakdown

All weights from `ALGORITHM.weights` in `src/config/algorithm.ts`:

| Component | Weight | Notes |
|---|---|---|
| Vibe match (2+ tags) | 35 | Falls to 25 (1 tag), 10 (0 tags). `mix_it_up` baseline = 25. |
| Occasion | 15 | Binary tag-include check |
| Budget | 15 | Exact-primary-tier bonus (filter is downward-permissive, NO upward widening) |
| Neighborhood | 10 | Binary in-neighborhood check |
| Time relevance | 0–10 | `blockCoverageFraction()` × 10. 1.0/0.5/0.0 based on per-day + global block coverage |
| Quality | 0–10 | `(quality_score / 10) × 10` |
| Curation boost | variable | `curation_boost × 5` (per-venue multiplier) |
| Google rating | 0–5 | `max(0, (rating - 3.5) / 1.5) × 5`. Below 3.5 = 0. |
| Category duplicate penalty | -20 | Applied when candidate's category is already used in the itinerary |

### Determinism

Jitter (`random() * jitter` per venue) is seeded via FNV-1a hash of request inputs. See `src/lib/itinerary/seed.ts`. Same inputs → same seed → identical picks. Different `excludeVenueIds` produce different seeds, so "regenerate" gives variety while direct shareable links stay reproducible.

### Hard Filters (Pre-Scoring)

Identical stack across `/api/generate`, `/api/swap-stop`, `/api/add-stop` — implemented once in `src/lib/itinerary/pre-filter.ts` and consumed by all three. Order chosen so the cheapest cut runs first and so the `zeroingStage` reported on failure is the most user-actionable answer:

1. `active = true` (SQL via `fetchActiveVenues`).
2. **Exclusions** — strict. The recently-rejected list + every current itinerary stop + every plan_b. NO graceful trim. If exclusions empty the pool, ComposeFailure with `zeroingStage: "exclusions"`.
3. **Drinks = "no"** (profile) → drop alcohol-tagged venues.
4. **Hours** — `venueOpenForWindow(v, dayColumn, window)`. Per-day blocks override global via the hybrid rule. Empty → `zeroingStage: "hours"`.
5. **Closed status** — drop `CLOSED_PERMANENTLY` / `CLOSED_TEMPORARILY`. Failure bundled into `"hours"`.
6. **Budget tier** — strict `BUDGET_TIER_MAP` membership. Downward-permissive (`nice_out` admits tier 1 too, `splurge` admits tier 2) but NO upward widening. Null `price_tier` treated as tier 2. The +15 scoring bonus is exact-primary-tier only. Empty → `zeroingStage: "budget"`.
7. **Neighborhood** — strict union membership on the chosen group slugs. NO cascade drop. Empty → `zeroingStage: "neighborhood"`.

Inside `pickBestForRole` (per-role) the role/hint/weather cascade is:
- Strict (role + hint + outdoor-in-bad-weather) → if empty AND a hint was supplied, retry without hint.
- Proximity to anchor (`maxWalkKmNormal = 1.5km` normal, `0.4km` bad weather) applied at each step.
- No `relaxedFilter` step. The previous neighborhood-drop cascade is gone — geography is hard on every endpoint.
- Empty after cascade → ComposeFailure with `zeroingStage: "proximity"` (returned from the route handler, not the composer).

**End-time fit gate** (in `composer.ts`): the user's endTime is a strict constraint on the projected timeline. Candidate Mains whose `startTime + minStop1Dur + minWalk + mainDuration > endTime` are dropped before the Main pick (loose upper bound). After Main is picked, candidate stop-1s whose exact projection `startTime + stop1Dur + walk(stop1, main) + mainDur > endTime` are dropped. Per-venue `duration_hours` overrides the role-average when present. Empty pool at either gate → `zeroingStage: "fit"`. Swap-stop and add-stop call the same projection via the exported `itineraryFits(stops, startTime, endTime)` helper to validate the patched/extended itinerary before returning it — no silent overshoot from a swap or extension, either.

### Composition

`composeItinerary` in `lib/composer.ts` picks per vibe-driven templates (`src/config/templates.ts`). Each template has slots with optional `venueRoleHint` to bias selection (e.g., drinks-led opener prefers `drinks` role). Cascade relaxation: strict (with hint) → drop hint → drop neighborhood. Proximity to Main is always hard-capped (`maxWalkKmNormal` = 1.5km, `maxWalkKmBadWeather` = 0.4km).

After scoring + sort, `pickBestForRole` does a **weighted top-N pick** from the top 5 candidates with weights `[5,4,3,2,1]` — adds variety without sacrificing quality. Falls back to deterministic top-1 when `jitter === 0` (used by `/api/health`).

### Plan B

The composer captures `scored[1]` from each non-Main role's pick run as the Plan B alternative. Same scoring run; not a separate filter.

See [ALGORITHM.md](ALGORITHM.md) for the full architecture map.

---

## Weather Gate

OpenWeatherMap is called in `lib/weather.ts` at generation time. Classification:
- `rain` or `snow` → eliminate `outdoor_seating = true` venues
- Extreme temp (< 32°F or > 90°F) → same penalty as rain
- Clear → no adjustment

Surface a weather note in the composition header only when conditions affected the output. Don't show weather info if it didn't matter.

---

## Questionnaire Flow

Defined in `config/options.ts`. Five steps, each with an explicit "Next →" button:

1. **Occasion** (3 buckets) — `date` | `friends` | `solo`
   Display labels: Date, Friends, Solo. Sheet-side slugs (`dating`, `relationship`, `family`, `couple`, `first_date`, …) collapse into the 3 buckets at scoring time via `OCCASION_BUCKET_TO_SHEET_SLUGS`; legacy save links still translate via `DEPRECATED_OCCASION_SLUG_TO_BUCKET` in `src/config/occasions.ts`.
2. **Neighborhoods** — pick up to 3 from borough-grouped picker (25 groups; thin groups under `ALGORITHM.pools.minGroupVenuesToRender` are hidden)
3. **Budget** (3 buckets) — `casual` | `nice_out` | `splurge`
   Display labels: Casual, Solid, Splurge. Wider DB-side `Budget` type retains `all_out` / `no_preference` for legacy save reads; the questionnaire's `ComposeBudget` is narrowed to the three above (`src/types/index.ts`).
4. **Vibe** (3 vibes) — `food_forward` | `drinks_led` | `activity_food`
   Display labels: Meal, Drinks, Activity. `mix_it_up` (Variety) was dropped from the questionnaire in Phase 7; the slug is still accepted in saved itineraries and scoring falls through to the empty-tag baseline (`vibeMixItUpBaseline`).
5. **When** — day (7-day pills + themed custom calendar on desktop / native OS picker on touch via pointer-modality split) + start-time pill (17:00 / 18:00 / 19:00 / 20:00 / 21:00). The server derives `endTime = startTime + 5h` (wrapping past midnight). The categorical TimeBlock type is internal venue-side metadata — it never appears on `QuestionnaireAnswers`.

No auto-advance — every step requires an explicit button tap. **Occasion no longer auto-prefills** — the `CONTEXT_TO_OCCASION` map was removed 2026-05-20 with the onboarding context step. **Neighborhood prefill from `profile.favorite_hoods` no longer applies** — that data is no longer collected (see Onboarding Flow below).

**Display labels are decoupled from slugs.** The slug values are stable; only the display strings change. Slug renames require coordinated updates to the venue sheet, taxonomy config, and any saved itineraries.

## Onboarding Flow

Two steps, defined in `src/components/onboarding/OnboardingFlow.tsx`:

1. **Name** — required, validated via `validateName` (≥2 chars, no profanity via the `obscenity` package)
2. **Preferences** — drinks (yes/sometimes/no) + dietary (`none` | `vegetarian` | `vegan` | `halal` | `kosher` | `gluten-free`)

**Context step removed 2026-05-20.** The "What brings you here?" multi-select was dropped because the data wasn't used for scoring or Gemini prompts — only fed a single-context occasion prefill on `/compose`, which itself was removed in the same change. The `composer_users.context` column is retained but no longer written; clear historical values via `migrations/data/2026-05-20_clear_onboarding_contexts.sql`. Safe to drop the column after 90 days if no future use materializes.

The neighborhood-favorites step is **commented out, not deleted** — see `OnboardingFlow.tsx` for the doc block explaining why and how to restore. Existing users with populated `favorite_hoods` retain the data; it's just not collected for new users and no longer drives prefill.

Validation:
- Client-side inline errors on name (blur + submit)
- Server-side via `validateProfilePayload` in `upsertProfile` (lib/auth.ts) — throws on invalid taxonomy values

---

## Gemini API

Model: `gemini-2.5-flash`
Max tokens: 1000

System prompt (from `config/prompts.ts`):
```
You are the voice of Composer, a curated NYC date night app founded by two people 
known for their taste in the city. Write in a warm, confident, first-person plural 
voice. You are opinionated. Say "this is the move" not "you might enjoy." 
Keep all copy concise. Never hedge. Never list more than you need to.
```

**Do not change the system prompt without discussing with the founders.** Brand voice is intentional.

The Gemini call always has a graceful fallback. If it throws or times out, use the raw `curation_note` from the DB. Never block itinerary rendering on a Gemini API failure. (Note: the implementation still lives in `lib/claude.ts` — that's the filename only, not the underlying API.)

---

## Design System

### Typography
- **Display / venue names / titles**: Playfair Display (serif, Google Fonts)
- **UI / body / labels**: DM Sans (sans-serif, Google Fonts)

### Colors
```
Background:         #FAF8F5  (warm off-white)
Primary accent:     #6B1E2E  (deep burgundy)
Secondary accent:   #1E3D2F  (forest green)
Text primary:       #1A1A1A
Text secondary:     #6B6B6B
```

Never use generic purple gradients, white backgrounds, or Inter/Roboto. The aesthetic is editorial and warm, not startup.

### Principles
- Mobile-first always
- No decorative gradients
- Staggered entrance on composition output (Opener → Main → Closer sequential reveal)
- Loading states feel intentional — never a bare spinner
- Touch targets minimum 44x44px

### Disabled state — one canonical treatment

Every button-shaped affordance in the app uses the SAME disabled treatment so users learn it once:

- **Visual:** `opacity-40` on the filled element (`disabled:opacity-40` on the Button primitive).
- **Pointer:** `cursor-not-allowed` + `pointer-events-none` (also on the primitive).
- **Color does NOT change.** No swap to grey/muted/burgundy-tint backgrounds — that's how `disabled:bg-muted` and similar one-offs creep in and split the visual language.

The `<Button>` primitive in `src/components/ui/Button.tsx` ships this for every variant + size. Build new affordances through it. If a callsite needs a custom shape (rare), copy the three classes exactly: `disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40`. Don't invent a fourth disabled treatment.

The audit's call-out: SwapReasonModal Submit used to hand-roll `disabled:bg-muted disabled:cursor-not-allowed`. That's gone — it routes through `<Button>` now, and so should every future modal-footer Submit / inline form button.

### Loading + status semantics

Every async surface (page-level loaders, post-action confirmations, form-fetch spinners, dynamic count changes) ships `role="status"` + `aria-live="polite"`. The visible text content is the accessible name — no separate `aria-label` needed if the rendered copy already describes what's happening. The pattern lives in `src/components/home/LuckyOverlay.tsx` and `src/components/itinerary/StopAvailability.tsx`; mirror it.

For toasts: don't. There is no Toast / Snackbar primitive in the app — the audit removed it in 2026-06-12. Surface outcomes IN CONTEXT next to the triggering control: save errors render above the sticky CTA in `LooksGoodCTA`; swap success renders as the "Swapped · Undo" line on the swapped StopCard. New ephemeral feedback follows the same rule.

### Lucky itineraries — layer, not fork

Itineraries from the dice roll (`inputs.mode === "lucky"`) get a distinct visual treatment as a **layer** on the standard render. Two layer touches today:

**Above the seam — the inverted crown.** `LuckyCrown` wraps the page header, composition header, and dice banner in a deep-burgundy field. Three component variants:

- `Header variant="crown"` — the lockup flips to cream via `brightness-0 invert`, and the focus ring uses the `crown-ring` token (the burgundy/50 ring is invisible on the dark field).
- `CompositionHeader variant="crown"` — text colors switch to the `crown-text` / `crown-text-muted` tokens (both tuned to pass 4.5:1 on `crown-field`). The title die also tones to cream.
- `LuckyBanner variant="crown"` — chip-on-field treatment using `crown-chip` + `crown-chip-border`.

**Below the seam — wavy connectors only.** Everything in `ItineraryView` renders identically to a standard itinerary EXCEPT the `WalkConnector`, which switches to `variant="wavy"` — a hand-drawn-style burgundy SVG flank, decorative only. The map's route polyline is real data and stays untouched.

The gate is the canonical predicate `isLuckyItinerary(inputs)` in `src/lib/itinerary/is-lucky.ts`. Daily picks (`mode === "daily"`) are NOT lucky — they render standard.

**Color tokens** for the crown live next to the brand tokens in `src/app/globals.css` under the `--color-crown-*` group: `crown-field`, `crown-chip`, `crown-chip-border`, `crown-text`, `crown-text-muted`, `crown-ring`. The file also ships explicit `.bg-crown-field` / `.text-crown-*` class rules alongside the Tailwind `@theme` block — Turbopack's dev cache sometimes doesn't pick up new `@theme` tokens without a server restart, and the explicit rules guarantee the styles apply either way. Don't reach for raw hexes anywhere in the crown scope — always the token.

**Rules for future contributors:**
- Don't fork rendering paths on mode globally. Crown variants are **explicit props** on shared components (`Header`, `CompositionHeader`, `LuckyBanner`), never a style override that leaks into home, questionnaire, or standard itineraries.
- Don't inline `inputs?.mode === "lucky"` checks. Always go through `isLuckyItinerary()` so the gate is grep-able when a new mode lands.
- Below the seam: keep the lucky-layer touches minimal and decorative (wavy connectors only today). New below-seam touches require an explicit prop on the affected component gated through `isLuckyItinerary()`.
- New lucky touches MUST be reversible: removing the `isLuckyItinerary(...)` calls in the consumer pages restores the standard render byte-for-byte.

---

## Coding Standards

### Architecture Principles
- **Single source of truth** — shared constants, labels, ranges, and taxonomies live in ONE canonical module and are imported everywhere. No duplicate string literals across files.
- **Display formatting lives with the data** — labels, short/long ranges, and formatters live in the canonical module, not in components.
- **Refactor existing duplication in the same commit** — if you find duplication while implementing a feature, fix it.
- **Audit before adding** — grep for related concepts before adding new constants, types, or components.

### Canonical Modules
- `src/config/algorithm.ts` — every weight, threshold, penalty, and jitter magnitude. Single source of truth for all algorithm tuning.
- `src/lib/itinerary/time-blocks.ts` — TimeBlock type, block metadata, `isSlotInBlock()`, `resolveTimeWindow()`, `formatBlockChipLabel()`, `blockCoverageFraction()`, `dateToDayColumn()`
- `src/lib/itinerary/seed.ts` — `computeRequestSeed()` + `createSeededRandom()` (FNV-1a + Mulberry32)
- `src/lib/profanity.ts` — `validateName()` + `containsProfanity()` (uses `obscenity` package)
- `src/lib/validation/profile.ts` — `validateProfilePayload()` (taxonomy whitelist check)
- `src/config/generated/*.ts` — auto-generated from Google Sheet (DO NOT EDIT)

### TypeScript
- Strict mode on. No `any` types. No `ts-ignore`.
- Define types in `types/` for shared data shapes. Inline types for local-only shapes.
- All API route handlers must type their request body and response.
- Supabase query results must be typed — use generated types or explicit casting, never implicit `any`.

### React / Next.js
- App Router only. No Pages Router patterns.
- Server Components by default. Add `"use client"` only when necessary (interactivity, hooks, browser APIs).
- No God components. If a file exceeds 250 lines, split it.
- One component per file. File name matches component name in kebab-case (`stop-card.tsx` exports `StopCard`).
- No inline styles. Tailwind only. If a custom value is needed more than once, extract to a CSS variable.

### Data Fetching
- Server Components fetch directly for public data. Route Handlers use `getServerSupabase()` for auth-scoped reads.
- Client-side state is minimal — questionnaire answers in `useState`, itinerary result passed via URL params or sessionStorage (page-to-page in-tab bridge only).
- Client components that need the current user read from `useAuth()` rather than fetching auth state themselves.
- `useEffect` for data fetching is acceptable for user-scoped client-side reads (e.g. HomeScreen's saved plans list) since those fire only on mount and need the session cookie.

### Error Handling
- All API routes return typed error responses with appropriate HTTP status codes.
- Client components handle error states visibly — never silently swallow errors.
- The Claude fallback in `lib/claude.ts` must be tested — do not remove it.

### File Naming
- Components: `PascalCase.tsx`
- Utilities / libs: `camelCase.ts`
- Config files: `camelCase.ts`
- All exported functions and components use named exports. No default exports except Next.js page files.

### Imports
Order: React → Next.js → third-party → internal (`@/lib`, `@/components`, `@/config`, `@/types`)

### Git Commits
Format: `type(scope): description`
Types: `feat`, `fix`, `chore`, `refactor`, `style`, `docs`

**Keep commit messages concise — one line only.** No multi-line bodies, no bullet lists, no co-author trailers. The git history should stay scannable. If a change is so large it can't be summarized in one line, that's a signal to split it into multiple commits.

Examples:
```
feat(scoring): add progressive filter relaxation for thin neighborhoods
fix(weather): handle OpenWeatherMap timeout gracefully
chore(venues): add 12 new West Village venues to seed
```

**You ALWAYS draft commit messages; the developer ALWAYS runs git.** These are two separate behaviors — drafting is required, executing is forbidden.

**Drafting rules (required behavior):**
- When a task is ready to commit, output a `type(scope): description` message in a code block in the response itself — not buried in an exported doc.
- If the work spans unrelated concerns, split into multiple drafted commits, each with its own one-line message and a brief note about which files belong in which commit.
- Draft even when the user says "don't commit yet," "I'll commit later," or similar. Drafting is informational; the gate is on execution, not proposal.

**Execution rules (forbidden behavior):**
- Never run `git add`, `git commit`, `git push`, `git stash`, `git reset`, `git checkout -b`, `git remote set-url`, or any other write operation that mutates repo state.
- Inspection-only commands are fine: `git status`, `git diff`, `git log`, `git remote -v`, `git branch`.
- If the user says "commit it" / "run the commit" / "push it" in conversation, treat it as them narrating their next action. Re-state the drafted message and remind them you don't run git — do not execute.

---

## Performance Rules

- No animations that block interaction or feel slow on a mid-range Android device
- Google Maps export URL is constructed client-side in `lib/geo.ts` — no API call needed
- OpenWeatherMap call happens server-side in the API route — never from the client
- Do not add new npm dependencies without justification. Prefer what's already in the project.

---

## Venue Database Rules

- **Never edit venues directly in the DB.** The Google Sheet is the single source of truth. All changes go through the sheet → import pipeline below.
- All taxonomy slugs (neighborhoods, vibes, occasions, budgets, stop roles) use snake_case to match the sheet's dropdown validation.
- `active = false` hides a venue from scoring. Use this instead of deleting records.
- The `notes` column in the Google Sheet is internal only — stored in the DB but not surfaced in the app.

### Updating Venue Data

**Current sheet ID:** lives in `.env.local` and Vercel env vars only. Python scripts read from env via `os.environ.get('GOOGLE_SHEET_ID')`. No hardcoded copies in code.

The canonical importer lives in `src/lib/venues/`. It runs upserts atomically against `composer_venues_v2` via the Postgres function `composer_apply_venue_import`, and records every apply attempt to `composer_import_runs` for audit. Two surfaces, one underlying module:

#### Surface A: Admin UI (`/profile`)

Operator-friendly, browser-based. Click **Check source** → **Run preview** → **Apply N changes**. The UI surfaces sheet identity, sanity assertions, the diff with samples, and a deactivation count tooltip explaining soft-delete semantics. Threshold guards block large diffs and require explicit confirmation. Use this for routine sheet edits.

#### Surface B: CLI (`npm run import-venues`)

Engineer-driven. Same pipeline, more output. Subcommands:

```bash
npm run import-venues -- dry-run                  # diff + assertions, no writes
npm run import-venues -- apply                    # interactive [y/N] prompt
npm run import-venues -- apply --yes              # skip prompt
npm run import-venues -- apply --confirm-large-change
npm run import-venues -- apply --skip-assertions  # typed OVERRIDE confirmation
npm run import-venues -- history [--status … --limit … --since …]
npm run import-venues -- show <id>                # full detail for one run
```

Use this when you want the diff in JSON (`--json`, `--out diff.json`), or when investigating a past run via the audit table.

#### Soft-delete semantics

Both surfaces deactivate orphans (DB rows whose `venue_id` is no longer in the sheet) by setting `active = false`. **Nothing deletes** — image keys, saved itineraries that reference the venue, and other downstream data stay intact. To restore a deactivated venue, add it back to the sheet and re-sync.

#### Wipe-and-replace (rare — only when reseeding from scratch)

The new pipeline doesn't need wipe-and-replace for routine work; orphan deactivation handles drift. The legacy `snapshot_image_keys.py` / `restore_image_keys.py` scripts are preserved as a safety net for the rare case where you actually need to TRUNCATE and reseed (e.g., you migrate to a new schema). If you're reaching for this in normal operation, ask first — the importer's deactivation path is almost certainly what you want instead.

```bash
# Only if you really need to TRUNCATE composer_venues_v2:
python3 scripts/snapshot_image_keys.py             # capture image_keys (not in the sheet)
# … TRUNCATE composer_venues_v2 in the Supabase SQL editor …
npm run import-venues -- apply --yes               # repopulate from the sheet
python3 scripts/restore_image_keys.py docs/debug/image_keys_snapshot_<timestamp>.csv
```

Snapshot/restore uses `google_place_id` as the join key (not `venue_id`) — `google_place_id` is the stable canonical identifier across reseeds.

### Updating Scoring Configs

`generate-configs` reads from the live Google Sheet (Master Reference tab). No xlsx export needed.

```bash
# 1. Edit the appropriate column in the Master Reference tab
# 2. Regenerate
npm run generate-configs

# 3. Verify types
npx tsc --noEmit

# 4. Commit the updated src/config/generated/*.ts files
```

**Neighborhood groups are NOT derived from the sheet.** They live as a constant in `scripts/generate-configs.py` (`NEIGHBORHOOD_GROUPS` list, currently 25 groups). The generator queries Supabase for active venue counts per slug and bakes a `venueCount` field into each group — used by `NeighborhoodPicker` to hide thin groups (< `ALGORITHM.pools.minGroupVenuesToRender`).

#### generate-configs is the vocabulary gate

`scripts/generate-configs.py` does NOT just emit TypeScript — it also enforces vocabulary completeness between the sheet and the implementation. Two hard gates run before any file is written; on failure the script exits nonzero and the generated files are left untouched:

1. **Neighborhood grouping completeness.** Every neighborhood slug in the sheet's Master Reference column A OR in active venue rows must appear in at least one entry of `NEIGHBORHOOD_GROUPS`. Orphan slugs are unreachable from the questionnaire and would silently hide their venues. Error output lists each offender with its observed row count.

2. **stop_roles vocabulary.** Every stop_roles value in the sheet (column F) or in active venue rows must be a key of `STOP_ROLE_EXPANSION` (or one of the canonical `opener` / `main` / `closer` roles, kept as a defensive set). Unknown roles get silently dropped by scoring and the venue becomes invisible to the composer. Error output lists each offender with its observed row count.

A warning-only check also runs and does NOT block: group slugs with zero observed venue rows (currently `queens`, `gramercy_kips_bay`) print as info so the operator notices empty-future-coverage slots without failing the build.

**Vibe tags are intentionally NOT validated.** The vibe vocabulary is open while founders decide which new tags graduate into the scoring matrix. Adding a vibe tag to the sheet does not require a matching entry in `VIBE_SCORING_MATRIX` — the emitter naturally splits scored vs cross-cutting tags.

When adding a new slug to the sheet, the workflow becomes:
- Add the slug in Master Reference (and to any venue rows that need it)
- For a neighborhood slug: also add it to `NEIGHBORHOOD_GROUPS` in `generate-configs.py` (existing UI group or new one)
- For a stop_role: also add it to `STOP_ROLE_EXPANSION` mapping to one or more canonical roles
- Then run `npm run generate-configs`

If you forget step 2 or 3, the script will refuse to regenerate the configs and tell you exactly which slug is unbound.

---

## Analytics

The analytics surface is a single typed schema (`src/lib/analytics/events.ts`) consumed by two thin transports — `src/lib/analytics.ts` (client) and `src/lib/analytics-server.ts` (server). Both narrow `track()` / `trackServer()` on event name via `EventSchemas`, so a typo, a missing field, or a wrong-type payload is a TypeScript error, not a silent drop.

### Wrappers-only rule

Never `import "posthog-js"` or `"posthog-node"` outside the two wrappers, `instrumentation-client.ts`, and `AuthProvider.tsx` (the latter calls `identify` / `reset` only). ESLint enforces this via `no-restricted-imports` (`eslint.config.mjs`). The audit's "47 free-floating literals" pattern recurs when this rule isn't enforced — re-adding direct imports is how that drift starts.

### Naming convention: *_failed vs *_errored

- `*_failed` (HTTP 422): an expected user-input-shape rejection. `compose_failed` fires when no honest itinerary can be produced from the user's picks (budget too narrow, neighborhood + hours empty, etc.). The 422 response carries a typed `ComposeFailure` so the UI surfaces the right title + suggestion. See `respondComposeFailure` in `src/lib/itinerary/compose-failure-server.ts` (the file is split from `compose-failure.ts` — the `.ts` half holds client-safe primitives, the `-server.ts` half holds the response/emission helpers so browser bundles don't drag in `posthog-node`).
- `*_errored` (HTTP 500): an unexpected system failure — a thrown exception in the catch path. `compose_errored` carries `error_name` (a classified, snake_case bucket via `classifyErrorName`), never raw `Error.message` (PII risk). See `respondComposeErrored` in the same `compose-failure-server.ts`.

The two are NOT interchangeable. Mixing them collapses two different funnel states into one.

### Property naming: budget vs price_tier

- `budget` → user-facing bucket: `casual` / `nice_out` / `splurge` / `all_out` / `no_preference` (the questionnaire pick).
- `price_tier` → venue-level integer 1-4 (the database column).
- Never bare `tier` — it's ambiguous.

Neighborhood group identifiers travel as `group_ids` (the keys in `NEIGHBORHOOD_GROUPS`), not as expanded storage slugs.

### Env gate: production only

Both transports gate on Vercel's `VERCEL_ENV === "production"`:
- Client: `NEXT_PUBLIC_VERCEL_ENV` (server-side env var Vercel auto-exposes when "Automatically expose System Environment Variables" is enabled — default ON for new projects, but verify in project settings).
- Server: `VERCEL_ENV` (set by Vercel automatically on every deploy).

Localhost without `vercel dev`, preview branches, and `next dev` all skip the PostHog `init()` and the Supabase mirror insert. This prevents dev / preview traffic from polluting the production project. `/api/analytics/track` carries the same gate at the top of POST.

### Mirror contract

Every product event we capture goes to BOTH PostHog AND the `composer_analytics_events` table (Supabase, service-role insert). PostHog is the queryable funnel; the mirror is the durable audit log + the home for free-text fields that can't reach PostHog.

- PostHog payload: `props` only.
- Mirror payload: `{ ...props, ...mirrorOnlyProps }`. Pass `mirrorOnlyProps` via the `track(event, { props, mirrorOnlyProps })` option-object overload.
- Free-text PII (`swap_reason_submitted.reason_text`) travels mirror-only — the taxonomy slug (`reason`) is the PostHog-safe field; the freeform "other" text rides on `mirrorOnlyProps`.
- Pageviews, identify, and person properties stay PostHog-only by design (they're not product events; the mirror table is for the funnel).

The PII denylist test (`tests/unit/analytics-pii-denylist.test.ts`) asserts that no `EventSchemas` key and no person-property call references `email`, `phone`, or `name` (with `venue_name` allowlisted — it's denormalized public venue data, not user PII).

---

## What NOT To Do

- Don't call anon Supabase (`lib/supabase.ts`) from client components. For user-scoped data use `getBrowserSupabase()`.
- Don't write to `composer_users` directly from the browser. RLS now blocks it — go through `PATCH /api/profile`.
- Don't sprinkle scoring magic numbers across files. Every weight/threshold/penalty lives in `src/config/algorithm.ts`.
- **Don't issue a bare full-table Supabase `select` on a catalog table.** PostgREST silently caps results at 1000 rows, with a non-deterministic dropped subset (no `.order`). Every full-table read MUST use `.range()` pagination with an explicit `.order("id", asc)` AND cross-check the fetched count against `select("*", { count: "exact", head: true })` (mismatch → log, don't throw). Canonical helper: `src/lib/venues/fetch-active.ts::fetchActiveVenues`; canonical paginator pattern: `src/lib/venues/import.ts::fetchAllDbVenues`. This bug truncated 24% of the active catalog from every itinerary generation request through 2026-06-09 — see `docs/archive/runtime-fetch-truncation-diagnostic-2026-06-09.md`.
- Don't add AI-generated venues to the database. Every venue must be human-verified.
- Don't change the vibe tag matching from exact to substring/fuzzy. This was a deliberate fix.
- Don't change the Gemini system prompt without founder approval.
- Don't add loading states that feel like the app is doing more work than it is.
- Don't use `any` types or `ts-ignore`.
- Don't add new neighborhood slugs without updating the venue sheet's Master Reference tab AND `scripts/generate-configs.py NEIGHBORHOOD_GROUPS` (if assigning to a new UI group).
- Don't use `localStorage` for user state. Profile and saved plans live in Supabase. `sessionStorage` is acceptable only for page-to-page in-tab flight state.
- Don't add OAuth providers. Auth is phone OTP (default) with email/password as alternative.
- Don't TRUNCATE `composer_venues_v2` without snapshotting `image_keys` first — the column isn't in the sheet.
- Don't add features that aren't in the PRD without flagging them first. Scope creep kills MVPs.
- Don't assume desktop-first. Mobile is the primary surface.
- Don't run git write operations. Always draft the commit message instead. See "Git Commits" section above for full rules.
- Don't import `posthog-js` or `posthog-node` outside the analytics wrappers + the integration allowlist. Go through `track` / `trackServer` (typed). ESLint enforces this — see "Analytics → Wrappers-only rule".
- Don't pass raw string literals to `track()` / `trackServer()`. Use the `EVENTS.*` constants so renames stay 1:1 across PostHog and the Supabase mirror.
- Don't put free-text PII into a PostHog payload. Route it through `mirrorOnlyProps` so the Supabase mirror captures it and PostHog never sees it. See "Analytics → Mirror contract".
- Don't conflate `*_failed` and `*_errored`. `*_failed` = 422 expected user-shape rejection; `*_errored` = 500 unexpected exception with a classified `error_name`.

---

## Product Context

**Founders:** Adit and Reid
**Platform:** onpalate.com/composer (part of the Palate brand alongside Pour Decisions)
**Launch target:** Columbia Business School community (NYC)
**MVP success metric:** 50 compositions generated in week 1, 200+ by week 4

The product works because of the curation layer, not the technology. Reid and Adit are known in the CBS community as the go-to people for NYC date and dinner recommendations. They host weekly dinner reservations around the city. The app is the productization of that reputation.

When in doubt about a product decision, ask: does this make the output feel more trustworthy and opinionated, or less?

---

## Phase 2 (Not Building Yet)

- Community venue submissions
- Google Places / Resy / OpenTable live sync
- Native reservation booking
- Implicit preference learning
- iOS app via Capacitor
- Monetization (venue partnerships, premium tier)
- MAKE MONEY
