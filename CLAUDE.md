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
GOOGLE_SHEET_ID                  # the venue sheet id — must match EXPECTED_SHEET_ID in code

# Optional enrichment
GOOGLE_PLACES_API_KEY            # used by photo + price-tier backfill scripts
MAPBOX_ACCESS_TOKEN              # static walk maps; itinerary still renders without it
```

Never hardcode these. Never commit `.env.local`. Always use `process.env.*` server-side and `NEXT_PUBLIC_*` only when the value is safe to expose to the client.

**Vercel:** every required env var must also be set in the Vercel project. When the venue sheet ID changes, both `.env.local` AND Vercel must be updated.

---

## Project Structure

```
src/
├── app/
│   ├── page.tsx                          # Root gate: AuthScreen → /onboarding → HomeScreen
│   ├── compose/page.tsx                  # Questionnaire flow
│   ├── itinerary/page.tsx                # Composition output
│   ├── itinerary/saved/[id]/page.tsx     # Saved itinerary view
│   ├── itinerary/share/[id]/page.tsx     # Public shared itinerary view
│   ├── onboarding/page.tsx               # Profile builder (3 steps: name → context → prefs)
│   ├── profile/page.tsx                  # Profile + saved plans + admin section
│   ├── privacy/page.tsx                  # Privacy policy (public, for Twilio TFV)
│   └── api/
│       ├── generate/route.ts             # POST: weather + scoring + Gemini → itinerary
│       ├── add-stop/route.ts             # POST: extend itinerary
│       ├── swap-stop/route.ts            # POST: replace one stop
│       ├── share/route.ts                # POST: snapshot itinerary into shareable link
│       ├── profile/route.ts              # PATCH: validated profile updates (server-side)
│       ├── health/route.ts               # GET: diagnostic (Supabase + scoring + Gemini)
│       └── admin/
│           ├── sync-venues/route.ts      # POST: re-sync from sheet
│           └── venue/route.ts            # GET: lookup by name (admin)
│
├── components/
│   ├── ui/                               # Header (rightSlot prop), Button, StopCard, etc.
│   ├── auth/                             # AuthScreen (phone-default), ForgotPasswordScreen
│   ├── providers/                        # AuthProvider
│   ├── shared/                           # NeighborhoodPicker (used by questionnaire + profile)
│   ├── home/                             # HomeScreen
│   ├── onboarding/                       # OnboardingFlow (3 steps; hood step commented out)
│   ├── questionnaire/                    # Shell + step components
│   └── itinerary/                        # CompositionHeader, ItineraryView, ActionBar, etc.
│
├── lib/
│   ├── supabase.ts                       # Anon + service-role Supabase clients
│   ├── supabase/browser.ts               # Browser auth-aware client
│   ├── supabase/server.ts                # Server auth-aware client
│   ├── auth.ts                           # signIn/signUp/upsertProfile (validates payload)
│   ├── scoring.ts                        # Weighted scoring + cascade relaxation
│   ├── composer.ts                       # planStopMix + composeItinerary
│   ├── claude.ts                         # Gemini call with graceful fallback
│   ├── weather.ts                        # OpenWeatherMap
│   ├── geo.ts                            # Haversine + Manhattan grid factor
│   ├── sharing.ts                        # URL param encode/decode
│   ├── booking.ts                        # Booking platform detection
│   ├── profanity.ts                      # validateName + obscenity-based filter
│   ├── validation/profile.ts             # validateProfilePayload (taxonomy check)
│   ├── itinerary/
│   │   ├── seed.ts                       # FNV-1a + Mulberry32 PRNG (deterministic jitter)
│   │   ├── time-blocks.ts                # TimeBlock + blockCoverageFraction + isSlotInBlock
│   │   ├── weighted-pick.ts              # Top-N rank-weighted sampling
│   │   └── availability-enrichment.ts    # Resy availability per stop
│   ├── availability/
│   │   ├── resy.ts                       # POST /4/find client
│   │   └── booking-url.ts                # Resy deep-link URL builders
│   └── venues/images.ts                  # Supabase Storage public URLs
│
├── config/
│   ├── algorithm.ts                      # SINGLE source of truth for weights/thresholds/penalties
│   ├── options.ts                        # Questionnaire step definitions
│   ├── budgets.ts                        # BUDGET_TIERS + label overrides + widenBudgetTiers
│   ├── vibes.ts                          # VIBES + label overrides + ALCOHOL_VIBE_TAGS
│   ├── neighborhoods.ts                  # NEIGHBORHOOD_GROUPS + expand/derive helpers
│   ├── onboarding.ts                     # CONTEXT_OPTIONS + CONTEXT_TO_OCCASION
│   ├── templates.ts                      # Vibe-driven stop pattern templates
│   ├── prompts.ts                        # Gemini system prompt + builder
│   ├── storage.ts                        # sessionStorage keys (page-to-page in-tab only)
│   ├── roles.ts                          # ROLE_LABELS for UI
│   └── generated/*.ts                    # Auto-generated from Google Sheet (DO NOT EDIT)
│
└── types/index.ts                        # Shared types (Venue, ItineraryResponse, etc.)

scripts/                                  # Python: sheet sync, backfills, snapshots
supabase/migrations/                      # Schema migrations (numbered by date)
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
- **Neighborhoods** — 25 user-facing groups (Manhattan: 15, Brooklyn: 7, Queens: 2, Bronx/SI: 1) maintained as constants in `scripts/generate-configs.py`. Groups with `venueCount < ALGORITHM.pools.minGroupVenuesToRender` (50) are hidden from the picker.

Scored vibe tags map to canonical venue tags (see `VIBE_VENUE_TAGS` in the generated `vibes.ts`).

### Neighborhood Slugs

Always snake_case. The taxonomy is now 25 user-facing groups, each expanding to 1+ storage slugs. The questionnaire picker shows groups; expansion to storage slugs happens in `QuestionnaireShell.handleNeighborhoodContinue` via `expandNeighborhoodGroup()`. The reverse — slugs → group labels for display in headers — happens via `deriveGroupIds()` in `CompositionHeader`.

### Auth Tables (20260415 migration)

Both have RLS on with `auth.uid()`-scoped policies. The anon client can only see the signed-in user's own rows.

```sql
composer_users (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  context text,
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
| Budget | 15 | Tiebreaker — budget is also a hard filter |
| Neighborhood | 10 | Binary in-neighborhood check |
| Time relevance | 0–10 | `blockCoverageFraction()` × 10. 1.0/0.5/0.0 based on per-day + global block coverage |
| Quality | 0–10 | `(quality_score / 10) × 10` |
| Curation boost | variable | `curation_boost × 5` (per-venue multiplier) |
| Google rating | 0–5 | `max(0, (rating - 3.5) / 1.5) × 5`. Below 3.5 = 0. |
| Category duplicate penalty | -20 | Applied when candidate's category is already used in the itinerary |

### Determinism

Jitter (`random() * jitter` per venue) is seeded via FNV-1a hash of request inputs. See `src/lib/itinerary/seed.ts`. Same inputs → same seed → identical picks. Different `excludeVenueIds` produce different seeds, so "regenerate" gives variety while direct shareable links stay reproducible.

### Hard Filters (Pre-Scoring)

Applied in this order in `route.ts` and `scoring.ts`:
1. `active = true` (SQL)
2. Exclude IDs (graceful trim — drops oldest IDs to keep pool ≥ `minPoolSize`)
3. Drinks = "no" → drop alcohol vibe venues
4. Time block coverage (`venueOpenForBlock` hybrid per-day/global rule)
5. Closed status (`business_status NOT IN ('CLOSED_PERMANENTLY', 'CLOSED_TEMPORARILY')`)
6. Budget tier — hard filter with widening (±1 tier if pool < `minBudgetWideningThreshold` = 30). Null `price_tier` treated as tier 2.
7. Neighborhood (in `pickBestForRole`, relaxes when zero candidates)
8. Outdoor + bad weather → drop

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

1. **Occasion** — `dating` | `relationship` | `friends` | `family` | `solo`
   Display labels: Dating, Relationship, Friends Night Out, Family, Solo
2. **Neighborhoods** — pick up to 3 from borough-grouped picker (25 groups; thin groups <50 venues are hidden)
3. **Budget** — `casual` | `nice_out` | `splurge` | `all_out` | `no_preference`
   Display labels: Casual, Solid, Splurge, All Out, No Preference
4. **Vibe** — `food_forward` | `drinks_led` | `activity_food` | `walk_explore` | `mix_it_up`
   Display labels: Meal, Drinks, Activity, Stroll, Variety
5. **When** — day (7-day pills + custom date picker) + time block (morning / afternoon / evening / late_night)

No auto-advance — every step requires an explicit button tap. Occasion pre-fills from `profile.context` via `CONTEXT_TO_OCCASION`. **Neighborhood prefill from `profile.favorite_hoods` no longer applies** — that data is no longer collected (see Onboarding Flow below).

**Display labels are decoupled from slugs.** The slug values (`relationship`, `splurge`, `food_forward`, etc.) are stable; only the display strings change. Slug renames require coordinated updates to the venue sheet, taxonomy config, and any saved itineraries.

## Onboarding Flow

Three steps, defined in `src/components/onboarding/OnboardingFlow.tsx`:

1. **Name** — required, validated via `validateName` (≥2 chars, no profanity via the `obscenity` package)
2. **Context** — multi-select from `CONTEXT_OPTIONS`, stored as `text[]` on `composer_users.context`
3. **Preferences** — drinks (yes/sometimes/no) + dietary (`none` | `vegetarian` | `vegan` | `halal` | `kosher` | `gluten-free`)

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

**Never run `git commit`, `git push`, or `git add`.** When a task is complete, provide the suggested commit message in the format above and stop. The developer runs all git commands manually.

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

### Updating Venue Data — Two Modes

**Current sheet ID:** `1EdJqvFKaGAAo5oKMXBXeXfZdzfdT9IsmLiQYA9whXVg` (referenced in `.env.local`, both Sheets API scripts, the admin sync route, and Vercel env vars).

#### Mode A: Incremental upsert (small edits)

For typical edits — add a few venues, fix some fields, mark a venue inactive — use the upsert flow:

```bash
# Generate the SQL
python3 scripts/import_venues_v2.py --out /tmp/import_v2.sql

# Apply it via psql or the Supabase dashboard SQL editor
psql "$DATABASE_URL" < /tmp/import_v2.sql
```

The importer is **upsert-only via `venue_id` conflict**: existing rows update, new rows insert, **nothing deletes**. Set `active = false` in the sheet to hide a venue. `image_keys` is excluded from `ALL_COLUMNS` so it survives upserts untouched.

#### Mode B: Wipe-and-replace (when sheet diverges materially)

When the sheet has diverged enough that orphan DB rows accumulate (e.g., venues removed from the sheet still active in DB), do a full reset:

```bash
# 1. Snapshot image_keys (photos are not in the sheet)
python3 scripts/snapshot_image_keys.py
# Note the output filename — Step 4 needs it.

# 2. TRUNCATE composer_venues_v2 (Supabase SQL editor)

# 3. Re-import everything from the new sheet
python3 scripts/import_venues_v2.py --out /tmp/import_v2.sql
# Apply via psql

# 4. Restore image_keys from the snapshot
python3 scripts/restore_image_keys.py docs/debug/image_keys_snapshot_<timestamp>.csv
```

**Critical:** snapshot/restore uses `google_place_id` as the join key, **not** `venue_id`. `venue_id` is regenerated by the importer; `google_place_id` is the stable canonical identifier.

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

---

## What NOT To Do

- Don't call anon Supabase (`lib/supabase.ts`) from client components. For user-scoped data use `getBrowserSupabase()`.
- Don't write to `composer_users` directly from the browser. RLS now blocks it — go through `PATCH /api/profile`.
- Don't sprinkle scoring magic numbers across files. Every weight/threshold/penalty lives in `src/config/algorithm.ts`.
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
- Don't run `git commit`, `git push`, or `git add`. Provide the commit message and let the developer run it.

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
