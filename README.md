# Composer

**Compose your night.**

Composer is a curated date night itinerary generator for New York City. Answer six quick questions in under a minute and get a full evening — Opener, Main, Closer — built around your occasion, neighborhood, budget, vibe, and time window. Every recommendation is human-curated, weather-aware, and assembled by AI in the voice of two people who actually know the city.

Live at [composer.onpalate.com](https://composer.onpalate.com).

---

## What it does

A user answers a five-step questionnaire:

1. **Occasion** — Dating, Relationship, Friends Night Out, Family, Solo
2. **Neighborhoods** — pick up to three from borough-grouped options (25 groups; thin groups hidden)
3. **Budget** — Casual, Solid, Splurge, All Out, No Preference
4. **Vibe** — Meal, Drinks, Activity, Stroll, Variety
5. **When** — day + time block (morning / afternoon / evening / late night)

Composer returns a 2-to-4 stop evening, with the count driven by the time window and the chosen vibe's template (see `src/config/templates.ts`):

- **<3h window** → 2 stops (Opener + Main)
- **3–5h window** → 3 stops (Opener + Main + Closer)
- **≥5h window** → up to 4 stops

Each itinerary includes walk times between stops, Resy availability + booking deep-links where available, weather-aware filtering, Plan B alternatives, deterministic reproduction (same inputs → same picks), a Google Maps export, and a shareable link.

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router, Turbopack) + TypeScript (strict) |
| UI | React 19, Tailwind CSS 4, Motion (Framer fork) |
| Database | Supabase (Postgres + Row Level Security) |
| AI | Google Gemini 2.5 Flash via `@google/generative-ai` |
| Weather | OpenWeatherMap (free tier, called per request, not cached) |
| Reservations | Resy availability API (POST /4/find) |
| Validation | `obscenity` for name profanity filtering |
| Auth | Supabase phone OTP via Twilio (default) + email/password (alt) |
| Deployment | Vercel — auto-deploy from `main` |
| Domain | composer.onpalate.com |

---

## Project structure

The codebase is under `src/`. Everything else at the repo root is config, docs, or assets.

```
composer/
├── src/
│   ├── app/
│   │   ├── page.tsx                   # Root gate: AuthScreen → /onboarding → HomeScreen
│   │   ├── compose/page.tsx           # Questionnaire flow
│   │   ├── itinerary/page.tsx         # Composition output
│   │   ├── onboarding/page.tsx        # Post-auth profile builder (auth-gated)
│   │   ├── profile/page.tsx           # Profile + saved itineraries + admin section
│   │   ├── admin/onboarding/page.tsx  # Admin: replay onboarding flow (is_admin gated)
│   │   ├── auth/callback/route.ts     # PKCE code exchange (safety net)
│   │   ├── auth/reset/page.tsx        # Password reset form
│   │   ├── layout.tsx                 # Fonts + AuthProvider
│   │   ├── globals.css
│   │   └── api/
│   │       ├── generate/route.ts      # POST: weather + scoring + Gemini → itinerary
│   │       ├── add-stop/route.ts      # POST: extend itinerary with one more closer
│   │       └── health/route.ts        # GET: diagnostic report (Supabase + scoring + Gemini)
│   ├── components/
│   │   ├── ui/                        # Button, OptionCard, ProgressBar, StopCard, WalkConnector
│   │   ├── auth/                      # AuthScreen, ForgotPasswordScreen
│   │   ├── providers/                 # AuthProvider (user + profile + session context)
│   │   ├── shared/                    # NeighborhoodPicker (used by onboarding + questionnaire)
│   │   ├── landing/                   # Hero
│   │   ├── home/                      # HomeScreen (signed-in landing + saved plans)
│   │   ├── onboarding/               # OnboardingFlow (name + context + prefs + neighborhoods)
│   │   ├── questionnaire/             # Shell + step components (Standard, Neighborhood, When)
│   │   └── itinerary/                 # CompositionHeader, ItineraryView, ActionBar, TextMessageShare
│   ├── lib/
│   │   ├── supabase.ts                # Anon Supabase client (venue reads, no auth)
│   │   ├── supabase/browser.ts        # Browser auth-aware client (@supabase/ssr)
│   │   ├── supabase/server.ts         # Server auth-aware client for Route Handlers
│   │   ├── auth.ts                    # Sign in / sign up / reset-password / profile helpers
│   │   ├── scoring.ts                 # Per-venue scoring + filters + per-role pick (with proximity)
│   │   ├── composer.ts                # planStopMix + composeItinerary (multi-stop assembly)
│   │   ├── weather.ts                 # OpenWeatherMap fetch + rain/snow classification
│   │   ├── geo.ts                     # Haversine + Manhattan grid correction + Maps URL builder
│   │   ├── claude.ts                  # Gemini API call + graceful fallback
│   │   ├── sharing.ts                 # URL param encode/decode for share links
│   │   └── questionnaireReducer.ts    # Questionnaire state machine
│   ├── config/
│   │   ├── options.ts                 # Questionnaire step definitions
│   │   ├── prompts.ts                 # Gemini system prompt + generation prompt builder
│   │   ├── durations.ts              # Duration presets + resolveTimeWindow
│   │   ├── onboarding.ts              # Onboarding option definitions + CONTEXT_TO_OCCASION
│   │   └── storage.ts                 # sessionStorage keys (page-to-page flight state only)
│   └── types/
│       └── index.ts                   # Shared TypeScript types
├── supabase/
│   └── seed.sql                       # Schema + seed venues
├── public/                            # Static assets
├── .github/
│   └── pull_request_template.md       # PR template (auto-loaded by GitHub on PR open)
├── CLAUDE.md                          # Project rules and conventions (loaded by Claude Code)
├── CONTRIBUTING.md                    # Branch workflow and contributor rules
└── README.md
```

---

## How itinerary generation works

`/api/generate` (POST) is the only generation endpoint. It runs server-side. The client never calls Supabase, OpenWeatherMap, or Gemini directly.

For the full architecture map see [ALGORITHM.md](ALGORITHM.md). Tunable constants live in `src/config/algorithm.ts`. Quick summary:

1. **User preferences** (name, drinks) read server-side from `composer_users` via `getServerSupabase()`.
2. **Parallel fetch:** weather + all active venues from `composer_venues_v2`.
3. **Hard filters** in route.ts: exclude IDs (graceful trim) → drinks=no → time block coverage → closed status → budget tier (with widening).
4. **Seeded PRNG:** request inputs hashed via FNV-1a → Mulberry32 PRNG. Same inputs → same picks (`src/lib/itinerary/seed.ts`).
5. **planStopMix** picks a vibe-specific template from `src/config/templates.ts`. Each slot has a canonical role and an optional `venueRoleHint` (e.g., drinks-led opener prefers a `drinks` venue).
6. **`pickBestForRole`** in `src/lib/scoring.ts` cascade-relaxes: strict (with hint) → drop hint → drop neighborhood. Proximity to Main is always hard-capped (1.5km normal, 0.4km bad weather).
7. **Weighted scoring** (all weights from `ALGORITHM.weights`):
   - Vibe match: 10–35 (exact canonical tag matching)
   - Occasion: 15 · Budget: 15 · Neighborhood: 10
   - Time relevance: 0–10 (`blockCoverageFraction`: 1.0/0.5/0.0 based on per-day vs global block data)
   - Quality: 0–10 · Curation boost: variable · Google rating: 0–5
   - Category duplicate penalty: -20 (applied when candidate's category matches a stop already in the itinerary)
8. **Weighted top-N pick:** instead of always #1, samples from top 5 with weights `[5,4,3,2,1]`. Falls back to deterministic top-1 when `jitter === 0`.
9. **composeItinerary** picks Main first as the geographic anchor, then fills the rest of the pattern. Plan B = scored[1] from each non-Main pick.
10. **Gemini polish layer** writes the composition title, subtitle, and per-venue notes. Fails open: raw `curation_note` from DB if Gemini errors.
11. **Resy enrichment** runs post-composition. Each stop with a Resy ID gets a slot lookup; failures degrade to "unconfirmed" status without blocking the itinerary.

---

## Architecture principles

These are enforced by [CLAUDE.md](CLAUDE.md). Read that file for the full rule set; this is a summary.

- **Generation is a single API route.** Client posts answers, gets back a complete itinerary. No client-side Supabase, weather, or AI calls.
- **Scoring lives in `lib/scoring.ts`, composition in `lib/composer.ts`.** Never inline scoring or composition logic in the API route or components.
- **Weather is stateless.** Per-request, no cache layer — itineraries reflect actual current conditions.
- **Gemini is the polish layer, not the core.** Venue selection happens first; Gemini shapes the copy. If Gemini fails, the itinerary still renders with DB notes.
- **The vibe tag contract is locked.** Exact canonical tag matching only. No fuzzy or substring matching.
- **No file over 250 lines.** Split if needed.
- **No `any`, no `ts-ignore`, no default exports** outside Next.js page files.
- **Mobile-first.** Every UI decision works on a phone screen first.

---

## Venue database

Venues live in the `composer_venues_v2` table in Supabase (the v1 `composer_venues` is deprecated). **Every venue is human-curated — no AI-generated entries.** The curation layer is the product.

Venues are managed in a Google Sheet (current ID: `1EdJqvFKaGAAo5oKMXBXeXfZdzfdT9IsmLiQYA9whXVg`) and synced to Supabase via the canonical importer at `src/lib/venues/`. Two surfaces:

- **CLI** (`npm run import-venues -- dry-run|apply|history|show`) for engineer-driven imports with full visibility into the diff and audit trail
- **Admin UI** at `/profile` for the operator-facing preview→apply flow

Both go through the same module, hit the same Postgres function (`composer_apply_venue_import`), and record every apply attempt to `composer_import_runs`. See [CLAUDE.md → Updating Venue Data](CLAUDE.md#updating-venue-data) for the full workflow.

Full schema in [`supabase/migrations/20260428_composer_venues_v2.sql`](supabase/migrations/20260428_composer_venues_v2.sql). Highlights:

- **`venue_id`** — sheet identifier, used as upsert conflict key
- **`google_place_id`** — stable canonical identifier; used as join key for image_keys snapshot/restore (NOT `venue_id`)
- **`image_keys`** — Supabase Storage paths for venue photos. **Not in the sheet** — populated by `scripts/backfill_venue_photos_v2.py`. Excluded from importer's column list, so it survives upserts. Snapshotted before any TRUNCATE.
- **Per-day blocks** (`mon_blocks`, `tue_blocks`, ..., `sun_blocks`) — override global `time_blocks` via the hybrid rule in `venueOpenForBlock()`

### Canonical taxonomy

All taxonomy lists are auto-generated from the Google Sheet's Master Reference tab via `npm run generate-configs`. Files in `src/config/generated/` are auto-generated — never edit by hand.

Display labels live in the wrappers and override the generated values:
- `src/config/vibes.ts` — `Meal`, `Drinks`, `Activity`, `Stroll`, `Variety`
- `src/config/budgets.ts` — `Casual`, `Solid`, `Splurge`, `All Out`, `No Preference`

### Neighborhood slugs

Always snake_case. The picker shows 25 user-facing groups (Manhattan: 15, Brooklyn: 7, Queens: 2, Bronx/SI: 1) maintained as a constant in `scripts/generate-configs.py`. Each group expands to 1+ storage slugs. Groups with `venueCount < 50` are hidden from the picker.

Storage slug examples: `west_village`, `east_village`, `soho_nolita`, `williamsburg`, `midtown_west`, `upper_west_side`, `flatiron`, `nomad`, `bushwick`.

---

## Local development

### Prerequisites

- **Node.js 20+** (project tests against 20.19+ / 22.13+ / 24+)
- **npm**
- A **Supabase** account (Composer project)
- A **Google AI Studio** account for a Gemini API key
- An **OpenWeatherMap** account, free tier (note: new keys take up to 2 hours to activate)

### Setup

```bash
git clone git@github.com:aryaadit/composer.git
cd composer
npm install
```

Create `.env.local` in the project root:

```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_publishable_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
GEMINI_API_KEY=your_gemini_api_key
OPENWEATHERMAP_API_KEY=your_openweathermap_key

# Sheet sync (admin-only)
GOOGLE_SHEETS_CLIENT_EMAIL=service_account_email
GOOGLE_SHEETS_PRIVATE_KEY=service_account_private_key
GOOGLE_SHEET_ID=1EdJqvFKaGAAo5oKMXBXeXfZdzfdT9IsmLiQYA9whXVg

# Optional
GOOGLE_PLACES_API_KEY=your_google_places_key
MAPBOX_ACCESS_TOKEN=your_mapbox_token
```

Run the seed SQL in your Supabase project (Dashboard → SQL Editor):

```
supabase/seed.sql
```

Start the dev server:

```bash
npm run dev
```

Visit `http://localhost:3000`.

### Available scripts

| Command | What it does |
|---------|-------------|
| `npm run dev` | Start the dev server with Turbopack on `localhost:3000` |
| `npm run build` | Production build |
| `npm run start` | Run the production build locally |
| `npm run lint` | ESLint over the project |
| `npx tsc --noEmit` | TypeScript check (no emit) |
| `npx vitest run` | Run the unit test suite |
| `npm run generate-configs` | Regenerate `src/config/generated/*.ts` from the Google Sheet's Master Reference tab |
| `npm run import-venues -- dry-run` | Read the source sheet, run sanity assertions, print diff. No writes. |
| `npm run import-venues -- apply` | Apply the diff atomically — sanity checks + threshold guard + audit trail |
| `npm run import-venues -- history [--status …] [--limit N]` | Recent runs from `composer_import_runs` |
| `npm run import-venues -- show <id>` | Full detail for one run (counts, assertions, diff payload) |
| `python3 scripts/snapshot_image_keys.py` | Snapshot `image_keys` to CSV before a wipe-and-replace import |
| `python3 scripts/restore_image_keys.py SNAPSHOT.csv` | Restore `image_keys` after wipe-and-replace import |
| `python3 scripts/backfill_price_tier.py` | Backfill null `price_tier` from Google Places `priceLevel` |

For the full venue update workflow (sheet → configs → import → verify), see **CLAUDE.md → Venue Database Rules**.

`npx tsc --noEmit` and `npm run lint` must both pass before opening a PR.

---

## Environment variables

| Variable | Where to get it | Required |
|----------|----------------|----------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API → Project URL | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API → Publishable / anon key | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → service_role key | Yes |
| `GEMINI_API_KEY` | aistudio.google.com → API Keys | Yes |
| `OPENWEATHERMAP_API_KEY` | openweathermap.org → API Keys (allow up to 2h to activate) | Yes |
| `GOOGLE_SHEETS_CLIENT_EMAIL` | Service account in GCP project | Sheet sync |
| `GOOGLE_SHEETS_PRIVATE_KEY` | Service account JSON key | Sheet sync |
| `GOOGLE_SHEET_ID` | Venue sheet URL | Sheet sync |
| `GOOGLE_PLACES_API_KEY` | GCP — Maps Platform | Photo + price-tier backfills |
| `MAPBOX_ACCESS_TOKEN` | mapbox.com → Account → Access tokens | Optional (static walk maps) |

> **Production env vars must be set separately in the Vercel project dashboard.** Vercel does not read your local `.env.local`. If a value is missing in Vercel, the server will silently fall back: a missing `OPENWEATHERMAP_API_KEY` disables the weather gate (logged as a `[weather]` warning), and a missing `GEMINI_API_KEY` causes the copy generation to fall back to raw DB notes (logged as a `[gemini]` warning). Both fallbacks degrade gracefully — the itinerary still renders.

---

## Contributing

This repo uses a branch-and-PR workflow. Full process and rules in [CONTRIBUTING.md](CONTRIBUTING.md). Quick summary:

- Branch naming: `adit/feature-name` or `reid/feature-name`
- Pull `main` before starting, work on a branch, push, open a PR
- The other founder reviews and merges
- Merging to `main` auto-deploys to production via Vercel
- Never commit or push directly to `main`
- Every PR auto-loads the [PR template](.github/pull_request_template.md) — fill it out

`npx tsc --noEmit` and `npm run lint` must pass before opening a PR.

---

## Deployment

Composer is deployed on Vercel. Every push to `main` triggers an automatic production deployment to `composer.onpalate.com`. Every PR gets a preview deployment URL.

Production environment variables must be configured in the Vercel project settings — they are **not** read from `.env.local`. When the venue sheet ID changes, BOTH `.env.local` AND the Vercel `GOOGLE_SHEET_ID` env var must be updated (followed by a redeploy).

To monitor production: check Vercel → Logs for `[gemini]` and `[weather]` warnings, which surface fallback paths and missing credentials.

---

## Health check

`GET /api/health` returns a JSON report verifying the three layers Composer depends on. Use it after a deploy, or any time you want to confirm production is wired up end-to-end.

Hit it in a browser or with `curl`:

```bash
curl https://composer.onpalate.com/api/health
# or locally:
curl http://localhost:3000/api/health
```

Response shape:

```json
{
  "ok": true,
  "timestamp": "2026-04-13T21:45:12.104Z",
  "checks": {
    "supabase": { "ok": true, "active_venue_count": 495 },
    "scoring":  {
      "ok": true,
      "input": { "occasion": "first-date", "neighborhoods": ["west_village"], "budget": "nice_out", "vibe": "food_forward", "day": "2026-04-13", "startTime": "18:00", "endTime": "22:00" },
      "hard_filtered": 37,
      "scored": 37,
      "top3": [
        { "name": "Via Carota", "neighborhood": "west_village", "price_tier": 2, "score": 87.2 },
        { "name": "I Sodi",     "neighborhood": "west_village", "price_tier": 3, "score": 82.4 },
        { "name": "Buvette",    "neighborhood": "west_village", "price_tier": 2, "score": 79.1 }
      ]
    },
    "gemini":   { "ok": true, "latency_ms": 412, "response": "OK" }
  }
}
```

What each check does:

1. **Supabase** — counts active rows in `composer_venues`. Fails loud if the DB is unreachable or empty.
2. **Scoring** — runs the real scorer against a fixed test input (first-date · West Village · nice_out · food_forward · 6pm–10pm) with jitter disabled for determinism. Reports how many venues cleared the hard filter, how many scored, and the top three with their scores. Catches silent regressions in the scoring pipeline that unit tests wouldn't notice.
3. **Gemini** — sends a minimal "Reply with the word OK" prompt to `gemini-2.5-flash` with thinking disabled and an 8-second timeout. Reports round-trip latency and the first 40 chars of the response.

The endpoint always returns HTTP 200 — inspect the top-level `ok` plus per-check flags. It never returns secrets, env vars, or full error stacks; only counts, names, scores, latency, and short error messages. Read-only: no writes, no weather call, no copy generation.

---

## Documentation

| File | Audience | Purpose |
|------|----------|---------|
| [README.md](README.md) | Everyone | What you're reading now |
| [CLAUDE.md](CLAUDE.md) | Claude Code + humans | Project rules, conventions, architectural principles, and design system |
| [ALGORITHM.md](ALGORITHM.md) | Engineers | Itinerary generation pipeline architecture |
| [BRAND_VOICE.md](BRAND_VOICE.md) | Anyone writing copy | Voice principles and copy library |
| [CODING_STANDARDS.md](CODING_STANDARDS.md) | Engineers | Source-of-truth + canonical-module rules |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Contributors | Branch workflow and contributor rules |
| [.github/pull_request_template.md](.github/pull_request_template.md) | GitHub | Auto-loaded PR template |

---

## Roadmap

### MVP (current)

- Phone OTP auth via Twilio (default), email/password as alternative
- Three-step onboarding (name → context → drinks/dietary)
- Five-step questionnaire (occasion → neighborhoods → budget → vibe → when)
- 2-to-4 stop itineraries with vibe-driven templates and walk routing
- Deterministic seeded picks — same inputs reproduce the same itinerary
- Resy availability + booking deep-links per stop
- Plan B alternatives, weather gate, share-as-link
- Saved itineraries (server-side, per user)
- Profile page with inline-editable preferences (server-validated via `PATCH /api/profile`)
- Admin section (sync venues, venue lookup, health check)
- 25-group neighborhood taxonomy across Manhattan, Brooklyn, Queens, and Bronx/SI

### Phase 2 (not yet building)

- Community venue submissions
- Live integrations: Google Places / Resy / OpenTable
- Native reservation booking
- Implicit preference learning from saved plans
- iOS app via Capacitor
- Monetization: venue partnerships, premium tier

---

## Part of the Palate family

Composer is one of several products under the [Palate](https://onpalate.com) brand — a long-term vision for a unified taste profile platform.

- **Pour Decisions** — drink logging and social discovery → [App Store](https://apps.apple.com/us/app/barkeeply/id6756134353)
- **Composer** — date night itinerary generator → [composer.onpalate.com](https://composer.onpalate.com)
- **AUX** — social music discovery → coming soon
